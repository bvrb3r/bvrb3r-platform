import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { canonicalLocationUuid } from "@/lib/booking/canonical-booking";
import { getBarberAvailabilityPayload } from "@/lib/booking/platform-service";
import { demoLocations } from "@/lib/data/demo";
import { getLiveOperationsProvider } from "@/lib/operations/live-provider";
import { readPlatformShopControlState } from "@/lib/platform-admin/service";
import { createKioskQueueEntry, getQueueWorkspacePayloadForShops, QueueServiceError } from "@/lib/queue/service";
import { readShopProfileMedia } from "@/lib/profile/service";
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

async function readShopBranding(shopId: string) {
  const supabase = getSupabase();
  if (!supabase) {
    const location = demoLocations.find((entry) => entry.id === shopId);
    if (!location) {
      throw new KioskServiceError("This shop kiosk could not be found.", 404);
    }

    const media = await readShopProfileMedia(shopId).catch(() => null);
    return {
      shopId: location.id,
      shopName: location.name,
      subtitle: "Check in or book your appointment",
      locationLabel: `${location.neighborhood}, ${location.city}`,
      profilePhotoUrl: media?.profilePhotoUrl
    };
  }

  const shopUuid = canonicalLocationUuid(shopId);
  const locationResult = await supabase
    .from("locations")
    .select("id, reference_code, name, neighborhood, city, state")
    .or(`reference_code.eq.${shopId},id.eq.${shopUuid}`)
    .maybeSingle();

  if (locationResult.error) {
    throw new KioskServiceError("Unable to load this shop kiosk.", 500);
  }

  if (!locationResult.data) {
    throw new KioskServiceError("This shop kiosk could not be found.", 404);
  }

  const row = locationResult.data as LocationBrandRow;
  const media = await readShopProfileMedia(row.reference_code ?? row.id).catch(() => null);

  return {
    shopId: row.reference_code ?? row.id,
    shopName: row.name,
    subtitle: "Check in or book your appointment",
    locationLabel: `${row.neighborhood}, ${row.city}`,
    profilePhotoUrl: media?.profilePhotoUrl
  };
}

function mapBarbers(payload: QueueWorkspacePayload): KioskBarberOption[] {
  return payload.barbers.map((barber) => ({
    id: barber.id,
    name: barber.name,
    liveStatusLabel: barber.liveStatusLabel,
    nextAvailableAt: barber.nextAvailableAt,
    acceptsWalkIns: barber.acceptsWalkIns
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
      const slot = entry.availability.slots[0];
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
  await assertKioskEnabled(shopId);
  const [branding, queuePayload] = await Promise.all([
    readShopBranding(shopId),
    getQueueWorkspacePayloadForShops([shopId])
  ]);

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
      bookingMode: "next_available"
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
  await assertKioskEnabled(input.shopId);
  try {
    const result = await createKioskQueueEntry({
      clientName: input.fullName,
      clientPhone: input.phone,
      clientEmail: input.email,
      shopId: input.shopId,
      serviceId: input.serviceId,
      queueSource: "kiosk"
    });
    const payload = await getQueueWorkspacePayloadForShops([input.shopId]);
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
  serviceId: string;
  preferredBarberId?: string;
}): Promise<KioskBookingResult> {
  await assertKioskEnabled(input.shopId);
  const queuePayload = await getQueueWorkspacePayloadForShops([input.shopId]);
  const candidate = await resolveFastestBookableSlot({
    shopId: input.shopId,
    serviceId: input.serviceId,
    preferredBarberId: input.preferredBarberId,
    barbers: queuePayload.barbers
  });
  const provider = await getLiveOperationsProvider();
  const result = await provider.createBooking({
    locationId: input.shopId,
    barberId: candidate.barber.id,
    serviceId: input.serviceId,
    addOnIds: [],
    appointmentTime: candidate.slot.startsAt,
    clientName: input.fullName,
    clientPhone: input.phone,
    actorRole: "front_desk",
    bookingSource: "kiosk",
    source: "front_desk",
    internalNotes: input.email?.trim() ? `Kiosk intake email: ${input.email.trim().toLowerCase()}` : "Created from kiosk intake."
  });

  return {
    appointmentId: result.appointment.id,
    confirmationCode: result.appointment.confirmationCode,
    barberId: candidate.barber.id,
    barberName: candidate.barber.name,
    serviceId: input.serviceId,
    serviceName: candidate.service?.name ?? queuePayload.services.find((service) => service.id === input.serviceId)?.name ?? input.serviceId,
    startsAt: candidate.slot.startsAt,
    shopLabel: queuePayload.shops[0]?.label ?? input.shopId
  };
}
