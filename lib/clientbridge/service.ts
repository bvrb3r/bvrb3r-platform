import { createHash } from "node:crypto";
import { isClientRole } from "@/lib/auth/roles";
import {
  maskClientName,
  maskEmail,
  maskPhone,
  paymentOwnerForSource,
  resolveActivationLinkState,
  type BookingSourceProvider,
  type PaymentOwner
} from "@/lib/clientbridge/domain";
import { canonicalLocationUuid } from "@/lib/booking/canonical-booking";
import { createKioskQueueEntry } from "@/lib/queue/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export type AppointmentLookupKind = "phone" | "email" | "name_time" | "code" | "qr";

export type AppointmentLookupResult = {
  id: string;
  sourceProvider: BookingSourceProvider;
  sourceBadge: "BVRB3R" | "BOOKSY" | "SQUARE" | "THECUT";
  paymentOwner: PaymentOwner;
  clientLabel: string;
  startsAt: string;
  endsAt: string;
  serviceName: string;
  barberLabel: string;
  status: string;
  checkedIn: boolean;
  externalFinancialDataPrivate: boolean;
  providerDataRestricted: boolean;
};

export class ClientBridgeServiceError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "ClientBridgeServiceError";
    this.status = status;
    this.code = code;
  }
}

function getSupabase() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new ClientBridgeServiceError("Client check-in requires the live Supabase environment.", 503);
  }
  return supabase;
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function providerBadge(source: BookingSourceProvider): AppointmentLookupResult["sourceBadge"] {
  return source === "bvrb3r" ? "BVRB3R" : source.toUpperCase() as AppointmentLookupResult["sourceBadge"];
}

async function resolveLocation(supabase: SupabaseClient, shopId: string) {
  const locationId = canonicalLocationUuid(shopId);
  const result = await supabase
    .from("locations")
    .select("id, reference_code, name")
    .or(`id.eq.${locationId},reference_code.eq.${shopId}`)
    .maybeSingle();
  if (result.error) {
    throw new ClientBridgeServiceError("Unable to resolve this kiosk shop.", 500);
  }
  if (!result.data) {
    throw new ClientBridgeServiceError("This kiosk shop was not found.", 404);
  }
  return result.data as { id: string; reference_code: string | null; name: string };
}

function timeWindow(at?: string) {
  if (!at) return null;
  const center = new Date(at);
  if (Number.isNaN(center.getTime())) {
    throw new ClientBridgeServiceError("Name lookup requires a valid appointment time.", 400);
  }
  return {
    startsAt: new Date(center.getTime() - 4 * 60 * 60_000).toISOString(),
    endsAt: new Date(center.getTime() + 4 * 60 * 60_000).toISOString()
  };
}

async function resolveNativeClientIds(
  supabase: SupabaseClient,
  input: {
    kind: AppointmentLookupKind;
    value: string;
    appointmentTime?: string;
  }
) {
  if (input.kind === "code" || input.kind === "qr") return [];
  let profileQuery = supabase.from("profiles").select("id");
  if (input.kind === "phone") {
    profileQuery = profileQuery.eq("phone", input.value);
  } else if (input.kind === "email") {
    profileQuery = profileQuery.ilike("email", input.value);
  } else {
    if (!input.appointmentTime || input.value.trim().length < 2) {
      throw new ClientBridgeServiceError("A name must be paired with an appointment time.", 400);
    }
    profileQuery = profileQuery.ilike("full_name", `%${input.value.trim()}%`);
  }
  const profiles = await profileQuery.limit(20);
  if (profiles.error) {
    throw new ClientBridgeServiceError("Unable to search native appointment identity.", 500);
  }
  const profileIds = (profiles.data ?? []).map((row) => row.id as string);
  if (!profileIds.length) return [];
  const clients = await supabase.from("clients").select("id").in("profile_id", profileIds);
  if (clients.error) {
    throw new ClientBridgeServiceError("Unable to search native client relationships.", 500);
  }
  return (clients.data ?? []).map((row) => row.id as string);
}

export async function searchKioskAppointments(input: {
  shopId: string;
  kind: AppointmentLookupKind;
  value: string;
  appointmentTime?: string;
}): Promise<{ results: AppointmentLookupResult[] }> {
  const value = input.value.trim();
  if (value.length < 2) {
    throw new ClientBridgeServiceError("Enter enough information to search safely.", 400);
  }
  if (input.kind === "phone" && normalizePhone(value).length < 7) {
    throw new ClientBridgeServiceError("Enter a complete phone number.", 400);
  }
  if (input.kind === "email" && !value.includes("@")) {
    throw new ClientBridgeServiceError("Enter a complete email address.", 400);
  }
  if (input.kind === "name_time" && !input.appointmentTime) {
    throw new ClientBridgeServiceError("Name lookup requires the appointment time too.", 400);
  }

  const supabase = getSupabase();
  const location = await resolveLocation(supabase, input.shopId);
  const normalizedValue = input.kind === "phone" ? normalizePhone(value) : value.toLowerCase();
  const window = timeWindow(input.appointmentTime);
  const nativeClientIds = await resolveNativeClientIds(supabase, {
    kind: input.kind,
    value: input.kind === "phone" ? normalizedValue : value,
    appointmentTime: input.appointmentTime
  });

  let nativeRows: Array<Record<string, unknown>> = [];
  if (input.kind === "code") {
    const native = await supabase
      .from("appointments")
      .select("id, client_id, barber_id, service_id, starts_at, ends_at, status, payment_owner, checked_in_at")
      .eq("location_id", location.id)
      .eq("confirmation_code", value.toUpperCase())
      .limit(10);
    if (native.error) throw new ClientBridgeServiceError("Unable to search BVRB3R appointments.", 500);
    nativeRows = native.data ?? [];
  } else if (input.kind !== "qr" && nativeClientIds.length) {
    let nativeQuery = supabase
      .from("appointments")
      .select("id, client_id, barber_id, service_id, starts_at, ends_at, status, payment_owner, checked_in_at")
      .eq("location_id", location.id)
      .in("client_id", nativeClientIds)
      .order("starts_at", { ascending: true })
      .limit(20);
    if (window) nativeQuery = nativeQuery.gte("starts_at", window.startsAt).lte("starts_at", window.endsAt);
    const native = await nativeQuery;
    if (native.error) throw new ClientBridgeServiceError("Unable to search BVRB3R appointments.", 500);
    nativeRows = native.data ?? [];
  }

  let externalQuery = supabase
    .from("chairsync_appointments")
    .select("id, provider, starts_at, ends_at, service_name, client_display_name, barber_id, status, payment_owner, provider_data_restricted, checked_in_at");
  externalQuery = externalQuery.eq("location_id", location.id);
  if (input.kind === "phone") externalQuery = externalQuery.eq("client_phone", normalizedValue).eq("provider_data_restricted", false);
  if (input.kind === "email") externalQuery = externalQuery.ilike("client_email", value).eq("provider_data_restricted", false);
  if (input.kind === "code") externalQuery = externalQuery.eq("confirmation_code_hash", sha256(value.toUpperCase()));
  if (input.kind === "qr") externalQuery = externalQuery.eq("qr_payload_hash", sha256(value));
  if (input.kind === "name_time") {
    externalQuery = externalQuery
      .ilike("client_display_name", `%${value}%`)
      .gte("starts_at", window!.startsAt)
      .lte("starts_at", window!.endsAt);
  }
  const external = await externalQuery.order("starts_at", { ascending: true }).limit(20);
  if (external.error) {
    throw new ClientBridgeServiceError("Unable to search imported appointments.", 500);
  }

  const nativeClientIdsFound = [...new Set(nativeRows.map((row) => row.client_id as string))];
  const nativeBarberIds = [...new Set([
    ...nativeRows.map((row) => row.barber_id as string),
    ...(external.data ?? []).map((row) => row.barber_id as string).filter(Boolean)
  ])];
  const nativeServiceIds = [...new Set(nativeRows.map((row) => row.service_id as string))];
  const [clients, barbers, services] = await Promise.all([
    nativeClientIdsFound.length
      ? supabase.from("clients").select("id, profile_id").in("id", nativeClientIdsFound)
      : Promise.resolve({ data: [], error: null }),
    nativeBarberIds.length
      ? supabase.from("barbers").select("id, profile_id").in("id", nativeBarberIds)
      : Promise.resolve({ data: [], error: null }),
    nativeServiceIds.length
      ? supabase.from("services").select("id, name").in("id", nativeServiceIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  if (clients.error || barbers.error || services.error) {
    throw new ClientBridgeServiceError("Unable to mask appointment search results.", 500);
  }
  const profileIds = [...new Set([
    ...(clients.data ?? []).map((row) => row.profile_id as string),
    ...(barbers.data ?? []).map((row) => row.profile_id as string)
  ])];
  const profiles = profileIds.length
    ? await supabase.from("profiles").select("id, full_name, public_username").in("id", profileIds)
    : { data: [], error: null };
  if (profiles.error) throw new ClientBridgeServiceError("Unable to mask appointment identities.", 500);

  const profileById = new Map((profiles.data ?? []).map((row) => [row.id as string, row as { id: string; full_name: string | null; public_username: string | null }]));
  const clientProfileById = new Map((clients.data ?? []).map((row) => [row.id as string, profileById.get(row.profile_id as string)]));
  const barberProfileById = new Map((barbers.data ?? []).map((row) => [row.id as string, profileById.get(row.profile_id as string)]));
  const serviceById = new Map((services.data ?? []).map((row) => [row.id as string, row.name as string]));

  const nativeResults: AppointmentLookupResult[] = nativeRows.map((row) => {
    const clientProfile = clientProfileById.get(row.client_id as string);
    const barberProfile = barberProfileById.get(row.barber_id as string);
    return {
      id: row.id as string,
      sourceProvider: "bvrb3r",
      sourceBadge: "BVRB3R",
      paymentOwner: (row.payment_owner as PaymentOwner | null) ?? "unpaid_manual",
      clientLabel: maskClientName(clientProfile?.full_name ?? "Client"),
      startsAt: row.starts_at as string,
      endsAt: row.ends_at as string,
      serviceName: serviceById.get(row.service_id as string) ?? "BVRB3R service",
      barberLabel: barberProfile?.public_username ? `@${barberProfile.public_username.replace(/^@+/, "")}` : "Your barber",
      status: row.status as string,
      checkedIn: Boolean(row.checked_in_at),
      externalFinancialDataPrivate: false,
      providerDataRestricted: false
    };
  });

  const externalResults: AppointmentLookupResult[] = (external.data ?? []).map((row) => {
    const source = row.provider as Exclude<BookingSourceProvider, "bvrb3r">;
    const barberProfile = row.barber_id ? barberProfileById.get(row.barber_id as string) : null;
    return {
      id: row.id as string,
      sourceProvider: source,
      sourceBadge: providerBadge(source),
      paymentOwner: paymentOwnerForSource(source),
      clientLabel: maskClientName(row.client_display_name as string),
      startsAt: row.starts_at as string,
      endsAt: row.ends_at as string,
      serviceName: row.service_name as string,
      barberLabel: barberProfile?.public_username ? `@${barberProfile.public_username.replace(/^@+/, "")}` : "Assigned barber",
      status: row.status as string,
      checkedIn: Boolean(row.checked_in_at),
      externalFinancialDataPrivate: true,
      providerDataRestricted: Boolean(row.provider_data_restricted)
    };
  });

  return {
    results: [...nativeResults, ...externalResults]
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())
  };
}

export async function checkInKioskAppointment(input: {
  shopId: string;
  appointmentId: string;
  sourceProvider: BookingSourceProvider;
  idempotencyKey: string;
  operationalSmsConsent: boolean;
  contactPhone?: string;
  contactEmail?: string;
}) {
  const supabase = getSupabase();
  const location = await resolveLocation(supabase, input.shopId);
  if (input.sourceProvider === "bvrb3r") {
    const appointment = await supabase
      .from("appointments")
      .select("id, location_id, client_id, barber_id, service_id, status, payment_owner, checked_in_at")
      .eq("id", input.appointmentId)
      .eq("location_id", location.id)
      .maybeSingle();
    if (appointment.error) throw new ClientBridgeServiceError("Unable to load this appointment.", 500);
    if (!appointment.data) throw new ClientBridgeServiceError("Appointment not found.", 404);
    if (appointment.data.status === "cancelled") throw new ClientBridgeServiceError("This appointment was canceled.", 409);

    const [client, barber, service] = await Promise.all([
      supabase.from("clients").select("id, profile_id").eq("id", appointment.data.client_id).single(),
      supabase.from("barbers").select("id, reference_code").eq("id", appointment.data.barber_id).single(),
      supabase.from("services").select("id, reference_code, name").eq("id", appointment.data.service_id).single()
    ]);
    if (client.error || barber.error || service.error) {
      throw new ClientBridgeServiceError("Unable to resolve the appointment check-in relationships.", 500);
    }
    const profile = await supabase
      .from("profiles")
      .select("full_name, phone, email")
      .eq("id", client.data.profile_id)
      .single();
    if (profile.error) throw new ClientBridgeServiceError("Unable to resolve the client contact.", 500);

    const queue = await createKioskQueueEntry({
      clientName: profile.data.full_name ?? "BVRB3R client",
      clientPhone: profile.data.phone ?? input.contactPhone ?? "",
      clientEmail: profile.data.email ?? input.contactEmail,
      shopId: location.reference_code ?? location.id,
      serviceId: service.data.reference_code ?? service.data.id,
      preferredBarberId: barber.data.reference_code ?? barber.data.id,
      queueSource: "kiosk",
      entryType: "booked",
      sourceProvider: "bvrb3r",
      paymentOwner: (appointment.data.payment_owner as PaymentOwner | null) ?? "unpaid_manual",
      idempotencyKey: input.idempotencyKey,
      operationalSmsConsent: input.operationalSmsConsent,
      notes: `Appointment check-in · ${service.data.name}`
    });

    await Promise.all([
      supabase.from("appointments").update({
        status: "checked_in",
        checked_in_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq("id", appointment.data.id),
      supabase.from("clientbridge_consent_events").insert({
        client_id: appointment.data.client_id,
        waitlist_entry_id: queue.entry.id,
        consent_kind: "operational_sms",
        granted: input.operationalSmsConsent,
        channel: "sms",
        source_provider: "bvrb3r",
        evidence: { surface: "kiosk", purpose: "active_visit_queue_status" }
      })
    ]);
    return {
      queue: queue.entry,
      publicQueueToken: queue.publicQueueToken,
      duplicate: queue.duplicate,
      sourceProvider: "bvrb3r" as const,
      paymentOwner: queue.entry.paymentOwner
    };
  }

  const external = await supabase
    .from("chairsync_appointments")
    .select("id, provider, location_id, barber_id, linked_client_id, starts_at, service_name, client_display_name, client_phone, client_email, status, payment_owner, provider_data_restricted, checked_in_at")
    .eq("id", input.appointmentId)
    .eq("location_id", location.id)
    .maybeSingle();
  if (external.error) throw new ClientBridgeServiceError("Unable to load this imported appointment.", 500);
  if (!external.data) throw new ClientBridgeServiceError("Imported appointment not found.", 404);
  if (external.data.status === "canceled") throw new ClientBridgeServiceError("This imported appointment was canceled at its source.", 409);

  const barber = external.data.barber_id
    ? await supabase.from("barbers").select("id, reference_code").eq("id", external.data.barber_id).maybeSingle()
    : { data: null, error: null };
  if (barber.error) throw new ClientBridgeServiceError("Unable to resolve the imported appointment barber.", 500);
  const phone = external.data.provider_data_restricted
    ? input.contactPhone
    : external.data.client_phone ?? input.contactPhone;
  const email = external.data.provider_data_restricted
    ? input.contactEmail
    : external.data.client_email ?? input.contactEmail;
  if (!phone || normalizePhone(phone).length < 7) {
    throw new ClientBridgeServiceError("A phone number is required for this visit’s queue status.", 400);
  }

  const source = external.data.provider as Exclude<BookingSourceProvider, "bvrb3r">;
  const queue = await createKioskQueueEntry({
    clientName: external.data.client_display_name,
    clientPhone: phone,
    clientEmail: email ?? undefined,
    shopId: location.reference_code ?? location.id,
    preferredBarberId: barber.data?.reference_code ?? barber.data?.id,
    queueSource: "kiosk",
    entryType: "booked",
    sourceProvider: source,
    paymentOwner: paymentOwnerForSource(source),
    idempotencyKey: input.idempotencyKey,
    chairsyncAppointmentId: external.data.id,
    sourceServiceName: external.data.service_name,
    operationalSmsConsent: input.operationalSmsConsent,
    notes: `${external.data.service_name} · ${providerBadge(source)} read-only appointment`
  });

  const clientRow = await supabase
    .from("waitlist_entries")
    .select("client_id")
    .eq("id", queue.entry.id)
    .single();
  if (clientRow.error) throw new ClientBridgeServiceError("Unable to finish external client linkage.", 500);

  await Promise.all([
    supabase.from("chairsync_appointments").update({
      status: "checked_in",
      checked_in_at: new Date().toISOString(),
      checked_in_waitlist_entry_id: queue.entry.id,
      linked_client_id: clientRow.data.client_id,
      updated_at: new Date().toISOString()
    }).eq("id", external.data.id),
    supabase.from("clientbridge_consent_events").insert({
      client_id: clientRow.data.client_id,
      waitlist_entry_id: queue.entry.id,
      chairsync_appointment_id: external.data.id,
      consent_kind: "operational_sms",
      granted: input.operationalSmsConsent,
      channel: "sms",
      source_provider: source,
      evidence: { surface: "kiosk", purpose: "active_visit_queue_status" }
    })
  ]);

  return {
    queue: queue.entry,
    publicQueueToken: queue.publicQueueToken,
    duplicate: queue.duplicate,
    sourceProvider: source,
    paymentOwner: paymentOwnerForSource(source)
  };
}

export async function issueClientBridgeInvitation(input: {
  shopId: string;
  waitlistEntryId: string;
  contactChannel: "sms" | "email";
  contactValue: string;
  consentGranted: boolean;
}) {
  const supabase = getSupabase();
  const location = await resolveLocation(supabase, input.shopId);
  const queue = await supabase
    .from("waitlist_entries")
    .select("id, client_id, chairsync_appointment_id, source_provider")
    .eq("id", input.waitlistEntryId)
    .eq("location_id", location.id)
    .maybeSingle();
  if (queue.error) throw new ClientBridgeServiceError("Unable to load this queue visit.", 500);
  if (!queue.data) throw new ClientBridgeServiceError("Queue visit not found.", 404);
  if (!input.consentGranted) {
    throw new ClientBridgeServiceError("ClientBridge is optional and requires an explicit yes.", 400);
  }

  const consent = await supabase
    .from("clientbridge_consent_events")
    .insert({
      client_id: queue.data.client_id,
      waitlist_entry_id: queue.data.id,
      chairsync_appointment_id: queue.data.chairsync_appointment_id,
      consent_kind: "clientbridge_invite",
      granted: true,
      channel: input.contactChannel,
      source_provider: queue.data.source_provider,
      evidence: { surface: "kiosk", choice: "join_bvrb3r", marketingConsent: false }
    })
    .select("id")
    .single();
  if (consent.error) throw new ClientBridgeServiceError("Unable to store ClientBridge consent.", 500);

  const invitation = await supabase.rpc("pr23_issue_clientbridge_invitation", {
    p_client_id: queue.data.client_id,
    p_waitlist_entry_id: queue.data.id,
    p_chairsync_appointment_id: queue.data.chairsync_appointment_id,
    p_source_provider: queue.data.source_provider,
    p_contact_channel: input.contactChannel,
    p_contact_value: input.contactValue,
    p_consent_event_id: consent.data.id
  });
  if (invitation.error) throw new ClientBridgeServiceError("Unable to queue the ClientBridge invitation.", 500);
  const row = (Array.isArray(invitation.data) ? invitation.data[0] : invitation.data) as {
    invitation_id: string;
    invitation_status: string;
    activation_token: string | null;
    expires_at: string | null;
    suppression_reason: string | null;
  } | null;
  if (!row) throw new ClientBridgeServiceError("ClientBridge returned no invitation state.", 500);

  if (row.invitation_status === "queued") {
    const delivery = await supabase.from("notification_delivery_ledger").insert({
      waitlist_entry_id: queue.data.id,
      clientbridge_invitation_id: row.invitation_id,
      channel: input.contactChannel,
      notification_kind: "clientbridge_invitation",
      operational: false,
      status: "queued",
      consent_event_id: consent.data.id,
      metadata: {
        expiresAt: row.expires_at,
        activationPath: row.activation_token ? `/claim/${row.activation_token}` : null
      }
    });
    if (delivery.error) throw new ClientBridgeServiceError("Invitation exists, but delivery evidence could not be queued.", 500);
  }

  return {
    invitationId: row.invitation_id,
    status: row.invitation_status,
    expiresAt: row.expires_at,
    suppressionReason: row.suppression_reason
  };
}

export async function getClientBridgeClaim(token: string) {
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    return null;
  }
  const supabase = getSupabase();
  const result = await supabase
    .from("clientbridge_invitations")
    .select("id, contact_channel, contact_value, status, source_provider, expires_at, claimed_at")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (result.error) throw new ClientBridgeServiceError("Unable to load this activation link.", 500);
  if (!result.data) return null;
  const state = resolveActivationLinkState({
    status: result.data.status,
    expiresAt: result.data.expires_at
  });
  return {
    invitationId: result.data.id,
    state,
    sourceProvider: result.data.source_provider as BookingSourceProvider,
    maskedContact: result.data.contact_channel === "sms"
      ? maskPhone(result.data.contact_value)
      : maskEmail(result.data.contact_value),
    expiresAt: result.data.expires_at,
    claimedAt: result.data.claimed_at
  };
}

export async function claimClientBridgeHistory(token: string, user: UserAccount) {
  if (!user.id || user.id === "guest-user" || !isClientRole(user.role)) {
    throw new ClientBridgeServiceError("Sign in with the client account that should own this visit history.", 401);
  }
  const supabase = getSupabase();
  const result = await supabase.rpc("pr23_claim_clientbridge_invitation", {
    p_token: token,
    p_target_profile_id: user.id
  });
  if (result.error) {
    const status = result.error.code === "P0002" ? 404 : result.error.code === "23505" ? 409 : result.error.code === "22023" ? 410 : 400;
    throw new ClientBridgeServiceError(
      status === 410
        ? "This activation link expired."
        : status === 409
          ? "This activation link was already used."
          : "Unable to claim this visit history.",
      status,
      result.error.code
    );
  }
  return result.data as {
    status: "claimed";
    clientId: string;
    appointmentsMerged: number;
    queueEntriesMerged: number;
  };
}

export async function declineClientBridgeInvitation(token: string) {
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    throw new ClientBridgeServiceError("This activation link is invalid.", 400);
  }
  const supabase = getSupabase();
  const result = await supabase
    .from("clientbridge_invitations")
    .update({
      status: "declined",
      declined_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("token_hash", sha256(token))
    .in("status", ["pending", "queued", "sent", "opened"])
    .select("id")
    .maybeSingle();
  if (result.error) throw new ClientBridgeServiceError("Unable to save this decline choice.", 500);
  if (!result.data) throw new ClientBridgeServiceError("This invitation is no longer active.", 409);
  return { status: "declined" as const };
}
