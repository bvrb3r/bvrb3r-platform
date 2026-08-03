import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  createBookingHold,
  releaseBookingHold,
  type BookingEngineActor
} from "@/lib/booking/engine";
import { resolveConfirmingClientId } from "@/lib/booking/engine/client-resolution";
import {
  buildGroupPaymentResponsibilities,
  createGroupBookingSchema,
  groupBookingWindow,
  kioskGroupHonesty,
  kioskGroupRequestSchema,
  type CreateGroupBookingInput,
  type KioskGroupRequestInput,
  type TrustedGroupHold
} from "@/lib/group-booking/domain";
import {
  provisionGroupSplitPaymentLinks,
  readGroupSplitPaymentProviderReadiness,
  type GroupSplitPaymentDelivery
} from "@/lib/group-booking/payment-links";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export class GroupBookingServiceError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "group_booking_failed"
  ) {
    super(message);
    this.name = "GroupBookingServiceError";
  }
}

function requireSupabase(): SupabaseAdmin {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new GroupBookingServiceError(
      "Group booking is temporarily unavailable because live booking truth cannot be reached.",
      503,
      "group_booking_unavailable"
    );
  }
  return supabase;
}

function opaqueToken() {
  return randomBytes(32).toString("base64url");
}

function hashToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function actorBinding(actor: BookingEngineActor) {
  const value = actor.profileId ?? actor.sessionKey;
  if (!value) {
    throw new GroupBookingServiceError("A protected booking session is required.", 401, "group_owner_required");
  }
  return value;
}

async function releaseCreatedHolds(
  actor: BookingEngineActor,
  holds: Array<{ holdToken: string }>
) {
  await Promise.allSettled(holds.map((hold) => releaseBookingHold({ actor, holdToken: hold.holdToken })));
}

async function assertGroupMemberCatalogBinding(
  supabase: SupabaseAdmin,
  member: CreateGroupBookingInput["members"][number]
) {
  const [serviceResult, barberResult, locationResult] = await Promise.all([
    supabase.from("services")
      .select("id, location_id, barber_reference, shop_reference, active, is_bookable")
      .eq("id", member.serviceId)
      .maybeSingle(),
    supabase.from("barbers")
      .select("id, reference_code, profile_id")
      .eq("id", member.barberId)
      .eq("app_approval_status", "approved")
      .maybeSingle(),
    supabase.from("locations")
      .select("id, reference_code")
      .eq("id", member.locationId)
      .maybeSingle()
  ]);
  if (serviceResult.error || barberResult.error || locationResult.error
    || !serviceResult.data || !barberResult.data || !locationResult.data) {
    throw new GroupBookingServiceError("A selected barber, service, or shop is not bookable.", 404, "catalog_binding_not_found");
  }
  const service = serviceResult.data;
  const barberReference = (barberResult.data.reference_code as string | null) ?? member.barberId;
  const shopReference = locationResult.data.reference_code as string | null;
  if (!service.active || !service.is_bookable
    || (service.location_id && service.location_id !== member.locationId)
    || (service.barber_reference && service.barber_reference !== barberReference)
    || (service.shop_reference && service.shop_reference !== shopReference)) {
    throw new GroupBookingServiceError(
      "That service does not belong to the selected barber and shop.",
      409,
      "catalog_binding_mismatch"
    );
  }

  if (shopReference) {
    const [membership, staffLocation] = await Promise.all([
      supabase.from("barber_shop_memberships")
        .select("id")
        .eq("barber_reference", barberReference)
        .eq("shop_reference", shopReference)
        .eq("active", true)
        .maybeSingle(),
      supabase.from("staff_locations")
        .select("id")
        .eq("profile_id", barberResult.data.profile_id)
        .eq("location_id", member.locationId)
        .maybeSingle()
    ]);
    if ((membership.error && membership.error.code !== "PGRST116")
      || (staffLocation.error && staffLocation.error.code !== "PGRST116")
      || (!membership.data && !staffLocation.data)) {
      throw new GroupBookingServiceError(
        "That barber is not active at the selected shop.",
        409,
        "barber_shop_relationship_missing"
      );
    }
  }
}

type PersistedMember = {
  id: string;
  member_key: string;
  full_name: string;
  email: string;
  phone: string;
  is_minor: boolean;
  is_organizer: boolean;
  hold_id: string;
  price_cents: number;
  currency: string;
};

export type ConfirmedGroupBooking = {
  groupId: string;
  status: "confirmed";
  memberCount: number;
  totalServiceCents: number;
  currency: string;
  startsAt: string;
  endsAt: string;
  paymentMode: CreateGroupBookingInput["paymentMode"];
  paymentResponsibilities: Array<{
    memberId: string;
    payerKind: "organizer" | "member";
    amountCents: number;
    currency: string;
    status: "planned";
  }>;
  appointments: Array<{
    memberId: string;
    appointmentId: string;
    startsAt: string;
    status: string;
  }>;
  paymentDelivery: GroupSplitPaymentDelivery;
  doctrine: {
    oneCancellationCancelsGroup: false;
    pricesComeFromServiceCatalog: true;
    chargedAtBooking: false;
    minorPayer: "organizer";
  };
};

export async function readGroupBookingCatalog() {
  const supabase = requireSupabase();
  const [barbersResult, servicesResult, shopsResult] = await Promise.all([
    supabase.from("barbers").select("id, reference_code, profile_id").eq("app_approval_status", "approved").limit(300),
    supabase.from("services")
      .select("id, name, duration_min, price_cents, currency, location_id, barber_reference, shop_reference")
      .eq("active", true)
      .eq("is_bookable", true)
      .limit(500),
    supabase.from("shops").select("id").eq("app_approval_status", "approved").limit(300)
  ]);
  if (barbersResult.error || servicesResult.error || shopsResult.error) {
    throw new GroupBookingServiceError("The live barber and service catalog could not be loaded.", 503);
  }
  const approvedShopReferences = (shopsResult.data ?? []).map((shop) => shop.id as string);
  const locationsResult = approvedShopReferences.length
    ? await supabase.from("locations").select("id, reference_code, name, city, state").in("reference_code", approvedShopReferences).limit(300)
    : { data: [], error: null };
  if (locationsResult.error) {
    throw new GroupBookingServiceError("The live shop catalog could not be verified.", 503);
  }
  const barbers = (barbersResult.data ?? []) as Array<{ id: string; reference_code: string | null; profile_id: string }>;
  const profileIds = barbers.map((barber) => barber.profile_id);
  const profilesResult = profileIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", profileIds)
    : { data: [], error: null };
  if (profilesResult.error) {
    throw new GroupBookingServiceError("The live barber catalog could not be verified.", 503);
  }
  const names = new Map((profilesResult.data ?? []).map((profile) => [profile.id as string, profile.full_name as string]));
  const approvedBarberReferences = new Set(barbers.map((barber) => barber.reference_code ?? barber.id));
  const approvedLocationIds = new Set((locationsResult.data ?? []).map((location) => location.id as string));
  const approvedShops = new Set(approvedShopReferences);
  return {
    splitPaymentDelivery: readGroupSplitPaymentProviderReadiness(),
    barbers: barbers.map((barber) => ({
      id: barber.id,
      reference: barber.reference_code ?? barber.id,
      label: names.get(barber.profile_id) ?? "Verified barber"
    })),
    services: (servicesResult.data ?? []).filter((service) => {
      const barberReference = service.barber_reference as string | null;
      const shopReference = service.shop_reference as string | null;
      const locationId = service.location_id as string | null;
      return (!barberReference || approvedBarberReferences.has(barberReference))
        && (!shopReference || approvedShops.has(shopReference))
        && (!locationId || approvedLocationIds.has(locationId));
    }).map((service) => ({
      id: service.id as string,
      name: service.name as string,
      durationMin: Number(service.duration_min ?? 0),
      priceCents: Number(service.price_cents ?? 0),
      currency: (service.currency as string | null) ?? "usd",
      locationId: service.location_id as string | null,
      barberReference: service.barber_reference as string | null,
      shopReference: service.shop_reference as string | null
    })),
    locations: (locationsResult.data ?? []).map((location) => ({
      id: location.id as string,
      label: `${location.name as string}${location.city ? ` · ${location.city as string}, ${location.state as string}` : ""}`
    }))
  };
}

/**
 * Holds and confirms every member against the canonical PR20 engine. If hold N
 * fails, holds 1..N-1 are released. The database confirmation RPC uses a
 * subtransaction so appointment creation is all-or-nothing.
 */
export async function createAndConfirmGroupBooking(input: {
  actor: BookingEngineActor;
  payload: CreateGroupBookingInput;
}): Promise<ConfirmedGroupBooking> {
  const payload = createGroupBookingSchema.parse(input.payload);
  const supabase = requireSupabase();
  actorBinding(input.actor);
  const created: Array<{
    holdToken: string;
    member: CreateGroupBookingInput["members"][number];
    hold: Awaited<ReturnType<typeof createBookingHold>>["hold"];
  }> = [];

  try {
    for (const member of payload.members) {
      await assertGroupMemberCatalogBinding(supabase, member);
      const held = await createBookingHold({
        actor: input.actor,
        barberId: member.barberId,
        serviceId: member.serviceId,
        locationId: member.locationId,
        startsAt: member.startsAt,
        attribution: {
          sourceDoor: "bvrb3r_web",
          sourceSurface: "group_booking",
          correlationId: payload.idempotencyKey
        },
        allowedDoors: ["bvrb3r_web"],
        fallbackDoor: "bvrb3r_web",
        idempotencyKey: `${payload.idempotencyKey}:${member.memberKey}`.slice(0, 200)
      });
      created.push({ holdToken: held.holdToken, member, hold: held.hold });
    }
  } catch (error) {
    await releaseCreatedHolds(input.actor, created);
    throw error;
  }

  const currencies = new Set(created.map((entry) => entry.hold.serviceCurrency.toLowerCase()));
  if (currencies.size !== 1) {
    await releaseCreatedHolds(input.actor, created);
    throw new GroupBookingServiceError(
      "Every member in one group must use the same booking currency.",
      409,
      "group_currency_mismatch"
    );
  }

  const window = groupBookingWindow(created.map((entry) => entry.hold));
  if (!window) {
    await releaseCreatedHolds(input.actor, created);
    throw new GroupBookingServiceError("No group chairs were held.", 409, "group_holds_missing");
  }

  const controlToken = opaqueToken();
  const totalServiceCents = created.reduce((sum, entry) => sum + entry.hold.servicePriceCents, 0);
  const holdsExpireAt = [...created]
    .sort((left, right) => left.hold.expiresAt.localeCompare(right.hold.expiresAt))[0].hold.expiresAt;
  const currency = [...currencies][0];

  const groupInsert = await supabase.from("group_bookings").insert({
    control_token_hash: hashToken(controlToken),
    organizer_profile_id: input.actor.profileId,
    organizer_session_key: input.actor.sessionKey,
    organizer_name: payload.organizer.fullName,
    organizer_email: payload.organizer.email.toLowerCase(),
    organizer_phone: payload.organizer.phone,
    location_id: created[0].hold.locationId ?? payload.members[0].locationId,
    payment_mode: payload.paymentMode,
    member_count: created.length,
    total_service_cents: totalServiceCents,
    currency,
    status: "holding",
    starts_at: window.startsAt,
    ends_at: window.endsAt,
    holds_expire_at: holdsExpireAt
  }).select("id").single();

  if (groupInsert.error || !groupInsert.data?.id) {
    await releaseCreatedHolds(input.actor, created);
    throw new GroupBookingServiceError("The chairs were released because the group could not be recorded.", 503);
  }

  const groupId = groupInsert.data.id as string;
  const memberInsert = await supabase.from("group_booking_members").insert(created.map((entry, index) => ({
    group_id: groupId,
    member_key: entry.member.memberKey,
    full_name: index === 0 ? payload.organizer.fullName : entry.member.fullName,
    email: index === 0 || entry.member.isMinor ? payload.organizer.email.toLowerCase() : entry.member.email.toLowerCase(),
    phone: index === 0 || entry.member.isMinor ? payload.organizer.phone : entry.member.phone,
    is_minor: entry.member.isMinor,
    is_organizer: index === 0,
    hold_id: entry.hold.holdId,
    price_cents: entry.hold.servicePriceCents,
    currency: entry.hold.serviceCurrency.toLowerCase(),
    status: "held"
  }))).select("id, member_key, full_name, email, phone, is_minor, is_organizer, hold_id, price_cents, currency");

  if (memberInsert.error || memberInsert.data?.length !== created.length) {
    await releaseCreatedHolds(input.actor, created);
    await supabase.from("group_bookings").delete().eq("id", groupId);
    throw new GroupBookingServiceError("The chairs were released because every group member could not be recorded.", 503);
  }

  const members = memberInsert.data as PersistedMember[];
  const trustedHolds: TrustedGroupHold[] = members.map((member) => {
    const createdEntry = created.find((entry) => entry.hold.holdId === member.hold_id)!;
    return {
      memberId: member.id,
      memberKey: member.member_key,
      holdId: member.hold_id,
      fullName: member.full_name,
      email: member.email,
      isMinor: member.is_minor,
      barberId: createdEntry.hold.barberId,
      serviceId: createdEntry.hold.serviceId,
      locationId: createdEntry.hold.locationId ?? createdEntry.member.locationId,
      startsAt: createdEntry.hold.startsAt,
      endsAt: createdEntry.hold.endsAt,
      priceCents: member.price_cents,
      currency: member.currency
    };
  });
  const responsibilities = buildGroupPaymentResponsibilities(
    trustedHolds,
    payload.paymentMode,
    payload.organizer.email
  );
  const paymentInsert = await supabase.from("group_booking_payment_intents").insert(responsibilities.map((item) => ({
    group_id: groupId,
    member_id: item.memberId,
    payer_kind: item.payerKind,
    payer_email: item.payerEmail,
    amount_cents: item.amountCents,
    currency: item.currency,
    status: "planned"
  })));

  if (paymentInsert.error) {
    await releaseCreatedHolds(input.actor, created);
    await supabase.from("group_bookings").delete().eq("id", groupId);
    throw new GroupBookingServiceError("The chairs were released because payment responsibility could not be recorded.", 503);
  }

  const clientBindings: Array<{ memberId: string; clientId: string }> = [];
  for (const member of members) {
    const useOrganizerAccount = member.is_organizer && Boolean(input.actor.profileId);
    const memberActor: BookingEngineActor = useOrganizerAccount
      ? input.actor
      : {
          profileId: null,
          sessionKey: input.actor.sessionKey ?? `group:${groupId}`,
          role: null,
          email: member.email,
          permissionActor: null
        };
    const clientId = await resolveConfirmingClientId(memberActor, {
      fullName: member.full_name,
      email: member.email,
      phone: member.phone
    });
    clientBindings.push({ memberId: member.id, clientId });
  }

  const confirmation = await supabase.rpc("pr36_confirm_group_booking", {
    p_group_id: groupId,
    p_control_token_hash: hashToken(controlToken),
    p_members: clientBindings
  });
  const result = confirmation.data as {
    outcome?: string;
    reason?: string;
    appointments?: ConfirmedGroupBooking["appointments"];
  } | null;
  if (confirmation.error || result?.outcome !== "confirmed") {
    throw new GroupBookingServiceError(
      result?.reason === "group_holds_expired"
        ? "The group hold expired before every chair could be confirmed. No partial group was booked."
        : "The group could not be confirmed. No partial group was booked.",
      409,
      result?.reason ?? "group_confirmation_failed"
    );
  }

  let paymentDelivery: GroupSplitPaymentDelivery;
  try {
    paymentDelivery = await provisionGroupSplitPaymentLinks({
      groupId,
      smsConsent: payload.splitPaymentSmsConsent
    });
  } catch (error) {
    paymentDelivery = {
      state: "gated",
      requiredCount: responsibilities.length,
      deliveredCount: 0,
      provider: "unavailable",
      chargedAtBooking: false,
      blockers: [{
        code: "group_split_delivery_unavailable",
        message: error instanceof Error ? error.message : "Split-payment delivery could not be verified."
      }],
      message: "The appointments are confirmed, but split-payment texts are unavailable. No card was charged and no placeholder link was created."
    };
  }

  return {
    groupId,
    status: "confirmed",
    memberCount: created.length,
    totalServiceCents,
    currency,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    paymentMode: payload.paymentMode,
    paymentDelivery,
    paymentResponsibilities: responsibilities.map((item) => ({
      memberId: item.memberId,
      payerKind: item.payerKind,
      amountCents: item.amountCents,
      currency: item.currency,
      status: "planned"
    })),
    appointments: result.appointments ?? [],
    doctrine: {
      oneCancellationCancelsGroup: false,
      pricesComeFromServiceCatalog: true,
      chargedAtBooking: false,
      minorPayer: "organizer"
    }
  };
}

export async function createKioskGroupRequest(input: {
  shopReference: string;
  payload: KioskGroupRequestInput;
}) {
  const payload = kioskGroupRequestSchema.parse(input.payload);
  const supabase = requireSupabase();
  const honest = kioskGroupHonesty(payload);
  const inserted = await supabase.from("kiosk_group_requests").upsert({
    shop_reference: input.shopReference,
    requester_name: payload.fullName,
    requester_phone: payload.phone,
    requester_email: payload.email?.toLowerCase() ?? null,
    group_size: payload.groupSize,
    seating_mode: payload.seatingMode,
    operational_sms_consent: payload.operationalSmsConsent,
    idempotency_key: payload.idempotencyKey,
    status: honest.status,
    updated_at: new Date().toISOString()
  }, { onConflict: "shop_reference,idempotency_key" })
    .select("id, status, created_at")
    .single();
  if (inserted.error || !inserted.data) {
    throw new GroupBookingServiceError("The live floor could not record this group request.", 503);
  }
  return {
    requestId: inserted.data.id as string,
    status: inserted.data.status as string,
    message: honest.message,
    groupSize: payload.groupSize,
    seatingMode: payload.seatingMode,
    waitEstimateMinutes: null,
    queuePosition: null,
    recordedAt: inserted.data.created_at as string
  };
}
