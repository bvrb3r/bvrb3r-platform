import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { getBarberAvailabilityPayload, getBarberDetailsPayload } from "@/lib/booking/platform-service";
import { demoLocations } from "@/lib/data/demo";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { readPlatformShopControlState } from "@/lib/platform-admin/service";
import { createKioskQueueEntry, getQueueWorkspacePayloadForShops, QueueServiceError } from "@/lib/queue/service";
import { readShopProfileMedia } from "@/lib/profile/service";
import { formatPublicShopLocation } from "@/lib/shops/public-identity";
import { resolveOrCreateKioskClient } from "@/lib/kiosk/client-capture";
import { calculateKioskWaitTime } from "@/lib/kiosk/wait-time";
import type { QueueBarberOptionView, QueueWorkspacePayload } from "@/lib/queue/service";
import type {
  KioskBarberOption,
  KioskBookingResult,
  KioskPayload,
  KioskWaitlistResult
} from "@/types/kiosk";

type LocationBrandRow = {
  id: string;
  reference_code: string | null;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
};

type ShopBrandRow = {
  id: string;
  name: string;
  public_username: string | null;
  owner_profile_id: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip_code?: string | null;
  address: string | null;
  profile_photo_path: string | null;
  profile_photo_url: string | null;
  cover_photo_url: string | null;
  app_approval_status: string | null;
};

type ResolvedShopKioskTarget = {
  requestedTarget: string;
  shopId: string;
  queueShopReference: string;
  platformControlReference: string;
  branding: KioskPayload["shop"];
};

const KIOSK_AUTO_RESET_SECONDS = 10;

export class KioskServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "KioskServiceError";
    this.status = status;
  }
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizePublicTarget(value: string) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function formatLocationLabel(input: {
  neighborhood?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}) {
  return formatPublicShopLocation({
    address: input.address,
    city: input.city,
    state: input.state,
    zipCode: input.zipCode
  }) || [input.neighborhood, [input.city, input.state].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" - ") || "Shop kiosk";
}

async function resolveSupabaseShopTarget(supabase: NonNullable<ReturnType<typeof getSupabase>>, shopTarget: string): Promise<ResolvedShopKioskTarget> {
  const normalizedTarget = normalizePublicTarget(shopTarget);
  const shopSelect = "id, name, public_username, owner_profile_id, neighborhood, city, state, zip_code, address, profile_photo_path, profile_photo_url, cover_photo_url, app_approval_status";
  let shopResult = await supabase
    .from("shops")
    .select(shopSelect)
    .or(`id.eq.${shopTarget},public_username.ilike.${normalizedTarget}`)
    .maybeSingle();

  if (shopResult.error) {
    throw new KioskServiceError("Unable to load this shop kiosk.", 500);
  }

  if (!shopResult.data) {
    const session = await getCurrentUserFromServer().catch(() => null);
    if (session?.authenticated && session.user.id !== "guest-user") {
      shopResult = await supabase
        .from("shops")
        .select(shopSelect)
        .eq("owner_profile_id", session.user.id)
        .maybeSingle();

      if (shopResult.error) {
        throw new KioskServiceError("Unable to load this shop kiosk.", 500);
      }
    }
  }

  const shop = (shopResult.data ?? null) as ShopBrandRow | null;
  const locationLookupFilter = isUuid(shopTarget)
    ? `reference_code.eq.${shopTarget},reference_code.ilike.${normalizedTarget},id.eq.${shopTarget}`
    : `reference_code.eq.${shopTarget},reference_code.ilike.${normalizedTarget}`;

  const locationResult = shop
    ? await supabase
      .from("locations")
      .select("id, reference_code, name, neighborhood, city, state")
      .or(`reference_code.eq.${shop.id},reference_code.eq.${shop.public_username ?? shop.id}`)
      .maybeSingle()
    : await supabase
      .from("locations")
      .select("id, reference_code, name, neighborhood, city, state")
      .or(locationLookupFilter)
      .maybeSingle();

  if (locationResult.error) {
    throw new KioskServiceError("Unable to load this shop kiosk.", 500);
  }

  if (!shop && !locationResult.data) {
    throw new KioskServiceError("This shop kiosk could not be found.", 404);
  }

  const location = (locationResult.data ?? null) as LocationBrandRow | null;
  const canonicalShopId = shop?.id ?? location?.reference_code ?? location?.id ?? shopTarget;
  const queueShopReference = location?.reference_code ?? location?.id ?? canonicalShopId;
  const media = await readShopProfileMedia(canonicalShopId).catch(() => null);

  return {
    requestedTarget: shopTarget,
    shopId: canonicalShopId,
    queueShopReference,
    platformControlReference: canonicalShopId,
    branding: {
      shopId: canonicalShopId,
      shopName: shop?.name ?? location?.name ?? "BVRB3R Shop",
      subtitle: "Check in or book your appointment",
      locationLabel: formatLocationLabel({
        neighborhood: shop?.neighborhood ?? location?.neighborhood,
        address: shop?.address,
        city: shop?.city ?? location?.city,
        state: shop?.state ?? location?.state,
        zipCode: shop?.zip_code
      }),
      profilePhotoUrl: media?.profilePhotoUrl ?? shop?.profile_photo_url ?? undefined,
      mode: "shop"
    }
  };
}

async function resolveShopKioskTarget(shopId: string): Promise<ResolvedShopKioskTarget> {
  const supabase = getSupabase();
  if (!supabase) {
    const location = demoLocations.find((entry) => entry.id === shopId);
    if (!location) {
      throw new KioskServiceError("This shop kiosk could not be found.", 404);
    }

    const media = await readShopProfileMedia(shopId).catch(() => null);
    return {
      requestedTarget: shopId,
      shopId: location.id,
      queueShopReference: location.id,
      platformControlReference: location.id,
      branding: {
        shopId: location.id,
        shopName: location.name,
        subtitle: "Check in or book your appointment",
        locationLabel: `${location.neighborhood}, ${location.city}`,
        profilePhotoUrl: media?.profilePhotoUrl,
        mode: "shop" as const
      }
    };
  }

  return resolveSupabaseShopTarget(supabase, shopId);
}

function mapBarbers(payload: QueueWorkspacePayload): KioskBarberOption[] {
  return payload.barbers.map((barber) => ({
    id: barber.id,
    name: barber.name,
    liveStatusLabel: barber.liveStatusLabel,
    nextAvailableAt: barber.nextAvailableAt,
    acceptsWalkIns: barber.acceptsWalkIns,
    ...calculateKioskWaitTime({
      queueDepth: payload.summary.activeCount,
      nextAvailableAt: barber.nextAvailableAt,
      barberStatus: barber.liveStatusLabel,
      acceptsWalkIns: barber.acceptsWalkIns
    })
  }));
}

function sortFastestChairCandidates(barbers: QueueBarberOptionView[]) {
  return [...barbers].sort((left, right) => {
    if (left.acceptsWalkIns !== right.acceptsWalkIns) {
      return left.acceptsWalkIns ? -1 : 1;
    }

    const leftNext = left.nextAvailableAt ? new Date(left.nextAvailableAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightNext = right.nextAvailableAt ? new Date(right.nextAvailableAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (leftNext !== rightNext) {
      return leftNext - rightNext;
    }

    return left.name.localeCompare(right.name);
  });
}

function emptyQueuePayload(): QueueWorkspacePayload {
  return {
    summary: {
      activeCount: 0,
      calledCount: 0,
      assignedCount: 0,
      averageWaitMinutes: 0
    },
    shops: [],
    barbers: [],
    services: [],
    entries: [],
    recentResolvedEntries: []
  };
}

async function assertKioskEnabled(shopId: string) {
  const controlState = await readPlatformShopControlState(shopId).catch(() => null);
  if (!controlState) {
    return;
  }

  if (controlState.shopStatus !== "active") {
    throw new KioskServiceError("This shop kiosk is not active right now.", 403);
  }

  if (!controlState.kioskEnabled) {
    throw new KioskServiceError("Kiosk mode is disabled for this shop right now.", 403);
  }
}

async function resolveFastestBookableSlot(input: {
  shopId: string;
  serviceId: string;
  preferredBarberId?: string;
  barbers: QueueBarberOptionView[];
  scheduledAt?: string;
}) {
  const candidates = input.preferredBarberId
    ? input.barbers.filter((barber) => barber.id === input.preferredBarberId)
    : sortFastestChairCandidates(input.barbers);

  if (!candidates.length) {
    throw new KioskServiceError("No eligible barber is available for kiosk booking right now.", 409);
  }

  const slotPayloads = await Promise.all(
    candidates.map(async (barber) => ({
      barber,
      availability: await getBarberAvailabilityPayload(barber.id, {
        serviceId: input.serviceId,
        locationId: input.shopId,
        days: 2
      })
    }))
  );

  const candidate = slotPayloads
    .flatMap((entry) => {
      const slot = input.scheduledAt
        ? entry.availability.slots.find((candidateSlot) => candidateSlot.startsAt === input.scheduledAt) ?? entry.availability.slots.find((candidateSlot) => new Date(candidateSlot.startsAt).getTime() >= new Date(input.scheduledAt ?? "").getTime())
        : entry.availability.slots[0];
      return slot
        ? [{
            barber: entry.barber,
            slot,
            service: entry.availability.service
          }]
        : [];
    })
    .sort((left, right) => new Date(left.slot.startsAt).getTime() - new Date(right.slot.startsAt).getTime())[0];

  if (!candidate) {
    throw new KioskServiceError("No bookable kiosk slot is available right now.", 409);
  }

  return candidate;
}

function estimateWaitMinutes(input: {
  position: number;
  averageWaitMinutes: number;
  bestAvailableAt?: string | null;
}) {
  if (input.bestAvailableAt) {
    const delta = Math.round((new Date(input.bestAvailableAt).getTime() - Date.now()) / 60_000);
    if (delta > 0) {
      return delta;
    }
  }

  if (input.averageWaitMinutes > 0) {
    return input.averageWaitMinutes;
  }

  return Math.max(10, input.position * 10);
}

export async function getKioskPayload(shopId: string): Promise<KioskPayload> {
  const target = await resolveShopKioskTarget(shopId);
  await assertKioskEnabled(target.platformControlReference);
  const branding = target.branding;
  const queuePayload = await getQueueWorkspacePayloadForShops([target.queueShopReference]).catch((error) => {
    if (error instanceof QueueServiceError && error.status === 404) {
      return emptyQueuePayload();
    }

    throw error;
  });

  const kioskEntriesToday = [
    ...queuePayload.entries,
    ...queuePayload.recentResolvedEntries
  ].filter((entry) => entry.queueSource === "kiosk" && entry.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  return {
    shop: branding,
    services: queuePayload.services.map((service) => ({
      id: service.id,
      name: service.name,
      category: service.category
    })),
    barbers: mapBarbers(queuePayload),
    queue: {
      activeCount: queuePayload.summary.activeCount,
      averageWaitMinutes: queuePayload.summary.averageWaitMinutes,
      kioskEntriesToday
    },
    defaults: {
      autoResetSeconds: KIOSK_AUTO_RESET_SECONDS,
      bookingMode: "next_available",
      appointmentSource: "shop_kiosk",
      allowChooseBarber: true,
      supportedActions: ["book_next_opening", "choose_barber", "check_in", "schedule_ahead"]
    }
  };
}

export async function getBarberKioskPayload(barberId: string): Promise<KioskPayload> {
  const profile = await getBarberDetailsPayload(barberId);
  if (!profile) {
    throw new KioskServiceError("This barber kiosk could not be found.", 404);
  }

  const barberReference = profile.profile.barberId || profile.barber.id || barberId;
  const barberName = profile.barber.name || barberReference;
  const services = profile.services
    .filter((item) => item.service.id && item.service.name)
    .map((item) => ({
      id: item.service.id,
      name: item.service.name,
      category: item.service.category || "Service"
    }));

  const selectedServiceId = services[0]?.id;
  const availability = selectedServiceId
    ? await getBarberAvailabilityPayload(barberReference, { serviceId: selectedServiceId, days: 2 })
    : null;

  return {
    shop: {
      shopId: barberReference,
      shopName: barberName,
      subtitle: "Book your cut with this barber",
      locationLabel: profile.profile.serviceAreaLabel ?? profile.shop?.name ?? "Barber kiosk",
      profilePhotoUrl: profile.profile.profilePhotoUrl ?? undefined,
      mode: "barber"
    },
    services,
    barbers: [{
      id: barberReference,
      name: barberName,
      liveStatusLabel: availability?.slots.length ? "Bookable" : "Availability soon",
      nextAvailableAt: availability?.slots[0]?.startsAt ?? null,
      acceptsWalkIns: true,
      ...calculateKioskWaitTime({
        nextAvailableAt: availability?.slots[0]?.startsAt ?? null,
        barberStatus: availability?.slots.length ? "available" : "not_available",
        acceptsWalkIns: true
      })
    }],
    queue: {
      activeCount: 0,
      averageWaitMinutes: availability?.slots.length ? 0 : 10,
      kioskEntriesToday: 0
    },
    defaults: {
      autoResetSeconds: KIOSK_AUTO_RESET_SECONDS,
      bookingMode: "next_available",
      appointmentSource: "barber_kiosk",
      allowChooseBarber: false,
      supportedActions: ["book_next_opening", "check_in", "schedule_ahead"]
    }
  };
}

export async function createKioskWaitlist(input: {
  shopId: string;
  fullName: string;
  phone: string;
  email?: string;
  serviceId?: string;
}): Promise<KioskWaitlistResult> {
  const target = await resolveShopKioskTarget(input.shopId);
  await assertKioskEnabled(target.platformControlReference);
  try {
    const result = await createKioskQueueEntry({
      clientName: input.fullName,
      clientPhone: input.phone,
      clientEmail: input.email,
      shopId: target.queueShopReference,
      serviceId: input.serviceId,
      queueSource: "kiosk"
    });
    const payload = await getQueueWorkspacePayloadForShops([target.queueShopReference]);
    const position = payload.entries.findIndex((entry) => entry.id === result.entry.id) + 1;

    return {
      entryId: result.entry.id,
      queuePosition: Math.max(position, 1),
      statusLabel: result.entry.statusLabel,
      estimatedWaitMinutes: estimateWaitMinutes({
        position: Math.max(position, 1),
        averageWaitMinutes: payload.summary.averageWaitMinutes,
        bestAvailableAt: result.entry.bestAvailableBarber?.nextAvailableAt
      }),
      bestBarberName: result.entry.bestAvailableBarber?.barberName,
      bestBarberStatusLabel: result.entry.bestAvailableBarber?.liveStatusLabel,
      shopLabel: result.entry.shopLabel
    };
  } catch (error) {
    if (error instanceof QueueServiceError) {
      throw new KioskServiceError(error.message, error.status);
    }

    throw error;
  }
}

export async function createKioskBooking(input: {
  shopId: string;
  fullName: string;
  phone: string;
  email?: string;
  publicUsername?: string;
  selectedProfileId?: string;
  serviceId: string;
  preferredBarberId?: string;
  kioskAction?: "book_next_opening" | "schedule_ahead";
  scheduledAt?: string;
}): Promise<KioskBookingResult> {
  const target = await resolveShopKioskTarget(input.shopId);
  await assertKioskEnabled(target.platformControlReference);
  const queuePayload = await getQueueWorkspacePayloadForShops([target.queueShopReference]);
  const candidate = await resolveFastestBookableSlot({
    shopId: target.queueShopReference,
    serviceId: input.serviceId,
    preferredBarberId: input.preferredBarberId,
    barbers: queuePayload.barbers,
    scheduledAt: input.kioskAction === "schedule_ahead" ? input.scheduledAt : undefined
  });
  const client = await resolveOrCreateKioskClient({
    fullName: input.fullName,
    phone: input.phone,
    email: input.email,
    publicUsername: input.publicUsername,
    selectedProfileId: input.selectedProfileId,
    source: "shop_kiosk"
  });
  const waitEstimate = calculateKioskWaitTime({
    queueDepth: queuePayload.summary.activeCount,
    nextAvailableAt: candidate.slot.startsAt,
    serviceDurationMinutes: candidate.service?.durationMin,
    barberStatus: candidate.barber.liveStatusLabel,
    acceptsWalkIns: candidate.barber.acceptsWalkIns
  });
  const action = input.kioskAction ?? "book_next_opening";
  const provider = await getLiveOperationsProvider();
  const result = await provider.createBooking({
    locationId: target.queueShopReference,
    barberId: candidate.barber.id,
    serviceId: input.serviceId,
    addOnIds: [],
    appointmentTime: candidate.slot.startsAt,
    clientId: client?.clientReference,
    clientName: input.fullName,
    clientPhone: input.phone,
    actorRole: "front_desk",
    bookingSource: "shop_kiosk",
    source: "front_desk",
    internalNotes: [
      `Created from shop kiosk intake.`,
      `Kiosk action: ${action}.`,
      `Wait shown: ${waitEstimate.waitDisplayLabel}.`,
      input.email?.trim() ? `Kiosk intake email: ${input.email.trim().toLowerCase()}` : null
    ].filter(Boolean).join(" ")
  });

  return {
    appointmentId: result.appointment.id,
    confirmationCode: result.appointment.confirmationCode,
    barberId: candidate.barber.id,
    barberName: candidate.barber.name,
    serviceId: input.serviceId,
    serviceName: candidate.service?.name ?? queuePayload.services.find((service) => service.id === input.serviceId)?.name ?? input.serviceId,
    startsAt: candidate.slot.startsAt,
    shopLabel: queuePayload.shops[0]?.label ?? input.shopId,
    clientPublicUsername: client?.publicUsername,
    activationInviteQueued: client?.activationInviteQueued ?? false,
    estimatedWaitMinutes: waitEstimate.estimatedWaitMinutes,
    estimatedStartTime: waitEstimate.estimatedStartTime,
    waitDisplayLabel: waitEstimate.waitDisplayLabel
  };
}

export async function createBarberKioskBooking(input: {
  barberId: string;
  fullName: string;
  phone: string;
  email?: string;
  publicUsername?: string;
  selectedProfileId?: string;
  serviceId: string;
  kioskAction?: "book_next_opening" | "schedule_ahead";
  scheduledAt?: string;
}): Promise<KioskBookingResult> {
  const profile = await getBarberDetailsPayload(input.barberId);
  if (!profile) {
    throw new KioskServiceError("This barber kiosk could not be found.", 404);
  }

  const barberReference = profile.profile.barberId || profile.barber.id || input.barberId;
  const barberName = profile.barber.name || barberReference;
  const availability = await getBarberAvailabilityPayload(barberReference, {
    serviceId: input.serviceId,
    days: 2
  });
  const slot = input.kioskAction === "schedule_ahead" && input.scheduledAt
    ? availability.slots.find((candidateSlot) => candidateSlot.startsAt === input.scheduledAt) ?? availability.slots.find((candidateSlot) => new Date(candidateSlot.startsAt).getTime() >= new Date(input.scheduledAt ?? "").getTime())
    : availability.slots[0];
  if (!slot || !availability.locationId) {
    throw new KioskServiceError("No bookable kiosk slot is available right now.", 409);
  }

  const client = await resolveOrCreateKioskClient({
    fullName: input.fullName,
    phone: input.phone,
    email: input.email,
    publicUsername: input.publicUsername,
    selectedProfileId: input.selectedProfileId,
    source: "barber_kiosk"
  });
  const waitEstimate = calculateKioskWaitTime({
    nextAvailableAt: slot.startsAt,
    serviceDurationMinutes: availability.service?.durationMin,
    barberStatus: availability.slots.length ? "available" : "not_available",
    acceptsWalkIns: true
  });
  const action = input.kioskAction ?? "book_next_opening";
  const provider = await getLiveOperationsProvider();
  const result = await provider.createBooking({
    locationId: availability.locationId,
    barberId: barberReference,
    serviceId: input.serviceId,
    addOnIds: [],
    appointmentTime: slot.startsAt,
    clientId: client?.clientReference,
    clientName: input.fullName,
    clientPhone: input.phone,
    actorRole: "front_desk",
    bookingSource: "barber_kiosk",
    source: "front_desk",
    internalNotes: [
      `Created from barber kiosk intake.`,
      `Kiosk action: ${action}.`,
      `Wait shown: ${waitEstimate.waitDisplayLabel}.`,
      input.email?.trim() ? `Barber kiosk intake email: ${input.email.trim().toLowerCase()}` : null
    ].filter(Boolean).join(" ")
  });

  return {
    appointmentId: result.appointment.id,
    confirmationCode: result.appointment.confirmationCode,
    barberId: barberReference,
    barberName,
    serviceId: input.serviceId,
    serviceName: availability.service?.name ?? profile.services.find((item) => item.service.id === input.serviceId)?.service.name ?? input.serviceId,
    startsAt: slot.startsAt,
    shopLabel: availability.locationId,
    clientPublicUsername: client?.publicUsername,
    activationInviteQueued: client?.activationInviteQueued ?? false,
    estimatedWaitMinutes: waitEstimate.estimatedWaitMinutes,
    estimatedStartTime: waitEstimate.estimatedStartTime,
    waitDisplayLabel: waitEstimate.waitDisplayLabel
  };
}
