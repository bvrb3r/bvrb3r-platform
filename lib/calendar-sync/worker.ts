import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  CALENDAR_BUSY_CACHE_MINUTES,
  CALENDAR_SYNC_POLL_MINUTES,
  CalendarSyncError,
  buildBusyBlockHash,
  buildCalendarLoopTag,
  hashCalendarCapability
} from "@/lib/calendar-sync/domain";
import { replaceCalendarBusyBlocks } from "@/lib/calendar-sync/busy-store";
import {
  deleteGoogleCalendarEvent,
  queryGoogleFreeBusy,
  refreshGoogleAccessToken,
  upsertGoogleCalendarEvent
} from "@/lib/calendar-sync/providers/google";
import { listSquareBookings, refreshSquareAccessToken, type SquareBooking } from "@/lib/calendar-sync/providers/square";
import { decryptCalendarSecret, encryptCalendarSecret } from "@/lib/calendar-sync/secrets";
import type { GoogleConnectionRow, SquareConnectionRow } from "@/lib/calendar-sync/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type TriggerSource = "manual" | "schedule" | "webhook" | "appointment";
type CalendarConnectionTable = "square_connections" | "google_calendar_connections";

const CALENDAR_CONNECTION_LEASE_MS = 4 * 60 * 1000;
const CALENDAR_JOB_LEASE_MS = 4 * 60 * 1000;

type CalendarConnectionLeaseBusy = {
  skipped: true;
  skipReason: "lease_busy";
};

type AppointmentRow = {
  id: string;
  barber_id: string;
  client_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  source_provider: string;
  updated_at?: string;
};

export type SquareMappingOptions = {
  locations: Array<{
    id: string;
    label: string;
  }>;
  teamMembers: Array<{
    id: string;
    label: string;
    appointmentCount: number;
  }>;
};

function getAdminClient() {
  const client = createSupabaseAdminClient();
  if (!client) {
    throw new CalendarSyncError("Calendar sync data services are unavailable.", 503, "calendar_data_unavailable");
  }
  return client;
}

function nextPollAt() {
  return new Date(Date.now() + CALENDAR_SYNC_POLL_MINUTES * 60 * 1000).toISOString();
}

function safeErrorCode(error: unknown) {
  return error instanceof CalendarSyncError ? error.code : "calendar_sync_failed";
}

function isConnectionLeaseBusy(value: unknown): value is CalendarConnectionLeaseBusy {
  return Boolean(
    value
    && typeof value === "object"
    && "skipReason" in value
    && value.skipReason === "lease_busy"
  );
}

async function runWithConnectionLease<T>(input: {
  admin: AdminClient;
  table: CalendarConnectionTable;
  connectionId: string;
  requireDue: boolean;
  task: (leaseToken: string) => Promise<T>;
}): Promise<T | CalendarConnectionLeaseBusy> {
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseToken = randomUUID();
  const leaseUntil = new Date(now.getTime() + CALENDAR_CONNECTION_LEASE_MS).toISOString();
  let claim = input.admin.from(input.table).update({
    sync_lease_token: leaseToken,
    sync_lease_until: leaseUntil,
    updated_at: nowIso
  })
    .eq("id", input.connectionId)
    .in("status", ["active", "degraded"])
    .or(`sync_lease_until.is.null,sync_lease_until.lt.${nowIso}`);
  if (input.requireDue) claim = claim.lte("next_poll_at", nowIso);
  const claimed = await claim.select("id").maybeSingle();
  if (claimed.error) {
    throw new CalendarSyncError("Unable to claim calendar provider work.", 500, "calendar_connection_claim_failed");
  }
  if (!claimed.data) {
    return { skipped: true, skipReason: "lease_busy" };
  }

  try {
    return await input.task(leaseToken);
  } finally {
    await input.admin.from(input.table).update({
      sync_lease_token: null,
      sync_lease_until: null,
      updated_at: new Date().toISOString()
    })
      .eq("id", input.connectionId)
      .eq("sync_lease_token", leaseToken);
  }
}

async function createRun(admin: AdminClient, input: {
  provider: "square" | "google";
  connectionId: string;
  barberId: string;
  direction: "import" | "export" | "freebusy";
  trigger: TriggerSource;
}) {
  const result = await admin.from("calendar_sync_runs").insert({
    provider: input.provider,
    connection_id: input.connectionId,
    barber_id: input.barberId,
    direction: input.direction,
    status: "running",
    trigger_source: input.trigger
  }).select("id").single();
  if (result.error || !result.data) {
    throw new CalendarSyncError("Unable to record calendar sync evidence.", 500, "calendar_run_create_failed");
  }
  return (result.data as { id: string }).id;
}

async function finishRun(admin: AdminClient, runId: string, input: {
  status: "succeeded" | "failed";
  importedCount?: number;
  exportedCount?: number;
  busyBlockCount?: number;
  conflictCount?: number;
  errorCode?: string | null;
}) {
  const result = await admin.from("calendar_sync_runs").update({
    status: input.status,
    imported_count: input.importedCount ?? 0,
    exported_count: input.exportedCount ?? 0,
    busy_block_count: input.busyBlockCount ?? 0,
    conflict_count: input.conflictCount ?? 0,
    error_code: input.errorCode ?? null,
    finished_at: new Date().toISOString()
  }).eq("id", runId).select("id").maybeSingle();
  if (result.error || !result.data) {
    throw new CalendarSyncError("Unable to finish calendar sync evidence.", 500, "calendar_run_finish_failed");
  }
}

async function requireLeaseMutation(
  query: PromiseLike<{ data: unknown; error: { message?: string } | null }>,
  message: string,
  errorCode: string
) {
  const result = await query;
  if (result.error) {
    throw new CalendarSyncError(message, 500, errorCode);
  }
  if (!result.data) {
    throw new CalendarSyncError(
      "Calendar connection changed while provider work was running. Retry from the current connection state.",
      409,
      "calendar_connection_lease_lost"
    );
  }
}

async function ensureSquareAccessToken(admin: AdminClient, connection: SquareConnectionRow, leaseToken: string) {
  const refreshBefore = Date.now() + 7 * 24 * 60 * 60 * 1000;
  if (Date.parse(connection.token_expires_at) > refreshBefore) {
    return decryptCalendarSecret(connection.access_token_ciphertext);
  }
  const refreshed = await refreshSquareAccessToken(decryptCalendarSecret(connection.refresh_token_ciphertext));
  await requireLeaseMutation(admin.from("square_connections").update({
    access_token_ciphertext: encryptCalendarSecret(refreshed.accessToken),
    refresh_token_ciphertext: encryptCalendarSecret(refreshed.refreshToken),
    token_expires_at: refreshed.expiresAt,
    updated_at: new Date().toISOString()
  })
    .eq("id", connection.id)
    .eq("sync_lease_token", leaseToken)
    .in("status", ["active", "degraded"])
    .select("id")
    .maybeSingle(), "Unable to persist the refreshed Square credential.", "square_token_save_failed");
  return refreshed.accessToken;
}

function squareTeamMemberIds(booking: SquareBooking) {
  return Array.from(new Set((booking.appointment_segments ?? []).flatMap((segment) => segment.team_member_id ? [segment.team_member_id] : [])));
}

async function resolveCalendarBarber(admin: AdminClient, user: UserAccount) {
  const result = await admin.from("barbers").select("id").eq("profile_id", user.id).maybeSingle();
  if (result.error || !result.data) {
    throw new CalendarSyncError("Finish Barber setup before mapping a calendar.", 409, "calendar_barber_setup_required");
  }
  return (result.data as { id: string }).id;
}

async function loadSquareConnection(admin: AdminClient, connectionId: string) {
  const result = await admin
    .from("square_connections")
    .select("id, barber_id, location_id, square_merchant_id, square_team_member_id, account_label, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, granted_scopes, status, last_sync_at, last_success_at, last_error_code, next_poll_at, disconnected_at")
    .eq("id", connectionId)
    .maybeSingle();
  if (result.error || !result.data) {
    throw new CalendarSyncError("Square Calendar connection was not found.", 404, "square_connection_not_found");
  }
  return result.data as SquareConnectionRow;
}

async function readEligibleSquareLocations(admin: AdminClient, profileId: string) {
  const staffResult = await admin.from("staff_locations")
    .select("location_id")
    .eq("profile_id", profileId);
  if (staffResult.error) {
    throw new CalendarSyncError("Unable to load eligible BVRB3R calendar locations.", 500, "square_mapping_location_read_failed");
  }
  const locationIds = Array.from(new Set(((staffResult.data ?? []) as Array<{ location_id: string }>).map((row) => row.location_id)));
  if (!locationIds.length) return [];
  const locationsResult = await admin.from("locations")
    .select("id, name, address, city, state")
    .in("id", locationIds)
    .order("name", { ascending: true });
  if (locationsResult.error) {
    throw new CalendarSyncError("Unable to load eligible BVRB3R calendar locations.", 500, "square_mapping_location_read_failed");
  }
  return ((locationsResult.data ?? []) as Array<{
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
  }>).map((location) => ({
    id: location.id,
    label: [location.name, location.address, [location.city, location.state].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join(" · ")
  }));
}

async function readSquareTeamCandidates(admin: AdminClient, connection: SquareConnectionRow, leaseToken: string) {
  const accessToken = await ensureSquareAccessToken(admin, connection, leaseToken);
  const startsAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  const bookings = await listSquareBookings({ accessToken, startsAt, endsAt });
  const counts = new Map<string, number>();
  for (const booking of bookings) {
    for (const teamMemberId of squareTeamMemberIds(booking)) {
      counts.set(teamMemberId, (counts.get(teamMemberId) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([id, appointmentCount]) => ({
    id,
    // APPOINTMENTS_READ exposes the scheduling identifier but not the staff
    // directory/name scope. Show an honest opaque identifier instead of asking
    // for broader Square permissions.
    label: `Square staff · ${id.slice(-8)}`,
    appointmentCount
  })).sort((left, right) => right.appointmentCount - left.appointmentCount || left.id.localeCompare(right.id));
}

function mapSquareStatus(status: string | undefined) {
  if (status === "CANCELLED_BY_CUSTOMER" || status === "CANCELLED_BY_SELLER" || status === "CANCELLED") return "canceled";
  if (status === "NO_SHOW") return "no_show";
  if (status === "ACCEPTED") return "confirmed";
  return "booked";
}

function squareClientLabel(booking: SquareBooking) {
  if (!booking.customer_id) return "Square client";
  return `Square client · ${booking.customer_id.slice(-4)}`;
}

function squareServiceLabel(booking: SquareBooking) {
  const named = booking.appointment_segments?.map((segment) => segment.service_variation_name?.trim()).find(Boolean);
  return named || "Square appointment";
}

async function syncSquareConnectionWithLease(connectionId: string, trigger: TriggerSource, leaseToken: string) {
  const admin = getAdminClient();
  const connection = await loadSquareConnection(admin, connectionId);
  if (connection.status === "disconnected") return { imported: 0, skipped: true };
  const runId = await createRun(admin, {
    provider: "square",
    connectionId,
    barberId: connection.barber_id,
    direction: "import",
    trigger
  });
  const attemptedAt = new Date().toISOString();
  try {
    if (!connection.location_id) {
      throw new CalendarSyncError("Choose a BVRB3R location before importing Square appointments.", 409, "square_location_mapping_required");
    }
    if (!connection.square_team_member_id) {
      throw new CalendarSyncError("Choose the matching Square staff calendar before importing appointments.", 409, "square_team_mapping_required");
    }
    const accessToken = await ensureSquareAccessToken(admin, connection, leaseToken);
    const startsAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();
    const bookings = await listSquareBookings({ accessToken, startsAt, endsAt });
    const teamMemberId = connection.square_team_member_id;
    const scopedBookings = bookings.filter((booking) => squareTeamMemberIds(booking).includes(teamMemberId));
    const rows = scopedBookings.map((booking) => {
      const startTime = Date.parse(booking.start_at);
      const durationMinutes = (booking.appointment_segments ?? []).reduce((total, segment) => total + Math.max(segment.duration_minutes ?? 0, 0), 0);
      if (!booking.id || !Number.isFinite(startTime) || durationMinutes <= 0) {
        throw new CalendarSyncError(
          "Square returned an invalid appointment; last-known calendar truth was preserved.",
          502,
          "square_booking_invalid"
        );
      }
      return {
        provider: "square",
        provider_appointment_id: booking.id,
        location_id: connection.location_id,
        barber_id: connection.barber_id,
        starts_at: new Date(startTime).toISOString(),
        ends_at: new Date(startTime + durationMinutes * 60 * 1000).toISOString(),
        service_name: squareServiceLabel(booking),
        client_display_name: squareClientLabel(booking),
        status: mapSquareStatus(booking.status),
        payment_owner: "external:square",
        provider_data_restricted: true,
        imported_at: attemptedAt,
        source_updated_at: booking.updated_at ?? attemptedAt,
        updated_at: attemptedAt,
        metadata: {
          pr33_source: "square_appointments_read_only",
          source_status: booking.status ?? "UNKNOWN",
          square_location_id: booking.location_id ?? null
        }
      };
    });
    const remoteIds = new Set(scopedBookings.map((booking) => booking.id));
    const [existingResult, internalResult] = await Promise.all([
      admin.from("chairsync_appointments")
        .select("id, provider_appointment_id")
        .eq("provider", "square")
        .eq("barber_id", connection.barber_id)
        .gte("ends_at", startsAt)
        .lte("starts_at", endsAt)
        .in("status", ["booked", "confirmed", "checked_in"]),
      admin.from("appointments")
        .select("starts_at, ends_at, status")
        .eq("barber_id", connection.barber_id)
        .eq("source_provider", "bvrb3r")
        .gte("ends_at", startsAt)
        .lte("starts_at", endsAt)
    ]);
    if (existingResult.error || internalResult.error) {
      throw new CalendarSyncError("Unable to reconcile removed Square appointments.", 500, "square_import_reconcile_failed");
    }
    const internalAppointments = ((internalResult.data ?? []) as Array<{
      starts_at: string;
      ends_at: string;
      status: string;
    }>).filter((appointment) => !["cancelled", "no_show"].includes(appointment.status));
    const conflictCount = rows.filter((row) =>
      ["booked", "confirmed", "checked_in"].includes(row.status)
      && internalAppointments.some((appointment) =>
        Date.parse(appointment.starts_at) < Date.parse(row.ends_at)
        && Date.parse(appointment.ends_at) > Date.parse(row.starts_at)
      )
    ).length;
    const missingIds = ((existingResult.data ?? []) as Array<{ id: string; provider_appointment_id: string }>)
      .filter((row) => !remoteIds.has(row.provider_appointment_id))
      .map((row) => row.id);
    // Persist the complete provider snapshot before retiring anything. If the
    // upsert fails, existing read-only appointments remain intact and continue
    // to block availability rather than being canceled from a partial refresh.
    if (rows.length) {
      const upsert = await admin.from("chairsync_appointments").upsert(rows, {
        onConflict: "provider,provider_appointment_id"
      });
      if (upsert.error) {
        throw new CalendarSyncError("Unable to store Square appointments.", 500, "square_import_save_failed");
      }
    }
    if (missingIds.length) {
      const cancelMissing = await admin.from("chairsync_appointments").update({
        status: "canceled",
        source_updated_at: attemptedAt,
        updated_at: attemptedAt
      }).in("id", missingIds);
      if (cancelMissing.error) {
        throw new CalendarSyncError("Unable to reconcile removed Square appointments.", 500, "square_import_reconcile_failed");
      }
    }
    const successAt = new Date().toISOString();
    await requireLeaseMutation(admin.from("square_connections").update({
      status: "active",
      last_sync_at: attemptedAt,
      last_success_at: successAt,
      last_error_code: null,
      next_poll_at: nextPollAt(),
      updated_at: successAt
    })
      .eq("id", connection.id)
      .eq("sync_lease_token", leaseToken)
      .in("status", ["active", "degraded"])
      .select("id")
      .maybeSingle(), "Unable to record Square sync health.", "square_health_save_failed");
    await finishRun(admin, runId, { status: "succeeded", importedCount: rows.length, conflictCount });
    return { imported: rows.length, skipped: false };
  } catch (error) {
    const errorCode = safeErrorCode(error);
    await Promise.all([
      admin.from("square_connections").update({
        status: "degraded",
        last_sync_at: attemptedAt,
        last_error_code: errorCode,
        next_poll_at: nextPollAt(),
        updated_at: new Date().toISOString()
      })
        .eq("id", connection.id)
        .eq("sync_lease_token", leaseToken)
        .in("status", ["active", "degraded"]),
      finishRun(admin, runId, { status: "failed", errorCode })
    ]);
    throw error;
  }
}

export async function syncSquareConnection(connectionId: string, trigger: TriggerSource = "schedule") {
  const admin = getAdminClient();
  return runWithConnectionLease({
    admin,
    table: "square_connections",
    connectionId,
    requireDue: trigger === "schedule",
    task: (leaseToken) => syncSquareConnectionWithLease(connectionId, trigger, leaseToken)
  });
}

export async function getSquareMappingOptionsForUser(user: UserAccount): Promise<SquareMappingOptions> {
  const admin = getAdminClient();
  const barberId = await resolveCalendarBarber(admin, user);
  const connectionResult = await admin.from("square_connections")
    .select("id")
    .eq("barber_id", barberId)
    .in("status", ["active", "degraded"])
    .maybeSingle();
  if (connectionResult.error || !connectionResult.data) {
    throw new CalendarSyncError("Connect Square Appointments before choosing a mapping.", 409, "square_connection_required");
  }
  const connectionId = (connectionResult.data as { id: string }).id;
  const [locations, candidateResult] = await Promise.all([
    readEligibleSquareLocations(admin, user.id),
    runWithConnectionLease({
      admin,
      table: "square_connections",
      connectionId,
      requireDue: false,
      task: async (leaseToken) => {
        const connection = await loadSquareConnection(admin, connectionId);
        return readSquareTeamCandidates(admin, connection, leaseToken);
      }
    })
  ]);
  if (isConnectionLeaseBusy(candidateResult)) {
    throw new CalendarSyncError("Square Calendar is already syncing. Retry mapping in a moment.", 409, "calendar_connection_busy");
  }
  return { locations, teamMembers: candidateResult };
}

export async function saveSquareMappingForUser(input: {
  user: UserAccount;
  locationId: string;
  teamMemberId: string;
}) {
  const admin = getAdminClient();
  const barberId = await resolveCalendarBarber(admin, input.user);
  const [staffLocation, connectionResult] = await Promise.all([
    admin.from("staff_locations")
      .select("location_id")
      .eq("profile_id", input.user.id)
      .eq("location_id", input.locationId)
      .maybeSingle(),
    admin.from("square_connections")
      .select("id")
      .eq("barber_id", barberId)
      .in("status", ["active", "degraded"])
      .maybeSingle()
  ]);
  if (staffLocation.error || !staffLocation.data) {
    throw new CalendarSyncError("Choose one of your eligible BVRB3R locations.", 403, "square_mapping_location_forbidden");
  }
  if (connectionResult.error || !connectionResult.data) {
    throw new CalendarSyncError("Connect Square Appointments before choosing a mapping.", 409, "square_connection_required");
  }
  const connectionId = (connectionResult.data as { id: string }).id;
  const saved = await runWithConnectionLease({
    admin,
    table: "square_connections",
    connectionId,
    requireDue: false,
    task: async (leaseToken) => {
      const connection = await loadSquareConnection(admin, connectionId);
      const candidates = await readSquareTeamCandidates(admin, connection, leaseToken);
      if (!candidates.some((candidate) => candidate.id === input.teamMemberId)) {
        throw new CalendarSyncError(
          "That Square staff calendar was not returned by this connection's appointment-read scope.",
          403,
          "square_mapping_team_forbidden"
        );
      }
      await requireLeaseMutation(admin.from("square_connections").update({
        location_id: input.locationId,
        square_team_member_id: input.teamMemberId,
        status: "degraded",
        last_error_code: "square_initial_sync_required",
        next_poll_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
        .eq("id", connectionId)
        .eq("barber_id", barberId)
        .eq("sync_lease_token", leaseToken)
        .in("status", ["active", "degraded"])
        .select("id")
        .maybeSingle(), "Unable to save the Square calendar mapping.", "square_mapping_save_failed");
      return { saved: true as const };
    }
  });
  if (isConnectionLeaseBusy(saved)) {
    throw new CalendarSyncError("Square Calendar is already syncing. Retry mapping in a moment.", 409, "calendar_connection_busy");
  }
  return saved;
}

async function ensureGoogleAccessToken(admin: AdminClient, connection: GoogleConnectionRow, leaseToken: string) {
  if (Date.parse(connection.token_expires_at) > Date.now() + 5 * 60 * 1000) {
    return decryptCalendarSecret(connection.access_token_ciphertext);
  }
  if (!connection.refresh_token_ciphertext) {
    throw new CalendarSyncError("Reconnect Google Calendar to renew access.", 409, "google_refresh_token_missing");
  }
  const refreshed = await refreshGoogleAccessToken(decryptCalendarSecret(connection.refresh_token_ciphertext));
  await requireLeaseMutation(admin.from("google_calendar_connections").update({
    access_token_ciphertext: encryptCalendarSecret(refreshed.accessToken),
    token_expires_at: refreshed.expiresAt,
    updated_at: new Date().toISOString()
  })
    .eq("id", connection.id)
    .eq("sync_lease_token", leaseToken)
    .in("status", ["active", "degraded"])
    .select("id")
    .maybeSingle(), "Unable to persist the refreshed Google credential.", "google_token_save_failed");
  return refreshed.accessToken;
}

async function loadGoogleConnection(admin: AdminClient, connectionId: string) {
  const result = await admin
    .from("google_calendar_connections")
    .select("id, barber_id, account_label, bvrb3r_calendar_id_ciphertext, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, granted_scopes, write_enabled, freebusy_enabled, status, last_push_at, last_busy_sync_at, last_success_at, last_error_code, next_poll_at, disconnected_at")
    .eq("id", connectionId)
    .maybeSingle();
  if (result.error || !result.data) {
    throw new CalendarSyncError("Google Calendar connection was not found.", 404, "google_connection_not_found");
  }
  return result.data as GoogleConnectionRow;
}

async function loadAppointmentLabels(admin: AdminClient, appointments: AppointmentRow[]) {
  const clientIds = Array.from(new Set(appointments.map((appointment) => appointment.client_id)));
  const serviceIds = Array.from(new Set(appointments.map((appointment) => appointment.service_id)));
  const [clientsResult, servicesResult] = await Promise.all([
    clientIds.length
      ? admin.from("clients").select("id, profile_id").in("id", clientIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length
      ? admin.from("services").select("id, name").in("id", serviceIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (clientsResult.error || servicesResult.error) {
    throw new CalendarSyncError("Unable to prepare Google Calendar event labels.", 500, "google_event_label_read_failed");
  }
  const clients = (clientsResult.data ?? []) as Array<{ id: string; profile_id: string | null }>;
  const profileIds = clients.flatMap((client) => client.profile_id ? [client.profile_id] : []);
  const profilesResult = profileIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", profileIds)
    : { data: [], error: null };
  if (profilesResult.error) {
    throw new CalendarSyncError("Unable to prepare Google Calendar event labels.", 500, "google_event_label_read_failed");
  }
  const names = new Map(((profilesResult.data ?? []) as Array<{ id: string; full_name: string }>).map((profile) => [profile.id, profile.full_name]));
  return {
    clientNames: new Map(clients.map((client) => [client.id, client.profile_id ? names.get(client.profile_id) ?? "BVRB3R client" : "BVRB3R client"])),
    serviceNames: new Map(((servicesResult.data ?? []) as Array<{ id: string; name: string }>).map((service) => [service.id, service.name]))
  };
}

function googleEventId(appointmentId: string) {
  const normalized = appointmentId.toLowerCase().replace(/[^0-9a-v]/g, "");
  return `bvrb3r${normalized || createHash("sha256").update(appointmentId).digest("hex").slice(0, 32)}`;
}

async function exportGoogleAppointments(input: {
  admin: AdminClient;
  connection: GoogleConnectionRow;
  accessToken: string;
  appointmentId: string;
}) {
  const result = await input.admin
    .from("appointments")
    .select("id, barber_id, client_id, service_id, starts_at, ends_at, status, source_provider, updated_at")
    .eq("barber_id", input.connection.barber_id)
    .eq("source_provider", "bvrb3r")
    .eq("id", input.appointmentId)
    .limit(1);
  if (result.error) {
    throw new CalendarSyncError("Unable to read BVRB3R appointments for Google Calendar.", 500, "google_appointment_read_failed");
  }
  const appointments = (result.data ?? []) as AppointmentRow[];
  const calendarId = decryptCalendarSecret(input.connection.bvrb3r_calendar_id_ciphertext);
  if (appointments.length === 0) {
    const linkResult = await input.admin.from("calendar_event_links")
      .select("external_event_id")
      .eq("provider", "google")
      .eq("connection_id", input.connection.id)
      .eq("appointment_id", input.appointmentId)
      .maybeSingle();
    if (linkResult.error) {
      throw new CalendarSyncError("Unable to read Google Calendar loop protection.", 500, "google_event_link_read_failed");
    }
    if (!linkResult.data) return 0;
    await deleteGoogleCalendarEvent({
      accessToken: input.accessToken,
      calendarId,
      eventId: (linkResult.data as { external_event_id: string }).external_event_id
    });
    const removeLink = await input.admin.from("calendar_event_links").delete()
      .eq("provider", "google")
      .eq("connection_id", input.connection.id)
      .eq("appointment_id", input.appointmentId);
    if (removeLink.error) {
      throw new CalendarSyncError("Unable to remove Google Calendar loop protection.", 500, "google_event_link_delete_failed");
    }
    return 1;
  }
  const labels = await loadAppointmentLabels(input.admin, appointments);
  let exported = 0;
  for (const appointment of appointments) {
    const eventId = googleEventId(appointment.id);
    if (appointment.status === "cancelled") {
      await deleteGoogleCalendarEvent({ accessToken: input.accessToken, calendarId, eventId });
      await input.admin.from("calendar_event_links").delete()
        .eq("provider", "google")
        .eq("connection_id", input.connection.id)
        .eq("appointment_id", appointment.id);
      exported += 1;
      continue;
    }
    const loopTag = buildCalendarLoopTag(appointment.id);
    await upsertGoogleCalendarEvent({
      accessToken: input.accessToken,
      calendarId,
      eventId,
      loopTag,
      appointmentId: appointment.id,
      summary: `${labels.clientNames.get(appointment.client_id) ?? "BVRB3R client"} · ${labels.serviceNames.get(appointment.service_id) ?? "Appointment"}`,
      description: "Managed by BVRB3R. Update or cancel in BVRB3R.",
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at
    });
    const pushedAt = new Date().toISOString();
    const link = await input.admin.from("calendar_event_links").upsert({
      provider: "google",
      connection_id: input.connection.id,
      appointment_id: appointment.id,
      external_event_id: eventId,
      loop_tag: loopTag,
      last_source_updated_at: appointment.updated_at ?? null,
      last_pushed_at: pushedAt,
      updated_at: pushedAt
    }, { onConflict: "provider,connection_id,appointment_id" });
    if (link.error) {
      throw new CalendarSyncError("Unable to record Google Calendar loop protection.", 500, "google_event_link_save_failed");
    }
    exported += 1;
  }
  return exported;
}

async function importGoogleFreeBusy(input: {
  admin: AdminClient;
  connection: GoogleConnectionRow;
  accessToken: string;
}) {
  const preferenceResult = await input.admin
    .from("calendar_source_preferences")
    .select("provider_calendar_id_hash, provider_calendar_id_ciphertext")
    .eq("barber_id", input.connection.barber_id)
    .eq("provider", "google")
    .eq("blocks_availability", true);
  if (preferenceResult.error) {
    throw new CalendarSyncError("Unable to read Google free/busy preferences.", 500, "google_freebusy_preference_read_failed");
  }
  const dedicatedCalendarId = decryptCalendarSecret(input.connection.bvrb3r_calendar_id_ciphertext);
  const dedicatedHash = hashCalendarCapability(dedicatedCalendarId);
  const preferences = ((preferenceResult.data ?? []) as Array<{
    provider_calendar_id_hash: string;
    provider_calendar_id_ciphertext: string | null;
  }>).filter((row) => row.provider_calendar_id_hash !== dedicatedHash && row.provider_calendar_id_ciphertext);
  const calendarIds = preferences.map((row) => decryptCalendarSecret(row.provider_calendar_id_ciphertext as string));
  const startsAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();
  const freebusy = await queryGoogleFreeBusy({ accessToken: input.accessToken, calendarIds, startsAt, endsAt });
  const now = new Date();
  const staleAfter = new Date(now.getTime() + CALENDAR_BUSY_CACHE_MINUTES * 60 * 1000).toISOString();
  let count = 0;
  for (const preference of preferences) {
    const calendarId = decryptCalendarSecret(preference.provider_calendar_id_ciphertext as string);
    if (freebusy.failedCalendarIds.includes(calendarId)) continue;
    const windows = freebusy.calendars[calendarId] ?? [];
    await replaceCalendarBusyBlocks({
      admin: input.admin,
      barberId: input.connection.barber_id,
      provider: "google",
      calendarIdHash: preference.provider_calendar_id_hash,
      blocks: windows.map((window) => ({
        externalEventIdHash: buildBusyBlockHash({
          provider: "google",
          calendarIdHash: preference.provider_calendar_id_hash,
          startsAt: window.start,
          endsAt: window.end
        }),
        startsAt: window.start,
        endsAt: window.end
      })),
      cacheStampedAt: now.toISOString(),
      staleAfter
    });
    count += windows.length;
  }
  if (freebusy.failedCalendarIds.length) {
    throw new CalendarSyncError(
      "Google could not read one or more selected calendars; last-known busy windows were preserved.",
      502,
      "google_freebusy_partial_failure"
    );
  }
  return count;
}

async function syncGoogleConnectionWithLease(input: {
  connectionId: string;
  trigger?: TriggerSource;
  appointmentId?: string;
  freebusy?: boolean;
}, leaseToken: string) {
  const admin = getAdminClient();
  const connection = await loadGoogleConnection(admin, input.connectionId);
  if (connection.status === "disconnected") return { exported: 0, busyBlocks: 0, skipped: true };
  const trigger = input.trigger ?? "schedule";
  const direction = input.freebusy && !input.appointmentId ? "freebusy" : "export";
  const runId = await createRun(admin, {
    provider: "google",
    connectionId: connection.id,
    barberId: connection.barber_id,
    direction,
    trigger
  });
  try {
    const accessToken = await ensureGoogleAccessToken(admin, connection, leaseToken);
    const exported = connection.write_enabled && input.appointmentId
      ? await exportGoogleAppointments({ admin, connection, accessToken, appointmentId: input.appointmentId })
      : 0;
    const busyBlocks = connection.freebusy_enabled && input.freebusy
      ? await importGoogleFreeBusy({ admin, connection, accessToken })
      : 0;
    const successAt = new Date().toISOString();
    await requireLeaseMutation(admin.from("google_calendar_connections").update({
      status: "active",
      last_push_at: exported ? successAt : connection.last_push_at,
      last_busy_sync_at: input.freebusy ? successAt : connection.last_busy_sync_at,
      last_success_at: successAt,
      last_error_code: null,
      next_poll_at: nextPollAt(),
      updated_at: successAt
    })
      .eq("id", connection.id)
      .eq("sync_lease_token", leaseToken)
      .in("status", ["active", "degraded"])
      .select("id")
      .maybeSingle(), "Unable to record Google sync health.", "google_health_save_failed");
    await finishRun(admin, runId, { status: "succeeded", exportedCount: exported, busyBlockCount: busyBlocks });
    return { exported, busyBlocks, skipped: false };
  } catch (error) {
    const errorCode = safeErrorCode(error);
    await Promise.all([
      admin.from("google_calendar_connections").update({
        status: "degraded",
        last_error_code: errorCode,
        next_poll_at: nextPollAt(),
        updated_at: new Date().toISOString()
      })
        .eq("id", connection.id)
        .eq("sync_lease_token", leaseToken)
        .in("status", ["active", "degraded"]),
      finishRun(admin, runId, { status: "failed", errorCode })
    ]);
    throw error;
  }
}

export async function syncGoogleConnection(input: {
  connectionId: string;
  trigger?: TriggerSource;
  appointmentId?: string;
  freebusy?: boolean;
}) {
  const admin = getAdminClient();
  const trigger = input.trigger ?? "schedule";
  return runWithConnectionLease({
    admin,
    table: "google_calendar_connections",
    connectionId: input.connectionId,
    requireDue: trigger === "schedule",
    task: (leaseToken) => syncGoogleConnectionWithLease({ ...input, trigger }, leaseToken)
  });
}

export async function syncCalendarNowForUser(user: UserAccount, provider: "square" | "google") {
  const admin = getAdminClient();
  const barberResult = await admin.from("barbers").select("id").eq("profile_id", user.id).maybeSingle();
  if (barberResult.error || !barberResult.data) {
    throw new CalendarSyncError("Finish Barber setup before syncing a calendar.", 409, "calendar_barber_setup_required");
  }
  const barberId = (barberResult.data as { id: string }).id;
  if (provider === "square") {
    const connection = await admin.from("square_connections").select("id").eq("barber_id", barberId).maybeSingle();
    if (connection.error || !connection.data) throw new CalendarSyncError("Connect Square Calendar first.", 409, "square_connection_required");
    return syncSquareConnection((connection.data as { id: string }).id, "manual");
  }
  const connection = await admin.from("google_calendar_connections").select("id").eq("barber_id", barberId).maybeSingle();
  if (connection.error || !connection.data) throw new CalendarSyncError("Connect Google Calendar first.", 409, "google_connection_required");
  const connectionId = (connection.data as { id: string }).id;
  const backfill = await admin.rpc("product_pr33_enqueue_google_export_backfill", {
    p_connection_id: connectionId
  });
  if (backfill.error) {
    throw new CalendarSyncError("Unable to queue the Google Calendar export.", 500, "google_backfill_enqueue_failed");
  }
  const syncResult = await syncGoogleConnection({
    connectionId,
    trigger: "manual",
    freebusy: true
  });
  return {
    queued: typeof backfill.data === "number" ? backfill.data : 0,
    ...syncResult
  };
}

async function recoverExpiredJobs(admin: AdminClient) {
  const now = new Date();
  const nowIso = now.toISOString();
  const legacyCutoff = new Date(now.getTime() - CALENDAR_JOB_LEASE_MS).toISOString();
  const expired = await admin.from("calendar_sync_jobs")
    .select("id")
    .eq("state", "running")
    .or(`lease_expires_at.lt.${nowIso},and(lease_expires_at.is.null,locked_at.lt.${legacyCutoff})`)
    .limit(100);
  if (expired.error) {
    throw new CalendarSyncError("Unable to recover expired calendar jobs.", 500, "calendar_job_recovery_failed");
  }
  for (const row of (expired.data ?? []) as Array<{ id: string }>) {
    const recovered = await admin.from("calendar_sync_jobs").update({
      state: "pending",
      due_at: nowIso,
      locked_at: null,
      lease_token: null,
      lease_expires_at: null,
      finished_at: null,
      last_error_code: "calendar_job_lease_expired",
      updated_at: nowIso
    })
      .eq("id", row.id)
      .eq("state", "running")
      .select("id")
      .maybeSingle();
    if (!recovered.error) continue;
    if (recovered.error.code !== "23505") {
      throw new CalendarSyncError("Unable to recover expired calendar jobs.", 500, "calendar_job_recovery_failed");
    }

    // A newer pending successor owns the same dedupe key. Retire the stale
    // running row instead of allowing its old payload to displace newer work.
    const retired = await admin.from("calendar_sync_jobs").update({
      state: "canceled",
      locked_at: null,
      lease_token: null,
      lease_expires_at: null,
      finished_at: nowIso,
      last_error_code: "calendar_job_lease_expired_superseded",
      updated_at: nowIso
    })
      .eq("id", row.id)
      .eq("state", "running")
      .select("id")
      .maybeSingle();
    if (retired.error) {
      throw new CalendarSyncError("Unable to recover expired calendar jobs.", 500, "calendar_job_recovery_failed");
    }
  }
}

async function claimJob(admin: AdminClient, jobId: string) {
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseToken = randomUUID();
  const result = await admin.from("calendar_sync_jobs")
    .update({
      state: "running",
      locked_at: nowIso,
      lease_token: leaseToken,
      lease_expires_at: new Date(now.getTime() + CALENDAR_JOB_LEASE_MS).toISOString(),
      finished_at: null,
      updated_at: nowIso
    })
    .eq("id", jobId)
    .eq("state", "pending")
    .select("id")
    .maybeSingle();
  if (result.error) {
    throw new CalendarSyncError("Unable to claim a calendar job.", 500, "calendar_job_claim_failed");
  }
  return result.data ? leaseToken : null;
}

async function retryClaimedJob(input: {
  admin: AdminClient;
  jobId: string;
  leaseToken: string;
  attemptCount: number;
  errorCode: string;
  delayMs: number;
  incrementAttempt?: boolean;
}) {
  const incrementAttempt = input.incrementAttempt ?? true;
  const attempts = input.attemptCount + (incrementAttempt ? 1 : 0);
  const terminal = incrementAttempt && attempts >= 5;
  const now = new Date().toISOString();
  const retry = await input.admin.from("calendar_sync_jobs").update({
    state: terminal ? "failed" : "pending",
    attempt_count: attempts,
    due_at: new Date(Date.now() + input.delayMs).toISOString(),
    locked_at: null,
    lease_token: null,
    lease_expires_at: null,
    finished_at: terminal ? now : null,
    last_error_code: input.errorCode,
    updated_at: now
  })
    .eq("id", input.jobId)
    .eq("state", "running")
    .eq("lease_token", input.leaseToken)
    .select("id")
    .maybeSingle();

  if (!retry.error) return;
  if (retry.error.code !== "23505") {
    throw new CalendarSyncError("Unable to retry a calendar job.", 500, "calendar_job_retry_failed");
  }

  // A newer mutation may already have inserted the one pending successor. In
  // that case the running row is obsolete and must release its lease without
  // overwriting the newer work item.
  const canceled = await input.admin.from("calendar_sync_jobs").update({
    state: "canceled",
    locked_at: null,
    lease_token: null,
    lease_expires_at: null,
    finished_at: now,
    last_error_code: `${input.errorCode}_superseded`,
    updated_at: now
  })
    .eq("id", input.jobId)
    .eq("state", "running")
    .eq("lease_token", input.leaseToken)
    .select("id")
    .maybeSingle();
  if (canceled.error) {
    throw new CalendarSyncError("Unable to retire a superseded calendar job.", 500, "calendar_job_retry_failed");
  }
}

export async function processCalendarSyncSchedule() {
  const admin = getAdminClient();
  await recoverExpiredJobs(admin);
  const now = new Date().toISOString();
  const [jobsResult, squareResult, googleResult] = await Promise.all([
    admin.from("calendar_sync_jobs")
      .select("id, connection_id, appointment_id, attempt_count")
      .eq("provider", "google")
      .eq("direction", "export")
      .eq("state", "pending")
      .lte("due_at", now)
      .order("due_at", { ascending: true })
      .limit(20),
    admin.from("square_connections")
      .select("id")
      .in("status", ["active", "degraded"])
      .lte("next_poll_at", now)
      .order("next_poll_at", { ascending: true })
      .limit(10),
    admin.from("google_calendar_connections")
      .select("id")
      .in("status", ["active", "degraded"])
      .eq("freebusy_enabled", true)
      .lte("next_poll_at", now)
      .order("next_poll_at", { ascending: true })
      .limit(10)
  ]);
  if (jobsResult.error || squareResult.error || googleResult.error) {
    throw new CalendarSyncError("Unable to load scheduled calendar sync work.", 500, "calendar_schedule_read_failed");
  }
  const summary = { jobs: 0, square: 0, google: 0, failures: 0 };
  for (const row of (jobsResult.data ?? []) as Array<{ id: string; connection_id: string; appointment_id: string | null; attempt_count: number }>) {
    const leaseToken = await claimJob(admin, row.id);
    if (!leaseToken) continue;
    try {
      const syncResult = await syncGoogleConnection({
        connectionId: row.connection_id,
        trigger: "appointment",
        appointmentId: row.appointment_id ?? undefined
      });
      if (isConnectionLeaseBusy(syncResult)) {
        await retryClaimedJob({
          admin,
          jobId: row.id,
          leaseToken,
          attemptCount: row.attempt_count,
          errorCode: "calendar_connection_busy",
          delayMs: 30_000,
          incrementAttempt: false
        });
        continue;
      }
      const completed = await admin.from("calendar_sync_jobs").update({
        state: "succeeded",
        locked_at: null,
        lease_token: null,
        lease_expires_at: null,
        finished_at: new Date().toISOString(),
        last_error_code: null,
        updated_at: new Date().toISOString()
      })
        .eq("id", row.id)
        .eq("state", "running")
        .eq("lease_token", leaseToken)
        .select("id")
        .maybeSingle();
      if (completed.error || !completed.data) {
        throw new CalendarSyncError("Unable to finish a calendar job.", 500, "calendar_job_finish_failed");
      }
      summary.jobs += 1;
    } catch (error) {
      const attempts = row.attempt_count + 1;
      await retryClaimedJob({
        admin,
        jobId: row.id,
        leaseToken,
        attemptCount: row.attempt_count,
        errorCode: safeErrorCode(error),
        delayMs: Math.min(2 ** attempts, 30) * 60 * 1000
      });
      summary.failures += 1;
    }
  }
  for (const row of (squareResult.data ?? []) as Array<{ id: string }>) {
    try {
      const result = await syncSquareConnection(row.id, "schedule");
      if (!isConnectionLeaseBusy(result)) summary.square += 1;
    } catch {
      summary.failures += 1;
    }
  }
  for (const row of (googleResult.data ?? []) as Array<{ id: string }>) {
    try {
      const result = await syncGoogleConnection({ connectionId: row.id, trigger: "schedule", freebusy: true });
      if (!isConnectionLeaseBusy(result)) summary.google += 1;
    } catch {
      summary.failures += 1;
    }
  }
  return summary;
}

export async function syncSquareMerchantFromWebhook(merchantId: string) {
  const admin = getAdminClient();
  // One Square merchant may map to several explicitly selected Barber team
  // calendars. Mark every matching connection due and acknowledge quickly;
  // the minute scheduler claims each row atomically without holding Square's
  // webhook request open across paginated provider reads.
  const dueAt = new Date().toISOString();
  const connections = await admin.from("square_connections").update({
    next_poll_at: dueAt,
    updated_at: dueAt
  })
    .eq("square_merchant_id", merchantId)
    .in("status", ["active", "degraded"])
    .select("id");
  if (connections.error) {
    throw new CalendarSyncError("Unable to schedule the Square webhook refresh.", 500, "square_webhook_schedule_failed");
  }
  const scheduled = (connections.data ?? []).length;
  return { accepted: true, matched: scheduled > 0, scheduled };
}
