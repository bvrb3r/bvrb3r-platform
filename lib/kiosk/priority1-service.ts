import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { currentLegalVersions } from "@/lib/legal/documents";
import {
  appointmentSourceLabel,
  assertExternalMoneyIsolation,
  clientBridgeStageFromStatus,
  contactFingerprint,
  createPublicReference,
  createSecureToken,
  hashToken,
  maskEmail,
  maskPhone,
  normalizeAppointmentSource,
  normalizeEmail,
  normalizePaymentOwner,
  normalizePhone,
  paymentOwnerLabel,
  queryFingerprint,
  queueStateFromStatus,
  sourceAllowsGuestCheckIn
} from "@/lib/kiosk/priority1";
import type {
  AppointmentSource,
  ClientBridgeActivationInput,
  ClientBridgeActivationResult,
  ClientBridgeInvitationInput,
  ClientBridgeInvitationResult,
  KioskAppointmentSearchInput,
  KioskAppointmentSearchResponse,
  KioskAppointmentSearchResult,
  KioskCheckInInput,
  KioskCheckInResult,
  KioskQueueStatusResult,
  NotificationDeliveryState,
  PaymentOwner
} from "@/types/kiosk";

export class PriorityOneKioskError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "priority1_kiosk_error") {
    super(message);
    this.name = "PriorityOneKioskError";
    this.status = status;
    this.code = code;
  }
}

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ProfileRow = {
  id: string;
  full_name: string;
  public_username: string | null;
  email: string;
  phone: string | null;
  role: string;
  profile_photo_url?: string | null;
};

type ClientRow = { id: string; profile_id: string | null };
type BarberRow = { id: string; profile_id: string };
type ServiceRow = { id: string; name: string; duration_min?: number | null };

type NativeAppointmentRow = {
  id: string;
  location_id: string;
  shop_id: string | null;
  barber_id: string;
  client_id: string;
  service_id: string;
  status: string;
  source: string;
  booking_source: string;
  payment_owner?: string | null;
  original_booking_source?: string | null;
  starts_at: string;
  ends_at: string;
  confirmation_code: string;
  checked_in_at?: string | null;
  source_attribution?: Record<string, unknown> | null;
};

type ExternalAppointmentRow = {
  id: string;
  provider: string;
  provider_appointment_id: string;
  shop_id: string | null;
  location_id: string | null;
  barber_id: string;
  service_id: string | null;
  service_name: string;
  guest_display_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  payment_owner: string;
  provider_open_url: string | null;
};

function admin() {
  const client = createSupabaseAdminClient();
  if (!client) {
    throw new PriorityOneKioskError("Kiosk services are temporarily unavailable.", 503, "kiosk_service_unavailable");
  }
  return client;
}

function isoRange(anchor?: string) {
  const center = anchor ? new Date(anchor) : new Date();
  if (Number.isNaN(center.getTime())) {
    throw new PriorityOneKioskError("The appointment time is invalid.", 400, "invalid_appointment_time");
  }
  const start = new Date(center.getTime() - 18 * 60 * 60 * 1000);
  const end = new Date(center.getTime() + 36 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function normalizeShopTarget(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

async function resolveShop(supabase: AdminClient, target: string) {
  const normalized = normalizeShopTarget(target);
  const shopResult = await supabase
    .from("shops")
    .select("id, name, public_username, phone")
    .or(`id.eq.${target},public_username.ilike.${normalized}`)
    .maybeSingle();
  if (shopResult.error) throw new PriorityOneKioskError("Unable to load this shop.", 500, "shop_lookup_failed");

  const shop = shopResult.data as { id: string; name: string; public_username: string | null; phone: string | null } | null;
  if (!shop) throw new PriorityOneKioskError("This shop could not be found.", 404, "shop_not_found");

  const locationResult = await supabase
    .from("locations")
    .select("id, reference_code, name")
    .or(`reference_code.eq.${shop.id},reference_code.eq.${shop.public_username ?? shop.id}`)
    .maybeSingle();
  if (locationResult.error) throw new PriorityOneKioskError("Unable to load the shop location.", 500, "location_lookup_failed");

  return {
    shop,
    locationId: (locationResult.data as { id?: string } | null)?.id ?? null
  };
}

async function profileMap(supabase: AdminClient, profileIds: string[]) {
  if (!profileIds.length) return new Map<string, ProfileRow>();
  const result = await supabase
    .from("profiles")
    .select("id, full_name, public_username, email, phone, role, profile_photo_url")
    .in("id", [...new Set(profileIds)]);
  if (result.error) throw new PriorityOneKioskError("Unable to load appointment identities.", 500, "profile_lookup_failed");
  return new Map(((result.data ?? []) as ProfileRow[]).map((row) => [row.id, row]));
}

async function barberProfiles(supabase: AdminClient, barberIds: string[]) {
  if (!barberIds.length) return new Map<string, ProfileRow>();
  const barberResult = await supabase.from("barbers").select("id, profile_id").in("id", [...new Set(barberIds)]);
  if (barberResult.error) throw new PriorityOneKioskError("Unable to load barber identities.", 500, "barber_lookup_failed");
  const rows = (barberResult.data ?? []) as BarberRow[];
  const profiles = await profileMap(supabase, rows.map((row) => row.profile_id));
  return new Map(rows.map((row) => [row.id, profiles.get(row.profile_id)]).filter((entry): entry is [string, ProfileRow] => Boolean(entry[1])));
}

async function serviceMap(supabase: AdminClient, serviceIds: string[]) {
  if (!serviceIds.length) return new Map<string, ServiceRow>();
  const result = await supabase.from("services").select("id, name, duration_min").in("id", [...new Set(serviceIds)]);
  if (result.error) throw new PriorityOneKioskError("Unable to load appointment services.", 500, "service_lookup_failed");
  return new Map(((result.data ?? []) as ServiceRow[]).map((row) => [row.id, row]));
}

async function clientProfiles(supabase: AdminClient, clientIds: string[]) {
  if (!clientIds.length) return new Map<string, ProfileRow>();
  const result = await supabase.from("clients").select("id, profile_id").in("id", [...new Set(clientIds)]);
  if (result.error) throw new PriorityOneKioskError("Unable to load client identities.", 500, "client_lookup_failed");
  const rows = (result.data ?? []) as ClientRow[];
  const profiles = await profileMap(supabase, rows.map((row) => row.profile_id).filter(Boolean) as string[]);
  return new Map(rows.map((row) => [row.id, row.profile_id ? profiles.get(row.profile_id) : undefined]).filter((entry): entry is [string, ProfileRow] => Boolean(entry[1])));
}

function nativeResult(input: {
  appointment: NativeAppointmentRow;
  client?: ProfileRow;
  barber?: ProfileRow;
  service?: ServiceRow;
}): KioskAppointmentSearchResult {
  const source = normalizeAppointmentSource(input.appointment.original_booking_source ?? input.appointment.booking_source ?? input.appointment.source);
  const paymentOwner = normalizePaymentOwner(input.appointment.payment_owner, source);
  const result: KioskAppointmentSearchResult = {
    appointmentId: input.appointment.id,
    appointmentKind: "native",
    source,
    sourceLabel: appointmentSourceLabel(source),
    paymentOwner,
    paymentOwnerLabel: paymentOwnerLabel(paymentOwner),
    clientDisplayName: input.client?.full_name ?? "BVRB3R Client",
    barberId: input.appointment.barber_id,
    barberName: input.barber?.full_name ?? "Your Barber",
    serviceId: input.appointment.service_id,
    serviceName: input.service?.name ?? "Service",
    startsAt: input.appointment.starts_at,
    endsAt: input.appointment.ends_at,
    status: input.appointment.status,
    maskedPhone: maskPhone(input.client?.phone),
    maskedEmail: maskEmail(input.client?.email),
    providerOpenUrl: null,
    alreadyCheckedIn: Boolean(input.appointment.checked_in_at) || ["checked_in", "in_service", "completed"].includes(input.appointment.status),
    canContinueAsGuest: false,
    clientBridgeStage: null
  };
  assertExternalMoneyIsolation(result);
  return result;
}

function externalResult(input: {
  appointment: ExternalAppointmentRow;
  barber?: ProfileRow;
  bridgeStatus?: string | null;
}): KioskAppointmentSearchResult {
  const source = normalizeAppointmentSource(input.appointment.provider);
  const paymentOwner = normalizePaymentOwner(input.appointment.payment_owner, source);
  const result: KioskAppointmentSearchResult = {
    appointmentId: input.appointment.id,
    appointmentKind: "external",
    source,
    sourceLabel: appointmentSourceLabel(source),
    paymentOwner,
    paymentOwnerLabel: paymentOwnerLabel(paymentOwner),
    clientDisplayName: input.appointment.guest_display_name,
    barberId: input.appointment.barber_id,
    barberName: input.barber?.full_name ?? "Your Barber",
    serviceId: input.appointment.service_id,
    serviceName: input.appointment.service_name,
    startsAt: input.appointment.starts_at,
    endsAt: input.appointment.ends_at,
    status: input.appointment.status,
    maskedPhone: maskPhone(input.appointment.guest_phone),
    maskedEmail: maskEmail(input.appointment.guest_email),
    providerOpenUrl: input.appointment.provider_open_url,
    alreadyCheckedIn: ["checked_in", "waiting", "almost_ready", "ready", "in_chair", "completed"].includes(input.appointment.status),
    canContinueAsGuest: sourceAllowsGuestCheckIn(source),
    clientBridgeStage: clientBridgeStageFromStatus(input.bridgeStatus)
  };
  assertExternalMoneyIsolation(result);
  return result;
}

async function matchingClientIds(supabase: AdminClient, input: KioskAppointmentSearchInput) {
  const normalizedPhone = normalizePhone(input.phone);
  const normalizedEmail = normalizeEmail(input.email);
  const name = input.fullName?.trim();
  if (!normalizedPhone && !normalizedEmail && !name) return [];

  let query = supabase.from("profiles").select("id").eq("role", "client_user").limit(20);
  if (normalizedPhone) query = query.ilike("phone", `%${normalizedPhone.slice(-7)}%`);
  else if (normalizedEmail) query = query.ilike("email", normalizedEmail);
  else if (name) query = query.ilike("full_name", `%${name}%`);

  const profiles = await query;
  if (profiles.error) throw new PriorityOneKioskError("Unable to search client identities.", 500, "client_search_failed");
  const profileIds = (profiles.data ?? []).map((row: { id: string }) => row.id);
  if (!profileIds.length) return [];
  const clients = await supabase.from("clients").select("id").in("profile_id", profileIds);
  if (clients.error) throw new PriorityOneKioskError("Unable to search client appointments.", 500, "client_search_failed");
  return (clients.data ?? []).map((row: { id: string }) => row.id);
}

export async function searchKioskAppointments(shopTarget: string, input: KioskAppointmentSearchInput): Promise<KioskAppointmentSearchResponse> {
  const supabase = admin();
  const { shop, locationId } = await resolveShop(supabase, shopTarget);
  const range = isoRange(input.startsAt);
  const clientIds = await matchingClientIds(supabase, input);

  let nativeQuery = supabase
    .from("appointments")
    .select("id, location_id, shop_id, barber_id, client_id, service_id, status, source, booking_source, payment_owner, original_booking_source, starts_at, ends_at, confirmation_code, checked_in_at, source_attribution")
    .gte("starts_at", range.start)
    .lte("starts_at", range.end)
    .limit(20);
  if (locationId) nativeQuery = nativeQuery.eq("location_id", locationId);
  else nativeQuery = nativeQuery.eq("shop_id", shop.id);
  if (input.confirmationCode?.trim()) nativeQuery = nativeQuery.ilike("confirmation_code", input.confirmationCode.trim());
  else if (clientIds.length) nativeQuery = nativeQuery.in("client_id", clientIds);
  else nativeQuery = nativeQuery.eq("id", "00000000-0000-0000-0000-000000000000");

  const externalFingerprint = contactFingerprint({ phone: input.phone, email: input.email });
  let externalQuery = supabase
    .from("chair_sync_external_appointments")
    .select("id, provider, provider_appointment_id, shop_id, location_id, barber_id, service_id, service_name, guest_display_name, guest_phone, guest_email, status, starts_at, ends_at, payment_owner, provider_open_url")
    .gte("starts_at", range.start)
    .lte("starts_at", range.end)
    .limit(20);
  if (locationId) externalQuery = externalQuery.eq("location_id", locationId);
  else externalQuery = externalQuery.eq("shop_id", shop.id);
  if (externalFingerprint) externalQuery = externalQuery.eq("guest_contact_fingerprint", externalFingerprint);
  else if (input.fullName?.trim()) externalQuery = externalQuery.ilike("guest_display_name", `%${input.fullName.trim()}%`);
  else externalQuery = externalQuery.eq("id", "00000000-0000-0000-0000-000000000000");

  const [nativeResponse, externalResponse] = await Promise.all([nativeQuery, externalQuery]);
  if (nativeResponse.error) throw new PriorityOneKioskError("Unable to search BVRB3R appointments.", 500, "native_appointment_search_failed");
  if (externalResponse.error && externalResponse.error.code !== "42P01") {
    throw new PriorityOneKioskError("Unable to search connected appointments.", 500, "external_appointment_search_failed");
  }

  const nativeRows = (nativeResponse.data ?? []) as NativeAppointmentRow[];
  const externalRows = (externalResponse.data ?? []) as ExternalAppointmentRow[];
  const barberMap = await barberProfiles(supabase, [...nativeRows.map((row) => row.barber_id), ...externalRows.map((row) => row.barber_id)]);
  const clients = await clientProfiles(supabase, nativeRows.map((row) => row.client_id));
  const services = await serviceMap(supabase, [...nativeRows.map((row) => row.service_id), ...externalRows.map((row) => row.service_id).filter(Boolean) as string[]]);

  const bridgeByExternal = new Map<string, string>();
  if (externalRows.length) {
    const bridge = await supabase
      .from("client_bridge_invitations")
      .select("external_appointment_id, status, created_at")
      .in("external_appointment_id", externalRows.map((row) => row.id))
      .order("created_at", { ascending: false });
    if (!bridge.error) {
      for (const row of bridge.data ?? []) {
        if (row.external_appointment_id && !bridgeByExternal.has(row.external_appointment_id)) {
          bridgeByExternal.set(row.external_appointment_id, row.status);
        }
      }
    }
  }

  const results = [
    ...nativeRows.map((appointment) => nativeResult({
      appointment,
      client: clients.get(appointment.client_id),
      barber: barberMap.get(appointment.barber_id),
      service: services.get(appointment.service_id)
    })),
    ...externalRows.map((appointment) => externalResult({
      appointment,
      barber: barberMap.get(appointment.barber_id),
      bridgeStatus: bridgeByExternal.get(appointment.id)
    }))
  ].sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());

  return {
    results,
    queryFingerprint: queryFingerprint(input as Record<string, unknown>),
    sourceCoverage: [...new Set(results.map((result) => result.source))]
  };
}

async function getAppointmentById(supabase: AdminClient, kind: "native" | "external", id: string) {
  if (kind === "external") {
    const response = await supabase
      .from("chair_sync_external_appointments")
      .select("id, provider, provider_appointment_id, shop_id, location_id, barber_id, service_id, service_name, guest_display_name, guest_phone, guest_email, status, starts_at, ends_at, payment_owner, provider_open_url")
      .eq("id", id)
      .maybeSingle();
    if (response.error || !response.data) throw new PriorityOneKioskError("The connected appointment could not be found.", 404, "external_appointment_not_found");
    const appointment = response.data as ExternalAppointmentRow;
    const barbers = await barberProfiles(supabase, [appointment.barber_id]);
    return {
      result: externalResult({ appointment, barber: barbers.get(appointment.barber_id) }),
      locationId: appointment.location_id,
      shopId: appointment.shop_id,
      clientId: null,
      guestPhone: appointment.guest_phone,
      guestEmail: appointment.guest_email
    };
  }

  const response = await supabase
    .from("appointments")
    .select("id, location_id, shop_id, barber_id, client_id, service_id, status, source, booking_source, payment_owner, original_booking_source, starts_at, ends_at, confirmation_code, checked_in_at, source_attribution")
    .eq("id", id)
    .maybeSingle();
  if (response.error || !response.data) throw new PriorityOneKioskError("The BVRB3R appointment could not be found.", 404, "native_appointment_not_found");
  const appointment = response.data as NativeAppointmentRow;
  const [clients, barbers, services] = await Promise.all([
    clientProfiles(supabase, [appointment.client_id]),
    barberProfiles(supabase, [appointment.barber_id]),
    serviceMap(supabase, [appointment.service_id])
  ]);
  const client = clients.get(appointment.client_id);
  return {
    result: nativeResult({ appointment, client, barber: barbers.get(appointment.barber_id), service: services.get(appointment.service_id) }),
    locationId: appointment.location_id,
    shopId: appointment.shop_id,
    clientId: appointment.client_id,
    guestPhone: client?.phone ?? null,
    guestEmail: client?.email ?? null
  };
}

async function verifiedClient(supabase: AdminClient, profileId?: string) {
  if (!profileId) return null;
  const profileResponse = await supabase
    .from("profiles")
    .select("id, full_name, public_username, email, phone, role")
    .eq("id", profileId)
    .eq("role", "client_user")
    .maybeSingle();
  if (profileResponse.error || !profileResponse.data) {
    throw new PriorityOneKioskError("The selected BVRB3R Client could not be verified.", 403, "client_verification_required");
  }
  const clientResponse = await supabase.from("clients").select("id, profile_id").eq("profile_id", profileId).maybeSingle();
  if (clientResponse.error || !clientResponse.data) {
    throw new PriorityOneKioskError("The selected account is not Client-ready.", 409, "client_record_missing");
  }
  return { profile: profileResponse.data as ProfileRow, client: clientResponse.data as ClientRow };
}

async function nextQueuePosition(supabase: AdminClient, locationId: string) {
  const result = await supabase
    .from("walk_in_queue")
    .select("position")
    .eq("location_id", locationId)
    .in("status", ["waiting", "assigned", "in_service"])
    .order("position", { ascending: false })
    .limit(1);
  if (result.error) throw new PriorityOneKioskError("Unable to calculate the live queue position.", 500, "queue_position_failed");
  return Number(result.data?.[0]?.position ?? 0) + 1;
}

async function queueAverageWait(supabase: AdminClient, locationId: string) {
  const result = await supabase
    .from("walk_in_queue")
    .select("wait_minutes")
    .eq("location_id", locationId)
    .in("status", ["waiting", "assigned", "in_service"]);
  if (result.error) return 10;
  const values = (result.data ?? []).map((row: { wait_minutes: number }) => Number(row.wait_minutes)).filter(Number.isFinite);
  if (!values.length) return 10;
  return Math.max(5, Math.round(values.reduce((sum, value) => sum + value, 0) / values.length));
}

async function queueNotificationRows(input: {
  supabase: AdminClient;
  profileId?: string | null;
  phone?: string | null;
  email?: string | null;
  appointmentReference: string;
  barberReference: string;
  locationReference: string;
  queueReference: string;
  waitDisplayLabel: string;
  smsConsent: boolean;
  emailConsent: boolean;
}) {
  const states: KioskCheckInResult["notificationStates"] = [];
  const rows: Array<Record<string, unknown>> = [];
  if (input.smsConsent && input.phone) {
    rows.push({
      profile_id: input.profileId ?? null,
      channel: "sms",
      title: "You are checked in",
      body: `Your BVRB3R queue reference is ${input.queueReference}. ${input.waitDisplayLabel}.`,
      status: "queued",
      notification_type: "kiosk_queue_confirmation",
      client_reference: input.queueReference,
      appointment_reference: input.appointmentReference,
      barber_reference: input.barberReference,
      location_reference: input.locationReference,
      dedupe_key: `kiosk:${input.queueReference}:confirmation:sms`,
      metadata: { phone: input.phone, queue_reference: input.queueReference, operational: true }
    });
    states.push({ channel: "sms", state: "queued" });
  }
  if (input.emailConsent && input.email) {
    rows.push({
      profile_id: input.profileId ?? null,
      channel: "email",
      title: "You are checked in",
      body: `Your BVRB3R queue reference is ${input.queueReference}. ${input.waitDisplayLabel}.`,
      status: "queued",
      audience_email: input.email,
      client_email: input.email,
      notification_type: "kiosk_queue_confirmation",
      client_reference: input.queueReference,
      appointment_reference: input.appointmentReference,
      barber_reference: input.barberReference,
      location_reference: input.locationReference,
      dedupe_key: `kiosk:${input.queueReference}:confirmation:email`,
      metadata: { queue_reference: input.queueReference, operational: true }
    });
    states.push({ channel: "email", state: "queued" });
  }
  if (rows.length) {
    const insert = await input.supabase.from("notifications").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (insert.error) {
      return states.map((item) => ({ ...item, state: "failed" as NotificationDeliveryState }));
    }
  }
  return states;
}

export async function checkInKioskAppointment(shopTarget: string, input: KioskCheckInInput): Promise<KioskCheckInResult> {
  const supabase = admin();
  const resolvedShop = await resolveShop(supabase, shopTarget);
  const appointment = await getAppointmentById(supabase, input.appointmentKind, input.appointmentId);
  if (appointment.result.alreadyCheckedIn) {
    throw new PriorityOneKioskError("This appointment is already checked in.", 409, "appointment_already_checked_in");
  }
  if (["canceled", "cancelled", "no_show", "completed"].includes(appointment.result.status)) {
    throw new PriorityOneKioskError("This appointment can no longer be checked in.", 409, "appointment_not_checkin_eligible");
  }
  if (input.continueAs === "guest" && !appointment.result.canContinueAsGuest) {
    throw new PriorityOneKioskError("This BVRB3R appointment requires account verification.", 403, "verified_client_required");
  }

  const existing = await supabase.from("kiosk_guest_visits").select("id, queue_entry_id, identity_state, visit_status").eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (existing.error) throw new PriorityOneKioskError("Unable to verify kiosk idempotency.", 500, "idempotency_check_failed");
  if (existing.data) {
    const queueReference = existing.data.queue_entry_id ?? existing.data.id;
    return {
      guestVisitId: existing.data.id,
      queueEntryId: existing.data.queue_entry_id,
      queueReference,
      queueStatus: queueStateFromStatus(existing.data.visit_status),
      identityState: existing.data.identity_state,
      appointment: appointment.result,
      notificationStates: [],
      clientBridgeInvitation: null
    };
  }

  const verified = input.continueAs === "verified_client" ? await verifiedClient(supabase, input.selectedProfileId) : null;
  const fullName = verified?.profile.full_name ?? input.fullName?.trim() ?? appointment.result.clientDisplayName;
  const phone = verified?.profile.phone ?? input.phone?.trim() ?? appointment.guestPhone;
  const email = verified?.profile.email ?? input.email?.trim() ?? appointment.guestEmail;
  const identityState = verified ? "verified_bvrb3r_client" : input.continueAs === "join_bvrb3r" ? "bvrb3r_guest" : "external_guest";
  const locationId = appointment.locationId ?? resolvedShop.locationId;
  if (!locationId) throw new PriorityOneKioskError("The shop queue location is unavailable.", 409, "queue_location_missing");

  const position = await nextQueuePosition(supabase, locationId);
  const averageWait = await queueAverageWait(supabase, locationId);
  const estimatedWait = Math.max(5, position * averageWait);
  const waitDisplayLabel = estimatedWait <= 10 ? "About 5–10 minutes" : `About ${Math.max(10, estimatedWait - 5)}–${estimatedWait + 5} minutes`;
  const queueReference = createPublicReference("queue");
  const now = new Date().toISOString();
  const legal = currentLegalVersions();

  const visitInsert = await supabase.from("kiosk_guest_visits").insert({
    shop_id: resolvedShop.shop.id,
    location_id: locationId,
    barber_id: appointment.result.barberId,
    appointment_id: input.appointmentKind === "native" ? input.appointmentId : null,
    external_appointment_id: input.appointmentKind === "external" ? input.appointmentId : null,
    client_id: verified?.client.id ?? appointment.clientId,
    profile_id: verified?.profile.id ?? null,
    identity_state: identityState,
    visit_status: "checked_in",
    booking_source: appointment.result.source,
    payment_owner: appointment.result.paymentOwner,
    guest_display_name: fullName,
    guest_phone: phone,
    guest_email: email,
    transactional_sms_consent: Boolean(input.transactionalSmsConsent),
    transactional_email_consent: Boolean(input.transactionalEmailConsent),
    marketing_consent: Boolean(input.marketingConsent),
    terms_version: input.termsVersion ?? legal.terms,
    privacy_version: input.privacyVersion ?? legal.privacy,
    shop_policy_version: input.shopPolicyVersion ?? "current",
    consent_captured_at: input.transactionalSmsConsent || input.transactionalEmailConsent || input.marketingConsent ? now : null,
    source_attribution: {
      original_appointment_source: appointment.result.source,
      kiosk_touchpoint: input.continueAs,
      payment_owner: appointment.result.paymentOwner
    },
    idempotency_key: input.idempotencyKey
  }).select("id").single();
  if (visitInsert.error || !visitInsert.data) {
    throw new PriorityOneKioskError("Unable to create the kiosk visit.", 500, "guest_visit_create_failed");
  }

  const queueInsert = await supabase.from("walk_in_queue").insert({
    location_id: locationId,
    client_name: fullName,
    requested_service: appointment.result.serviceName,
    requested_at: now,
    status: "assigned",
    assigned_barber_id: appointment.result.barberId,
    reference_code: queueReference,
    client_id: verified?.client.id ?? appointment.clientId,
    position,
    wait_minutes: estimatedWait,
    appointment_id: input.appointmentKind === "native" ? input.appointmentId : null,
    external_appointment_id: input.appointmentKind === "external" ? input.appointmentId : null,
    guest_visit_id: visitInsert.data.id,
    booking_source: appointment.result.source,
    payment_owner: appointment.result.paymentOwner,
    source_attribution: {
      appointment_kind: input.appointmentKind,
      appointment_id: input.appointmentId,
      original_source: appointment.result.source
    }
  }).select("id").single();
  if (queueInsert.error || !queueInsert.data) {
    await supabase.from("kiosk_guest_visits").delete().eq("id", visitInsert.data.id);
    throw new PriorityOneKioskError("Unable to add this visit to the live queue.", 500, "queue_entry_create_failed");
  }

  await supabase.from("kiosk_guest_visits").update({ queue_entry_id: queueInsert.data.id, visit_status: "waiting", updated_at: now }).eq("id", visitInsert.data.id);
  if (input.appointmentKind === "external") {
    await supabase.from("chair_sync_external_appointments").update({ status: "checked_in", updated_at: now }).eq("id", input.appointmentId);
  } else {
    const update = await supabase.from("appointments").update({ status: "checked_in", checked_in_at: now, updated_at: now, last_actor_role: "front_desk", last_event_type: "kiosk_checked_in" }).eq("id", input.appointmentId).neq("status", "checked_in");
    if (!update.error) {
      await supabase.from("appointment_status_history").insert({
        appointment_id: input.appointmentId,
        status: "checked_in",
        old_status: appointment.result.status,
        new_status: "checked_in",
        change_reason: "kiosk_checked_in",
        changed_at: now
      });
    }
  }

  const notificationStates = await queueNotificationRows({
    supabase,
    profileId: verified?.profile.id,
    phone,
    email,
    appointmentReference: input.appointmentId,
    barberReference: appointment.result.barberId,
    locationReference: locationId,
    queueReference,
    waitDisplayLabel,
    smsConsent: Boolean(input.transactionalSmsConsent),
    emailConsent: Boolean(input.transactionalEmailConsent)
  });

  await supabase.from("platform_events").insert({
    event_type: "kiosk_client_checked_in",
    entity_type: "kiosk_guest_visit",
    entity_id: visitInsert.data.id,
    actor_role: "public_kiosk",
    source: "kiosk",
    related_ids: { appointment_id: input.appointmentId, queue_entry_id: queueInsert.data.id, shop_id: resolvedShop.shop.id },
    payload: { identity_state: identityState, booking_source: appointment.result.source, payment_owner: appointment.result.paymentOwner },
    idempotency_key: `kiosk-checkin:${input.idempotencyKey}`,
    occurred_at: now
  });

  let invitation: KioskCheckInResult["clientBridgeInvitation"] = null;
  if (input.continueAs === "join_bvrb3r" && input.appointmentKind === "external") {
    const created = await createClientBridgeInvitation({
      guestVisitId: visitInsert.data.id,
      channel: input.transactionalSmsConsent && phone ? "sms" : input.transactionalEmailConsent && email ? "email" : "onscreen",
      phone: phone ?? undefined,
      email: email ?? undefined,
      consentGranted: true,
      conversionTouchpoint: "kiosk_check_in"
    });
    invitation = { invitationId: created.invitationId, stage: "invitation_offered", expiresAt: created.expiresAt };
  }

  return {
    guestVisitId: visitInsert.data.id,
    queueEntryId: queueInsert.data.id,
    queueReference,
    queueStatus: "waiting",
    identityState,
    appointment: appointment.result,
    estimatedWaitMinutes: estimatedWait,
    waitDisplayLabel,
    notificationStates,
    clientBridgeInvitation: invitation
  };
}

function maskedDestination(input: { channel: ClientBridgeInvitationInput["channel"]; phone?: string; email?: string }) {
  if (input.channel === "sms") return maskPhone(input.phone);
  if (input.channel === "email") return maskEmail(input.email);
  return null;
}

export async function createClientBridgeInvitation(input: ClientBridgeInvitationInput): Promise<ClientBridgeInvitationResult> {
  if (!input.consentGranted && ["sms", "email"].includes(input.channel)) {
    throw new PriorityOneKioskError("Permission is required before sending a ClientBridge invitation.", 403, "client_bridge_consent_required");
  }
  const supabase = admin();
  const visitResponse = await supabase
    .from("kiosk_guest_visits")
    .select("id, external_appointment_id, client_id, profile_id, barber_id, shop_id, booking_source, guest_phone, guest_email, marketing_consent")
    .eq("id", input.guestVisitId)
    .maybeSingle();
  if (visitResponse.error || !visitResponse.data) {
    throw new PriorityOneKioskError("The guest visit could not be found.", 404, "guest_visit_not_found");
  }
  const visit = visitResponse.data;
  if (!visit.external_appointment_id) {
    throw new PriorityOneKioskError("ClientBridge is reserved for external guest conversion.", 409, "client_bridge_external_visit_required");
  }

  const prior = await supabase
    .from("client_bridge_invitations")
    .select("id, status, invitation_count, offered_at")
    .eq("guest_visit_id", input.guestVisitId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (prior.error) throw new PriorityOneKioskError("Unable to inspect invitation frequency.", 500, "invitation_frequency_check_failed");
  if (prior.data?.status === "opted_out") {
    throw new PriorityOneKioskError("This client opted out of ClientBridge invitations.", 409, "client_bridge_opted_out");
  }
  if (prior.data?.status === "declined") {
    const declinedAt = new Date(prior.data.offered_at).getTime();
    if (Date.now() - declinedAt < 30 * 24 * 60 * 60 * 1000) {
      throw new PriorityOneKioskError("This client already declined the invitation recently.", 429, "client_bridge_declined_recently");
    }
  }
  if (Number(prior.data?.invitation_count ?? 0) >= 3) {
    throw new PriorityOneKioskError("The ClientBridge invitation limit has been reached.", 429, "client_bridge_frequency_limit");
  }

  const phone = input.phone ?? visit.guest_phone ?? undefined;
  const email = input.email ?? visit.guest_email ?? undefined;
  if (input.channel === "sms" && !phone) throw new PriorityOneKioskError("A phone number is required for SMS.", 400, "sms_destination_missing");
  if (input.channel === "email" && !email) throw new PriorityOneKioskError("An email is required for email delivery.", 400, "email_destination_missing");

  const { token, tokenHash } = createSecureToken();
  const offeredAt = new Date();
  const expiresAt = new Date(offeredAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const insert = await supabase.from("client_bridge_invitations").insert({
    guest_visit_id: visit.id,
    external_appointment_id: visit.external_appointment_id,
    client_id: visit.client_id,
    profile_id: visit.profile_id,
    barber_id: visit.barber_id,
    shop_id: visit.shop_id,
    invitation_channel: input.channel,
    destination_masked: maskedDestination({ channel: input.channel, phone, email }),
    token_hash: tokenHash,
    status: input.channel === "onscreen" || input.channel === "qr" || input.channel === "nfc" ? "offered" : "sent",
    original_appointment_source: visit.booking_source,
    conversion_touchpoint: input.conversionTouchpoint,
    source_attribution: { original_source: visit.booking_source, conversion_touchpoint: input.conversionTouchpoint },
    consent_evidence: { granted: input.consentGranted, channel: input.channel, captured_at: offeredAt.toISOString() },
    invitation_count: Number(prior.data?.invitation_count ?? 0) + 1,
    offered_at: offeredAt.toISOString(),
    sent_at: ["sms", "email"].includes(input.channel) ? offeredAt.toISOString() : null,
    expires_at: expiresAt
  }).select("id, status").single();
  if (insert.error || !insert.data) throw new PriorityOneKioskError("Unable to create the ClientBridge invitation.", 500, "client_bridge_invitation_failed");

  await supabase.from("client_bridge_consent_events").insert({
    guest_visit_id: visit.id,
    invitation_id: insert.data.id,
    event_type: "join_offered",
    evidence: { channel: input.channel, consent_granted: input.consentGranted, touchpoint: input.conversionTouchpoint }
  });

  const activationPath = `/join/${token}`;
  if (["sms", "email"].includes(input.channel)) {
    const channel = input.channel;
    const destinationEmail = channel === "email" ? email : null;
    const notification = await supabase.from("notifications").insert({
      profile_id: visit.profile_id,
      channel,
      title: "Keep your Barber connected",
      body: `Activate BVRB3R to rebook faster, receive chair alerts, save your Barber, and manage future BVRB3R appointments. ${activationPath}`,
      status: "queued",
      audience_email: destinationEmail,
      client_email: destinationEmail,
      client_reference: visit.id,
      barber_reference: visit.barber_id,
      location_reference: visit.shop_id,
      notification_type: "client_bridge_invitation",
      dedupe_key: `client-bridge:${insert.data.id}:${channel}`,
      metadata: { activation_path: activationPath, invitation_id: insert.data.id, operational: false, consent_granted: input.consentGranted }
    });
    if (notification.error) {
      await supabase.from("client_bridge_invitations").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", insert.data.id);
      return { invitationId: insert.data.id, status: "failed", maskedDestination: maskedDestination({ channel: input.channel, phone, email }), activationPath, expiresAt };
    }
  }

  return {
    invitationId: insert.data.id,
    status: insert.data.status,
    maskedDestination: maskedDestination({ channel: input.channel, phone, email }),
    activationPath,
    expiresAt
  };
}

export async function readClientBridgeInvitation(token: string) {
  const supabase = admin();
  const tokenHash = hashToken(token);
  const response = await supabase
    .from("client_bridge_invitations")
    .select("id, status, barber_id, shop_id, original_appointment_source, conversion_touchpoint, expires_at, opened_at, guest_visit_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (response.error || !response.data) throw new PriorityOneKioskError("This activation link is invalid.", 404, "activation_link_invalid");
  const invitation = response.data;
  if (new Date(invitation.expires_at).getTime() <= Date.now() && !["activated", "converted", "retained"].includes(invitation.status)) {
    await supabase.from("client_bridge_invitations").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", invitation.id);
    return { status: "expired" as const, invitationId: invitation.id };
  }
  if (["activated", "first_native_booking", "converted", "retained"].includes(invitation.status)) {
    return { status: "already_used" as const, invitationId: invitation.id };
  }
  if (!invitation.opened_at) {
    await supabase.from("client_bridge_invitations").update({ status: "opened", opened_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", invitation.id);
  }
  const barbers = await barberProfiles(supabase, invitation.barber_id ? [invitation.barber_id] : []);
  const shop = invitation.shop_id
    ? await supabase.from("shops").select("id, name, public_username, profile_photo_url").eq("id", invitation.shop_id).maybeSingle()
    : { data: null };
  return {
    status: "verification_required" as const,
    invitationId: invitation.id,
    barber: invitation.barber_id ? barbers.get(invitation.barber_id) ?? null : null,
    shop: shop.data ?? null,
    originalAppointmentSource: invitation.original_appointment_source,
    conversionTouchpoint: invitation.conversion_touchpoint,
    expiresAt: invitation.expires_at
  };
}

export async function claimClientBridgeInvitation(token: string, profileId: string, input: ClientBridgeActivationInput): Promise<ClientBridgeActivationResult> {
  const supabase = admin();
  const invitation = await readClientBridgeInvitation(token);
  if (invitation.status === "expired" || invitation.status === "already_used") return invitation;
  if (!input.termsAccepted || !input.privacyAccepted) {
    throw new PriorityOneKioskError("Terms and Privacy acceptance are required.", 400, "legal_acceptance_required");
  }
  const verified = await verifiedClient(supabase, profileId);
  if (!verified) throw new PriorityOneKioskError("A verified Client account is required.", 403, "verified_client_required");

  const profileUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.username?.trim()) profileUpdate.public_username = input.username.trim().replace(/^@+/, "").toLowerCase();
  const update = await supabase.from("profiles").update(profileUpdate).eq("id", verified.profile.id);
  if (update.error) throw new PriorityOneKioskError("Unable to update the Client profile.", 409, "username_update_failed");

  const now = new Date().toISOString();
  await supabase.from("privacy_preferences").upsert({
    profile_id: verified.profile.id,
    role: "client_user",
    preferences: {
      transactional_sms: Boolean(input.transactionalSmsConsent),
      transactional_email: Boolean(input.transactionalEmailConsent)
    },
    marketing_consent: Boolean(input.marketingConsent),
    public_profile_visibility: "private",
    follow_visibility: "private",
    saved_items_visibility: "private",
    activity_visibility: "private",
    updated_at: now
  }, { onConflict: "profile_id" });

  const legal = currentLegalVersions();
  await supabase.from("compliance_acceptances").upsert([
    { user_id: verified.profile.id, role: "client_user", document_key: "terms", document_version: legal.terms, accepted_at: now },
    { user_id: verified.profile.id, role: "client_user", document_key: "privacy", document_version: legal.privacy, accepted_at: now }
  ], { onConflict: "user_id,document_key,document_version", ignoreDuplicates: true });

  await supabase.from("client_bridge_invitations").update({
    profile_id: verified.profile.id,
    client_id: verified.client.id,
    status: "activated",
    identity_verified_at: now,
    activated_at: now,
    updated_at: now
  }).eq("id", invitation.invitationId);

  await supabase.from("kiosk_guest_visits").update({
    profile_id: verified.profile.id,
    client_id: verified.client.id,
    identity_state: "verified_bvrb3r_client",
    marketing_consent: Boolean(input.marketingConsent),
    updated_at: now
  }).eq("id", (invitation as { guestVisitId?: string }).guestVisitId ?? "00000000-0000-0000-0000-000000000000");

  await supabase.from("client_bridge_consent_events").insert([
    { invitation_id: invitation.invitationId, profile_id: verified.profile.id, event_type: "identity_verified", evidence: { method: input.verificationMethod } },
    { invitation_id: invitation.invitationId, profile_id: verified.profile.id, event_type: "terms_accepted", consent_version: legal.terms, evidence: {} },
    { invitation_id: invitation.invitationId, profile_id: verified.profile.id, event_type: "privacy_accepted", consent_version: legal.privacy, evidence: {} },
    { invitation_id: invitation.invitationId, profile_id: verified.profile.id, event_type: input.marketingConsent ? "marketing_granted" : "marketing_denied", evidence: {} }
  ]);

  return {
    status: "activated",
    invitationId: invitation.invitationId,
    profileId: verified.profile.id,
    clientId: verified.client.id,
    publicUsername: input.username?.trim().replace(/^@+/, "").toLowerCase() ?? verified.profile.public_username ?? undefined,
    nextPath: "/client"
  };
}

export async function getKioskQueueStatus(reference: string): Promise<KioskQueueStatusResult> {
  const supabase = admin();
  const queue = await supabase
    .from("walk_in_queue")
    .select("id, reference_code, status, position, wait_minutes, assigned_barber_id, requested_service, booking_source, payment_owner, updated_at, guest_visit_id")
    .eq("reference_code", reference)
    .maybeSingle();
  if (queue.error || !queue.data) throw new PriorityOneKioskError("The queue reference could not be found.", 404, "queue_reference_not_found");
  const barbers = await barberProfiles(supabase, queue.data.assigned_barber_id ? [queue.data.assigned_barber_id] : []);
  const barber = queue.data.assigned_barber_id ? barbers.get(queue.data.assigned_barber_id) : undefined;
  const source = normalizeAppointmentSource(queue.data.booking_source);
  const paymentOwner = normalizePaymentOwner(queue.data.payment_owner, source);
  const identity = queue.data.guest_visit_id
    ? await supabase.from("kiosk_guest_visits").select("identity_state").eq("id", queue.data.guest_visit_id).maybeSingle()
    : { data: null };
  return {
    queueReference: queue.data.reference_code ?? queue.data.id,
    status: queueStateFromStatus(queue.data.status),
    position: queue.data.position,
    estimatedWaitMinutes: queue.data.wait_minutes,
    waitDisplayLabel: queue.data.wait_minutes <= 10 ? "About 5–10 minutes" : `About ${Math.max(10, queue.data.wait_minutes - 5)}–${queue.data.wait_minutes + 5} minutes`,
    barber: {
      id: queue.data.assigned_barber_id,
      name: barber?.full_name ?? "Your Barber",
      profilePhotoUrl: barber?.profile_photo_url ?? null
    },
    service: { name: queue.data.requested_service },
    source,
    sourceLabel: appointmentSourceLabel(source),
    paymentOwner,
    paymentOwnerLabel: paymentOwnerLabel(paymentOwner),
    updatedAt: queue.data.updated_at,
    readyGraceEndsAt: null,
    activationReminderAvailable: identity.data?.identity_state !== "verified_bvrb3r_client"
  };
}
