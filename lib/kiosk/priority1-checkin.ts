import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  deliverAndRecordNotification,
  markBothChannelsFailed,
} from "@/lib/notifications/delivery";
import { createPriorityOneProvisionalClient } from "@/lib/kiosk/priority1-provisional";
import { resolveVerifiedPriorityOneIdentity } from "@/lib/kiosk/priority1-identity";
import {
  appointmentSourceLabel,
  normalizeAppointmentSource,
  normalizePaymentOwner,
  paymentOwnerLabel,
} from "@/lib/kiosk/priority1";
import type {
  AppointmentSource,
  KioskAppointmentSearchResult,
  KioskCheckInResult,
  NotificationDeliveryState,
  PaymentOwner,
} from "@/types/kiosk";

export interface SecureKioskCheckInInput {
  appointmentId: string;
  appointmentKind: "native" | "external";
  continueAs: "guest" | "verified_client" | "join_bvrb3r";
  verificationToken?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  preferredChannel?: "sms" | "email";
  transactionalSmsConsent?: boolean;
  transactionalEmailConsent?: boolean;
  marketingConsent?: boolean;
  termsAccepted?: boolean;
  privacyAccepted?: boolean;
  bookingPolicyAccepted?: boolean;
  termsVersion?: string;
  privacyVersion?: string;
  shopPolicyVersion?: string;
  idempotencyKey: string;
}

export class PriorityOneCheckInError extends Error {
  constructor(
    public message: string,
    public status = 400,
    public code = "priority1_check_in_error",
  ) {
    super(message);
    this.name = "PriorityOneCheckInError";
  }
}

type Admin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

function admin() {
  const client = createSupabaseAdminClient();
  if (!client)
    throw new PriorityOneCheckInError(
      "Supabase is unavailable.",
      503,
      "supabase_unavailable",
    );
  return client;
}

async function resolveShop(supabase: Admin, target: string) {
  const normalized = target.trim().replace(/^@+/, "").toLowerCase();
  let shop = await supabase
    .from("shops")
    .select("id, name, public_username, phone")
    .or(`id.eq.${target},public_username.ilike.${normalized}`)
    .maybeSingle();
  if (shop.error)
    throw new PriorityOneCheckInError(
      "Unable to load this shop.",
      500,
      "shop_lookup_failed",
    );

  let location = shop.data
    ? await supabase
        .from("locations")
        .select("id, reference_code, name, phone")
        .or(
          `reference_code.eq.${shop.data.id},reference_code.eq.${shop.data.public_username ?? shop.data.id}`,
        )
        .maybeSingle()
    : await supabase
        .from("locations")
        .select("id, reference_code, name, phone")
        .or(
          `reference_code.eq.${target},reference_code.ilike.${normalized}${/^[0-9a-f-]{36}$/i.test(target) ? `,id.eq.${target}` : ""}`,
        )
        .maybeSingle();
  if (location.error)
    throw new PriorityOneCheckInError(
      "Unable to load the shop queue.",
      500,
      "location_lookup_failed",
    );
  if (!shop.data && !location.data)
    throw new PriorityOneCheckInError(
      "This kiosk could not be found.",
      404,
      "shop_not_found",
    );
  if (!shop.data && location.data?.reference_code) {
    shop = await supabase
      .from("shops")
      .select("id, name, public_username, phone")
      .or(
        `id.eq.${location.data.reference_code},public_username.eq.${location.data.reference_code}`,
      )
      .maybeSingle();
  }
  return {
    shop: shop.data ?? {
      id: location.data?.reference_code ?? target,
      name: location.data?.name ?? "BVRB3R Shop",
      public_username: null,
      phone: location.data?.phone ?? null,
    },
    location: location.data,
  };
}

async function barberMap(supabase: Admin, barberId: string) {
  const barber = await supabase
    .from("barbers")
    .select("id, profile_id")
    .eq("id", barberId)
    .maybeSingle();
  if (barber.error || !barber.data)
    return { name: "Your Barber", profilePhotoUrl: null };
  const profile = await supabase
    .from("profiles")
    .select("full_name, profile_photo_url")
    .eq("id", barber.data.profile_id)
    .maybeSingle();
  return {
    name: profile.data?.full_name ?? "Your Barber",
    profilePhotoUrl: profile.data?.profile_photo_url ?? null,
  };
}

async function serviceName(
  supabase: Admin,
  serviceId?: string | null,
  fallback = "Service",
) {
  if (!serviceId) return fallback;
  const service = await supabase
    .from("services")
    .select("name")
    .eq("id", serviceId)
    .maybeSingle();
  return service.data?.name ?? fallback;
}

async function appointment(
  supabase: Admin,
  kind: "native" | "external",
  id: string,
): Promise<{
  result: KioskAppointmentSearchResult;
  locationId: string | null;
  shopId: string | null;
  clientId: string | null;
  phone: string | null;
  email: string | null;
}> {
  if (kind === "external") {
    const row = await supabase
      .from("chair_sync_external_appointments")
      .select(
        "id, provider, shop_id, location_id, barber_id, service_id, service_name, guest_display_name, guest_phone, guest_email, status, starts_at, ends_at, payment_owner, provider_open_url",
      )
      .eq("id", id)
      .maybeSingle();
    if (row.error || !row.data)
      throw new PriorityOneCheckInError(
        "The connected appointment could not be found.",
        404,
        "external_appointment_not_found",
      );
    const barber = await barberMap(supabase, row.data.barber_id);
    const source = normalizeAppointmentSource(
      row.data.provider,
    ) as AppointmentSource;
    const paymentOwner = normalizePaymentOwner(
      row.data.payment_owner,
      source,
    ) as PaymentOwner;
    return {
      result: {
        appointmentId: row.data.id,
        appointmentKind: "external",
        source,
        sourceLabel: appointmentSourceLabel(source),
        paymentOwner,
        paymentOwnerLabel: paymentOwnerLabel(paymentOwner),
        clientDisplayName: row.data.guest_display_name,
        barberId: row.data.barber_id,
        barberName: barber.name,
        serviceId: row.data.service_id,
        serviceName: row.data.service_name,
        startsAt: row.data.starts_at,
        endsAt: row.data.ends_at,
        status: row.data.status,
        maskedPhone: null,
        maskedEmail: null,
        providerOpenUrl: row.data.provider_open_url,
        alreadyCheckedIn: [
          "checked_in",
          "waiting",
          "almost_ready",
          "ready",
          "in_chair",
        ].includes(row.data.status),
        canContinueAsGuest: true,
      },
      locationId: row.data.location_id,
      shopId: row.data.shop_id,
      clientId: null,
      phone: row.data.guest_phone,
      email: row.data.guest_email,
    };
  }

  const row = await supabase
    .from("appointments")
    .select(
      "id, location_id, shop_id, barber_id, client_id, service_id, status, source, booking_source, payment_owner, starts_at, ends_at, checked_in_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (row.error || !row.data)
    throw new PriorityOneCheckInError(
      "The BVRB3R appointment could not be found.",
      404,
      "native_appointment_not_found",
    );
  const [barber, service, client] = await Promise.all([
    barberMap(supabase, row.data.barber_id),
    serviceName(supabase, row.data.service_id),
    supabase
      .from("clients")
      .select("profile_id")
      .eq("id", row.data.client_id)
      .maybeSingle(),
  ]);
  const profile = client.data?.profile_id
    ? await supabase
        .from("profiles")
        .select("full_name, phone, email")
        .eq("id", client.data.profile_id)
        .maybeSingle()
    : { data: null };
  const source = normalizeAppointmentSource(
    row.data.booking_source ?? row.data.source,
  ) as AppointmentSource;
  const paymentOwner = normalizePaymentOwner(
    row.data.payment_owner,
    source,
  ) as PaymentOwner;
  return {
    result: {
      appointmentId: row.data.id,
      appointmentKind: "native",
      source,
      sourceLabel: appointmentSourceLabel(source),
      paymentOwner,
      paymentOwnerLabel: paymentOwnerLabel(paymentOwner),
      clientDisplayName: profile.data?.full_name ?? "BVRB3R Client",
      barberId: row.data.barber_id,
      barberName: barber.name,
      serviceId: row.data.service_id,
      serviceName: service,
      startsAt: row.data.starts_at,
      endsAt: row.data.ends_at,
      status: row.data.status,
      providerOpenUrl: null,
      alreadyCheckedIn:
        Boolean(row.data.checked_in_at) ||
        ["checked_in", "in_service", "completed"].includes(row.data.status),
      canContinueAsGuest: false,
    },
    locationId: row.data.location_id,
    shopId: row.data.shop_id,
    clientId: row.data.client_id,
    phone: profile.data?.phone ?? null,
    email: profile.data?.email ?? null,
  };
}

async function queuePosition(supabase: Admin, locationId: string) {
  const result = await supabase
    .from("walk_in_queue")
    .select("position, wait_minutes")
    .eq("location_id", locationId)
    .in("status", ["waiting", "assigned", "in_service"])
    .order("position", { ascending: false });
  if (result.error)
    throw new PriorityOneCheckInError(
      "Unable to calculate the live queue.",
      500,
      "queue_read_failed",
    );
  const rows = result.data ?? [];
  const position = Number(rows[0]?.position ?? 0) + 1;
  const average = rows.length
    ? Math.max(
        5,
        Math.round(
          rows.reduce(
            (sum, row) => sum + Number(row.wait_minutes ?? 10),
            0,
          ) / rows.length,
        ),
      )
    : 10;
  const wait = Math.max(5, position * average);
  return {
    position,
    wait,
    label:
      wait <= 10
        ? "About 5–10 minutes"
        : `About ${Math.max(10, wait - 5)}–${wait + 5} minutes`,
  };
}

function notificationState(status: string): NotificationDeliveryState {
  if (
    status === "sent" ||
    status === "delivered" ||
    status === "failed" ||
    status === "opted_out"
  )
    return status;
  return "queued";
}

export async function secureCheckInKioskAppointment(
  shopTarget: string,
  input: SecureKioskCheckInInput,
): Promise<KioskCheckInResult> {
  const supabase = admin();
  const [resolved, appt] = await Promise.all([
    resolveShop(supabase, shopTarget),
    appointment(supabase, input.appointmentKind, input.appointmentId),
  ]);
  const locationId = appt.locationId ?? resolved.location?.id ?? null;
  if (!locationId)
    throw new PriorityOneCheckInError(
      "The shop queue location is unavailable.",
      409,
      "queue_location_missing",
    );
  if (appt.shopId && appt.shopId !== resolved.shop.id)
    throw new PriorityOneCheckInError(
      "This appointment belongs to another shop.",
      403,
      "appointment_shop_mismatch",
    );
  if (appt.result.alreadyCheckedIn)
    throw new PriorityOneCheckInError(
      "This appointment is already checked in.",
      409,
      "appointment_already_checked_in",
    );
  if (
    ["canceled", "cancelled", "no_show", "completed"].includes(
      appt.result.status,
    )
  )
    throw new PriorityOneCheckInError(
      "This appointment can no longer be checked in.",
      409,
      "appointment_not_checkin_eligible",
    );
  if (input.continueAs === "guest" && input.appointmentKind !== "external")
    throw new PriorityOneCheckInError(
      "A native BVRB3R appointment requires account verification.",
      403,
      "verified_client_required",
    );

  const verified =
    input.continueAs === "verified_client"
      ? await resolveVerifiedPriorityOneIdentity(input.verificationToken ?? "")
      : null;
  if (verified && appt.clientId && verified.clientId !== appt.clientId)
    throw new PriorityOneCheckInError(
      "That verified account does not own this appointment.",
      403,
      "appointment_identity_mismatch",
    );

  const fullName =
    verified?.profile.full_name ??
    input.fullName?.trim() ??
    appt.result.clientDisplayName;
  const phone = verified?.profile.phone ?? input.phone?.trim() ?? appt.phone;
  const email =
    verified?.profile.email ??
    input.email?.trim().toLowerCase() ??
    appt.email;
  const identityState = verified
    ? "verified_bvrb3r_client"
    : input.continueAs === "join_bvrb3r"
      ? "bvrb3r_guest"
      : "external_guest";
  const q = await queuePosition(supabase, locationId);
  const queueReference = `BVR-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const sourceAttribution = {
    appointment_kind: input.appointmentKind,
    appointment_id: input.appointmentId,
    original_source: appt.result.source,
    payment_owner: appt.result.paymentOwner,
    kiosk_touchpoint: input.continueAs,
  };

  const rpc = await supabase.rpc("priority1_create_check_in_queue", {
    p_shop_id: resolved.shop.id,
    p_location_id: locationId,
    p_barber_id: appt.result.barberId,
    p_appointment_id:
      input.appointmentKind === "native" ? input.appointmentId : null,
    p_external_appointment_id:
      input.appointmentKind === "external" ? input.appointmentId : null,
    p_client_id: verified?.clientId ?? appt.clientId,
    p_profile_id: verified?.profile.id ?? null,
    p_identity_state: identityState,
    p_booking_source: appt.result.source,
    p_payment_owner: appt.result.paymentOwner,
    p_guest_display_name: fullName,
    p_guest_phone: phone,
    p_guest_email: email,
    p_transactional_sms_consent: Boolean(input.transactionalSmsConsent),
    p_transactional_email_consent: Boolean(input.transactionalEmailConsent),
    p_marketing_consent: Boolean(input.marketingConsent),
    p_terms_version: input.termsVersion ?? null,
    p_privacy_version: input.privacyVersion ?? null,
    p_shop_policy_version: input.shopPolicyVersion ?? null,
    p_source_attribution: sourceAttribution,
    p_idempotency_key: input.idempotencyKey,
    p_queue_reference: queueReference,
    p_requested_service: appt.result.serviceName,
    p_position: q.position,
    p_wait_minutes: q.wait,
  });
  if (rpc.error || !rpc.data)
    throw new PriorityOneCheckInError(
      "Unable to add this visit to the live queue.",
      500,
      "queue_entry_create_failed",
    );
  const created = rpc.data as {
    guest_visit_id: string;
    queue_entry_id: string;
    queue_reference: string;
    duplicate: boolean;
  };

  const deliveries = [];
  if (input.transactionalSmsConsent && phone) {
    deliveries.push(
      await deliverAndRecordNotification({
        channel: "sms",
        to: phone,
        title: "You are checked in",
        body: `You are checked in with ${appt.result.barberName}. Queue reference ${created.queue_reference}. ${q.label}. We will text when your chair is close.`,
        notificationType: "kiosk_queue_confirmation",
        profileId: verified?.profile.id,
        clientReference: created.queue_reference,
        barberReference: appt.result.barberId,
        locationReference: locationId,
        appointmentReference: input.appointmentId,
        dedupeKey: `kiosk:${created.queue_reference}:confirmation:sms`,
        metadata: {
          queue_reference: created.queue_reference,
          operational: true,
          source: appt.result.source,
        },
        consentGranted: true,
        operational: true,
      }),
    );
  }
  if (input.transactionalEmailConsent && email) {
    deliveries.push(
      await deliverAndRecordNotification({
        channel: "email",
        to: email,
        title: "You are checked in",
        body: `You are checked in with ${appt.result.barberName}. Queue reference ${created.queue_reference}. ${q.label}.`,
        notificationType: "kiosk_queue_confirmation",
        profileId: verified?.profile.id,
        clientReference: created.queue_reference,
        barberReference: appt.result.barberId,
        locationReference: locationId,
        appointmentReference: input.appointmentId,
        dedupeKey: `kiosk:${created.queue_reference}:confirmation:email`,
        metadata: {
          queue_reference: created.queue_reference,
          operational: true,
          source: appt.result.source,
        },
        consentGranted: true,
        operational: true,
      }),
    );
  }
  await markBothChannelsFailed({
    guestVisitId: created.guest_visit_id,
    queueReference: created.queue_reference,
    shopId: resolved.shop.id,
    appointmentReference: input.appointmentId,
    results: deliveries,
  });

  let activation: KioskCheckInResult["clientBridgeInvitation"] = null;
  if (input.continueAs === "join_bvrb3r") {
    if (!phone || !email)
      throw new PriorityOneCheckInError(
        "Phone and email are required to start a BVRB3R account.",
        400,
        "client_bridge_contact_required",
      );
    const provisional = await createPriorityOneProvisionalClient({
      shopId: resolved.shop.id,
      fullName,
      phone,
      email,
      preferredChannel:
        input.preferredChannel ??
        (input.transactionalSmsConsent ? "sms" : "email"),
      transactionalSmsConsent: Boolean(input.transactionalSmsConsent),
      transactionalEmailConsent: Boolean(input.transactionalEmailConsent),
      marketingConsent: Boolean(input.marketingConsent),
      termsAccepted: Boolean(input.termsAccepted),
      privacyAccepted: Boolean(input.privacyAccepted),
      bookingPolicyAccepted: Boolean(input.bookingPolicyAccepted),
      termsVersion: input.termsVersion,
      privacyVersion: input.privacyVersion,
      shopPolicyVersion: input.shopPolicyVersion,
      sourceAttribution,
      idempotencyKey: `${input.idempotencyKey}:activation`,
      guestVisitId: created.guest_visit_id,
    });
    if (provisional.status === "possible_duplicate")
      throw new PriorityOneCheckInError(
        "A BVRB3R account already matches this contact. Recover it instead of creating a duplicate.",
        409,
        "possible_duplicate_account",
      );
    await supabase
      .from("kiosk_guest_visits")
      .update({
        account_activation_id: provisional.activationId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", created.guest_visit_id);
    activation = {
      invitationId: provisional.activationId,
      stage: "invitation_offered",
      expiresAt: provisional.expiresAt,
    };
  }

  await supabase.from("platform_events").upsert(
    {
      event_type: "kiosk_client_checked_in",
      entity_type: "kiosk_guest_visit",
      entity_id: created.guest_visit_id,
      actor_role: "public_kiosk",
      source: "kiosk",
      related_ids: {
        appointment_id: input.appointmentId,
        queue_entry_id: created.queue_entry_id,
        shop_id: resolved.shop.id,
      },
      payload: {
        identity_state: identityState,
        booking_source: appt.result.source,
        payment_owner: appt.result.paymentOwner,
        duplicate_blocked: created.duplicate,
      },
      idempotency_key: `kiosk-checkin:${input.idempotencyKey}`,
      occurred_at: new Date().toISOString(),
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );

  return {
    guestVisitId: created.guest_visit_id,
    queueEntryId: created.queue_entry_id,
    queueReference: created.queue_reference,
    queueStatus: "waiting",
    identityState,
    appointment: appt.result,
    estimatedWaitMinutes: q.wait,
    waitDisplayLabel: q.label,
    notificationStates: deliveries.map((delivery) => ({
      channel: delivery.channel,
      state: notificationState(delivery.status),
    })),
    clientBridgeInvitation: activation,
  };
}
