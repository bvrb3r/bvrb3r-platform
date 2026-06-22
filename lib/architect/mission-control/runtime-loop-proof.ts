import type { JsonRecord } from "@/lib/architect/debug/types";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CoreLoopFixture } from "@/lib/architect/mission-control/foundation";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type RuntimeLoopTableName =
  | "profiles"
  | "clients"
  | "barbers"
  | "shops"
  | "appointments"
  | "services"
  | "availability_rules"
  | "shop_barber_relationships"
  | "staff_locations"
  | "appointment_status_history";

export type RuntimeLoopTableRead = {
  rows: JsonRecord[];
  connected: boolean;
  errorMessage?: string;
};

export type RuntimeLoopProofTables = Record<RuntimeLoopTableName, RuntimeLoopTableRead>;

const RUNTIME_LOOP_TABLES: RuntimeLoopTableName[] = [
  "profiles",
  "clients",
  "barbers",
  "shops",
  "appointments",
  "services",
  "availability_rules",
  "shop_barber_relationships",
  "staff_locations",
  "appointment_status_history"
];

const SEEDED_IDENTITY_PATTERNS = ["@example.", "seed", "demo", "fake"];

export async function buildProductOperationsRuntimeLoopProofFixture(supabase: SupabaseClient): Promise<CoreLoopFixture> {
  const entries = await Promise.all(RUNTIME_LOOP_TABLES.map(async (table) => [table, await trySelectRows(supabase, table)] as const));
  return buildProductOperationsRuntimeLoopProofFixtureFromTables(Object.fromEntries(entries) as RuntimeLoopProofTables);
}

export function buildProductOperationsRuntimeLoopProofFixtureFromTables(tables: Partial<RuntimeLoopProofTables>): CoreLoopFixture {
  const profiles = tableRead(tables.profiles);
  const clients = tableRead(tables.clients);
  const barbers = tableRead(tables.barbers);
  const shops = tableRead(tables.shops);
  const appointments = tableRead(tables.appointments);
  const services = tableRead(tables.services);
  const availabilityRules = tableRead(tables.availability_rules);
  const shopRelationships = tableRead(tables.shop_barber_relationships);
  const staffLocations = tableRead(tables.staff_locations);
  const statusHistory = tableRead(tables.appointment_status_history);

  const clientProfileRows = profiles.rows.filter((row) => hasAnyRole(row, ["client_user"]));
  const barberProfileRows = profiles.rows.filter((row) => hasAnyRole(row, ["barber_user"]));
  const ownerProfileRows = profiles.rows.filter((row) => hasAnyRole(row, ["shop_owner_user"]));
  const seededClientIdentityFound = clientProfileRows.some(hasSeededIdentity);
  const seededBarberIdentityFound = barberProfileRows.some(hasSeededIdentity);
  const seededOwnerIdentityFound = ownerProfileRows.some(hasSeededIdentity);

  const clientRowsExist = connectedHasRows(clients) ?? connectedHasRows(profiles, clientProfileRows);
  const barberRowsExist = connectedHasRows(barbers) ?? connectedHasRows(profiles, barberProfileRows);
  const ownerRowsExist = connectedHasRows(profiles, ownerProfileRows);
  const shopRowsExist = connectedHasRows(shops, shops.rows.filter(isActiveEntity));

  const activeBarberRows = barbers.rows.filter(isActiveEntity);
  const activeShopRows = shops.rows.filter(isActiveEntity);
  const appointmentRows = appointments.rows;
  const appointmentWithClient = appointmentRows.find(hasClientReference) ?? null;
  const appointmentWithBarber = appointmentRows.find(hasBarberReference) ?? null;
  const appointmentWithService = appointmentRows.find(hasServiceReference) ?? null;
  const completedAppointment = appointmentRows.find(isCompletedAppointment) ?? null;
  const completionHistoryRows = statusHistory.rows.filter(isCompletedHistoryRow);
  const relationshipRows = [...shopRelationships.rows, ...staffLocations.rows];
  const relationshipReadConnected = shopRelationships.connected || staffLocations.connected;
  const activeRelationshipRows = relationshipRows.filter(isActiveRelationshipRow);
  const pendingRelationshipRows = relationshipRows.filter(isPendingRelationshipRow);
  const serviceRows = services.rows.filter(isBookableServiceRow);
  const availabilityRows = availabilityRules.rows;

  const selectedBarberResolves = resolveWhenConnected([appointments, barbers], () =>
    Boolean(appointmentWithBarber) && matchesBarber(appointmentWithBarber, activeBarberRows)
  );
  const selectedServiceResolves = resolveWhenConnected([appointments, services], () =>
    Boolean(appointmentWithService) && matchesService(appointmentWithService, serviceRows)
  );
  const canonicalLocationResolves = resolveWhenConnected([appointments], () =>
    appointmentRows.some((appointment) => hasCanonicalAppointmentLocation(appointment))
  );
  const availabilityRulesGenerateSlots = resolveWhenConnected([availabilityRules, barbers], () =>
    availabilityRows.some((rule) => matchesAnyBarber(rule, activeBarberRows))
  );
  const noAppointmentBeforeFinalConfirm = resolveWhenConnected([appointments], () =>
    appointmentRows.length > 0 && appointmentRows.every((appointment) => !isPreConfirmAppointment(appointment))
  );
  const appointmentCreated = resolveWhenConnected([appointments], () => appointmentRows.length > 0 && Boolean(appointmentWithClient));
  const barberCalendarVisible = resolveWhenConnected([appointments, barbers], () =>
    Boolean(appointmentWithBarber) && matchesBarber(appointmentWithBarber, activeBarberRows)
  );
  const completionEvidence = resolveWhenConnected([appointments, statusHistory], () =>
    Boolean(completedAppointment) && completionHistoryRows.some((row) => matchesAppointment(row, completedAppointment))
  );
  const ownerCompletionHidden = resolveWhenConnected([appointments, statusHistory], () =>
    Boolean(completedAppointment) && completionHistoryRows.some((row) => matchesAppointment(row, completedAppointment) && !looksOwnerCompleted(row))
  );
  const ownerInviteCanExist = relationshipReadConnected
    ? pendingRelationshipRows.length > 0 || activeRelationshipRows.some((row) => hasOwnerApproval(row)) || undefined
    : undefined;
  const barberCanAccept = relationshipReadConnected
    ? activeRelationshipRows.some((row) => hasBarberApproval(row)) || undefined
    : undefined;
  const activeRelationshipAppearsInOwnerHome = relationshipReadConnected && shops.connected
    ? activeRelationshipRows.some((row) => matchesAnyShop(row, activeShopRows)) || undefined
    : undefined;
  const pendingInvitesExcluded = relationshipReadConnected
    ? activeRelationshipRows.length > 0 && !activeRelationshipRows.some(isPendingRelationshipRow)
    : undefined;
  const acceptedBarberAppearsInScoreboard = relationshipReadConnected && barbers.connected
    ? activeRelationshipRows.some((row) => matchesAnyBarber(row, activeBarberRows)) || undefined
    : undefined;
  const profileRoleRemainsBarberUser = relationshipReadConnected && profiles.connected
    ? activeRelationshipRows.some((row) => relationshipBarberHasCanonicalProfile(row, activeBarberRows, barberProfileRows)) || undefined
    : undefined;
  const shopProductionUsesShopContext = resolveWhenConnected([appointments, shops], () =>
    appointmentRows.some((appointment) => Boolean(text(appointment.shop_id)) && matchesAnyShop(appointment, activeShopRows))
  );
  const ownerTimelineShopWide = resolveWhenConnected([appointments, shops], () =>
    appointmentRows.some((appointment) => Boolean(text(appointment.shop_id)) && hasTimeEvidence(appointment))
  );

  return {
    cultureBooking: {
      appointmentCreatedThroughBooking: appointmentCreated,
      appointmentAppearsOnBarberCalendar: barberCalendarVisible
    },
    bookingAvailability: {
      selectedBarberResolves,
      selectedServiceResolves,
      canonicalLocationResolves,
      availabilityRulesGenerateSlots,
      noAppointmentBeforeFinalConfirm
    },
    barberCalendar: {
      appointmentAppearsOnCommandCalendar: barberCalendarVisible,
      barberCanCompleteOwnService: completionEvidence,
      ownerCannotCompleteBarberService: ownerCompletionHidden
    },
    shopRelationship: {
      ownerInviteCanExist,
      barberCanAccept,
      activeRelationshipAppearsInOwnerHome,
      pendingInvitesExcludedFromActiveCount: pendingInvitesExcluded,
      acceptedBarberAppearsInScoreboard,
      profileRoleRemainsBarberUser
    },
    ownerCommandCalendar: {
      activeBarbersFromRelationships: relationshipReadConnected ? activeRelationshipRows.length > 0 || undefined : undefined,
      pendingInvitesExcluded,
      shopProductionUsesShopContext,
      ownerTimelineShopWide,
      ownerCompleteServiceHidden: ownerCompletionHidden
    },
    paymentRouting: {},
    cultureSocial: {},
    ...(clientRowsExist === false || seededClientIdentityFound ? { cultureBooking: { appointmentCreatedThroughBooking: false } } : {}),
    ...(barberRowsExist === false || seededBarberIdentityFound ? { barberCalendar: { appointmentAppearsOnCommandCalendar: false } } : {}),
    ...(ownerRowsExist === false || shopRowsExist === false || seededOwnerIdentityFound ? { ownerCommandCalendar: { activeBarbersFromRelationships: false } } : {})
  };
}

async function trySelectRows(supabase: SupabaseClient, table: RuntimeLoopTableName): Promise<RuntimeLoopTableRead> {
  try {
    const result = await supabase.from(table).select("*").limit(10000);
    if (result.error) {
      return { rows: [], connected: false, errorMessage: result.error.message ?? `${table} could not be read.` };
    }
    return { rows: (result.data ?? []) as JsonRecord[], connected: true };
  } catch (error) {
    return { rows: [], connected: false, errorMessage: error instanceof Error ? error.message : `${table} could not be read.` };
  }
}

function tableRead(read?: RuntimeLoopTableRead): RuntimeLoopTableRead {
  return read ?? { rows: [], connected: false, errorMessage: "Not connected." };
}

function connectedHasRows(read: RuntimeLoopTableRead, rows: JsonRecord[] = read.rows): boolean | undefined {
  if (!read.connected) return undefined;
  return rows.length > 0 ? true : undefined;
}

function resolveWhenConnected(reads: RuntimeLoopTableRead[], evaluate: () => boolean): boolean | undefined {
  if (reads.some((read) => !read.connected)) return undefined;
  return evaluate() ? true : undefined;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function hasAnyRole(row: JsonRecord, roles: string[]) {
  const roleValues = [row.role, row.primary_onboarding_role, row.user_role, row.account_role, row.profile_role].map(lower);
  return roles.some((role) => roleValues.includes(role));
}

function hasSeededIdentity(row: JsonRecord) {
  const haystack = [row.email, row.full_name, row.display_name, row.username, row.handle]
    .map(lower)
    .join(" ");
  return SEEDED_IDENTITY_PATTERNS.some((pattern) => haystack.includes(pattern));
}

function isActiveEntity(row: JsonRecord) {
  const status = lower(row.status ?? row.account_status ?? row.lifecycle_status);
  const approval = lower(row.app_approval_status ?? row.approval_status ?? row.verification_status);
  return !["inactive", "suspended", "deleted", "ended", "declined", "rejected"].includes(status)
    && !["rejected", "suspended", "denied"].includes(approval);
}

function isBookableServiceRow(row: JsonRecord) {
  const status = lower(row.status ?? row.service_status ?? "active");
  return row.active !== false && row.is_bookable !== false && !["inactive", "archived", "deleted"].includes(status);
}

function hasClientReference(row: JsonRecord) {
  return Boolean(text(row.client_id ?? row.client_profile_id ?? row.profile_id));
}

function hasBarberReference(row: JsonRecord) {
  return Boolean(text(row.barber_id ?? row.barber_profile_id ?? row.barber_reference));
}

function hasServiceReference(row: JsonRecord) {
  return Boolean(text(row.service_id ?? row.service_reference ?? row.service_reference_code));
}

function hasCanonicalAppointmentLocation(row: JsonRecord) {
  if (text(row.shop_id)) return true;
  return !text(row.shop_id) && Boolean(text(row.location_id ?? row.barber_id ?? row.barber_reference));
}

function hasTimeEvidence(row: JsonRecord) {
  return Boolean(text(row.starts_at ?? row.start_time ?? row.scheduled_at ?? row.appointment_date ?? row.created_at));
}

function isPreConfirmAppointment(row: JsonRecord) {
  return ["draft", "cart", "selecting", "pending_payment", "payment_pending"].includes(lower(row.status));
}

function isCompletedAppointment(row: JsonRecord) {
  return ["completed", "service_completed"].includes(lower(row.status)) || Boolean(row.completed_at);
}

function isCompletedHistoryRow(row: JsonRecord) {
  const haystack = [row.status, row.new_status, row.change_reason, row.event_type].map(lower).join(" ");
  return haystack.includes("completed") || haystack.includes("service_completed") || haystack.includes("complete service");
}

function matchesAppointment(row: JsonRecord, appointment: JsonRecord | null) {
  if (!appointment) return false;
  return text(row.appointment_id) === text(appointment.id);
}

function looksOwnerCompleted(row: JsonRecord) {
  const actor = [row.changed_by_role, row.actor_role, row.role, row.changed_by_type].map(lower).join(" ");
  return actor.includes("owner") || actor.includes("shop_owner");
}

function matchesBarber(row: JsonRecord | null, barbers: JsonRecord[]) {
  if (!row) return false;
  return matchesAnyBarber(row, barbers);
}

function matchesAnyBarber(row: JsonRecord, barbers: JsonRecord[]) {
  const candidates = new Set([
    text(row.barber_id),
    text(row.barber_profile_id),
    text(row.profile_id),
    text(row.barber_reference),
    text(row.barber_reference_code)
  ].filter(Boolean));
  return barbers.some((barber) => [
    barber.id,
    barber.profile_id,
    barber.reference_code,
    barber.booking_slug,
    barber.barber_reference
  ].some((value) => candidates.has(text(value))));
}

function matchesService(row: JsonRecord | null, services: JsonRecord[]) {
  if (!row) return false;
  const candidates = new Set([
    text(row.service_id),
    text(row.service_reference),
    text(row.service_reference_code)
  ].filter(Boolean));
  return services.some((service) => [service.id, service.reference_code, service.service_reference].some((value) => candidates.has(text(value))));
}

function matchesAnyShop(row: JsonRecord, shops: JsonRecord[]) {
  const candidates = new Set([text(row.shop_id), text(row.location_shop_id), text(row.owner_shop_id)].filter(Boolean));
  return shops.some((shop) => [shop.id, shop.shop_id].some((value) => candidates.has(text(value))));
}

function isActiveRelationshipRow(row: JsonRecord) {
  const status = lower(row.status ?? row.relationship_status ?? row.membership_status);
  return ["active", "accepted", "connected"].includes(status) || Boolean(row.approved_by_barber_at && row.started_at);
}

function isPendingRelationshipRow(row: JsonRecord) {
  const status = lower(row.status ?? row.relationship_status ?? row.membership_status);
  return ["pending", "invited", "invite_pending", "pending_invite", "requested"].includes(status);
}

function hasOwnerApproval(row: JsonRecord) {
  return Boolean(row.approved_by_owner_at ?? row.owner_approved_at ?? row.invited_at ?? row.created_at);
}

function hasBarberApproval(row: JsonRecord) {
  return Boolean(row.approved_by_barber_at ?? row.barber_approved_at ?? row.accepted_at ?? isActiveRelationshipRow(row));
}

function relationshipBarberHasCanonicalProfile(row: JsonRecord, barbers: JsonRecord[], barberProfiles: JsonRecord[]) {
  const matchingBarber = barbers.find((barber) => matchesAnyBarber(row, [barber]));
  if (!matchingBarber) return false;
  const profileId = text(matchingBarber.profile_id ?? row.barber_profile_id);
  return barberProfiles.some((profile) => text(profile.id) === profileId || text(profile.id) === text(row.barber_profile_id));
}