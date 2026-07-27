/**
 * Local-only seeded kiosk fixture.
 *
 * The full kiosk mission — shop kiosk, barber kiosk, returning-client lookup,
 * booking, and the staff PIN exit — normally needs a configured shop in
 * Supabase plus a payments provider. That makes the surface impossible to
 * exercise on a laptop without touching live infrastructure, so this module
 * seeds an entirely in-memory shop and barber instead.
 *
 * Two independent conditions must both hold before any of it is reachable:
 *
 *   1. `KIOSK_LOCAL_FIXTURE=true` must be set explicitly, and
 *   2. the process must not be running in production.
 *
 * Nothing here reads or writes Supabase, Stripe, or any other network service,
 * and bookings live only for the lifetime of the process. The fixture is a
 * rendering aid, never a data path a real shop can reach.
 */

import type {
  KioskBookingInput,
  KioskBookingResult,
  KioskClientSearchResult,
  KioskPayload
} from "@/types/kiosk";

export const KIOSK_FIXTURE_SHOP_ID = "kiosk-local-fixture-shop";
export const KIOSK_FIXTURE_BARBER_ID = "kiosk-local-fixture-barber";
/** Published in plain sight because it only ever unlocks the seeded fixture. */
export const KIOSK_FIXTURE_PIN = "2468";

export type KioskFixtureScope = "shop" | "barber";

export function isKioskFixtureEnabled() {
  return process.env.KIOSK_LOCAL_FIXTURE === "true" && process.env.NODE_ENV !== "production";
}

export function isKioskFixtureTarget(scope: KioskFixtureScope, targetReference: string) {
  if (!isKioskFixtureEnabled()) {
    return false;
  }

  return scope === "barber"
    ? targetReference === KIOSK_FIXTURE_BARBER_ID
    : targetReference === KIOSK_FIXTURE_SHOP_ID;
}

/**
 * Every barber prices their own chair — the shop kiosk shows each one their
 * own menu, and the "From $X" chip is the cheapest service on that menu. The
 * three fixture barbers deliberately disagree on price so the per-barber rail
 * is visibly per-barber and not a shop-wide list wearing a disguise.
 */
const FIXTURE_BARBERS = [
  {
    id: KIOSK_FIXTURE_BARBER_ID,
    name: "Blaze King",
    handle: "blazeking",
    initials: "BK",
    waitMinutes: 10,
    ahead: 1,
    acceptsWalkIns: true,
    services: [
      { id: "kiosk-fixture-srv-signature", name: "Signature Cut", category: "Cut", priceCents: 4000, durationMinutes: 45 },
      { id: "kiosk-fixture-srv-cut-beard", name: "Cut & Beard", category: "Grooming", priceCents: 5500, durationMinutes: 60 },
      { id: "kiosk-fixture-srv-lineup", name: "Line Up", category: "Grooming", priceCents: 2000, durationMinutes: 20 },
      { id: "kiosk-fixture-srv-kids", name: "Kids Cut", category: "Cut", priceCents: 2500, durationMinutes: 30 }
    ]
  },
  {
    id: "kiosk-local-fixture-barber-2",
    name: "Rae Solomon",
    handle: "raesolomon",
    initials: "RS",
    waitMinutes: 0,
    ahead: 0,
    acceptsWalkIns: true,
    services: [
      { id: "kiosk-fixture-srv-precision", name: "Precision Cut", category: "Cut", priceCents: 4500, durationMinutes: 50 },
      { id: "kiosk-fixture-srv-braids", name: "Braids", category: "Styling", priceCents: 8000, durationMinutes: 120 },
      { id: "kiosk-fixture-srv-shave", name: "Hot Towel Shave", category: "Grooming", priceCents: 3000, durationMinutes: 25 },
      { id: "kiosk-fixture-srv-design", name: "Design / Part", category: "Styling", priceCents: 1500, durationMinutes: 15 }
    ]
  },
  {
    id: "kiosk-local-fixture-barber-3",
    name: "Deon Vasquez",
    handle: "deonvasquez",
    initials: "DV",
    waitMinutes: 45,
    ahead: 4,
    acceptsWalkIns: false,
    services: [
      { id: "kiosk-fixture-srv-classic", name: "Classic Cut", category: "Cut", priceCents: 2000, durationMinutes: 35 },
      { id: "kiosk-fixture-srv-trim", name: "Beard Trim", category: "Grooming", priceCents: 1800, durationMinutes: 20 }
    ]
  }
] as const;

const FIXTURE_CLIENTS: KioskClientSearchResult[] = [
  {
    profileId: "kiosk-local-fixture-client-1",
    displayName: "Phillip McGee",
    publicUsername: "phillipmcgee",
    locationLabel: "Tampa, FL",
    roleLabel: "CLIENT"
  },
  {
    profileId: "kiosk-local-fixture-client-2",
    displayName: "Marisol Duran",
    publicUsername: "marisolduran",
    locationLabel: "Ybor City, FL",
    roleLabel: "CLIENT"
  }
];

/** In-memory only: a process restart wipes every fixture booking. */
let fixtureBookingCounter = 0;

function waitLabel(minutes: number) {
  return `About ${minutes} min`;
}

function nextAvailableAt(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function getKioskFixturePayload(scope: KioskFixtureScope, targetReference: string): KioskPayload {
  const barbers = FIXTURE_BARBERS.filter((barber) => (scope === "barber" ? barber.id === targetReference : true));
  const primary = barbers[0] ?? FIXTURE_BARBERS[0];
  const services = barbers.flatMap((barber) =>
    barber.services.map((service) => ({
      id: service.id,
      name: service.name,
      category: service.category,
      priceCents: service.priceCents,
      durationMinutes: service.durationMinutes,
      barberId: barber.id
    }))
  );

  return {
    shop: scope === "barber"
      ? {
          shopId: targetReference,
          // Handle, not the real name: the barber front door is public and the
          // reveal card on the confirmation screen is the only place a name
          // belongs.
          shopName: primary.handle,
          subtitle: "Book your cut with this barber",
          locationLabel: "Ybor City, Tampa (local fixture)",
          mode: "barber"
        }
      : {
          shopId: targetReference,
          shopName: "BVRB3R Ybor (local fixture)",
          subtitle: "Check in or book your appointment",
          locationLabel: "Ybor City, Tampa (local fixture)",
          mode: "shop"
        },
    services,
    barbers: barbers.map((barber) => ({
      id: barber.id,
      name: barber.name,
      publicUsername: barber.handle,
      liveStatusLabel: barber.acceptsWalkIns ? "Available" : "Schedule ahead only",
      nextAvailableAt: nextAvailableAt(barber.waitMinutes),
      acceptsWalkIns: barber.acceptsWalkIns,
      waitDisplayLabel: waitLabel(barber.waitMinutes),
      estimatedWaitMinutes: barber.waitMinutes,
      estimatedStartTime: nextAvailableAt(barber.waitMinutes),
      queueAhead: barber.ahead
    })),
    queue: {
      activeCount: scope === "barber" ? barbers[0]?.ahead ?? 0 : 3,
      averageWaitMinutes: primary.waitMinutes,
      kioskEntriesToday: 4,
      waitEstimateUpdatedAt: new Date().toISOString()
    },
    defaults: {
      autoResetSeconds: 7,
      inactivityResetSeconds: 75,
      bookingMode: "next_available",
      appointmentSource: scope === "barber" ? "barber_kiosk" : "shop_kiosk",
      allowChooseBarber: scope !== "barber",
      supportedActions: ["book_next_opening", "choose_barber", "schedule_ahead"]
    }
  };
}

export function searchKioskFixtureClients(query: string): KioskClientSearchResult[] {
  const normalized = query.trim().replace(/^@+/, "").toLowerCase();
  if (normalized.length < 2) {
    return [];
  }

  return FIXTURE_CLIENTS.filter((client) =>
    client.publicUsername?.includes(normalized) || client.displayName.toLowerCase().includes(normalized)
  );
}

export function createKioskFixtureBooking(
  scope: KioskFixtureScope,
  targetReference: string,
  input: KioskBookingInput
): KioskBookingResult {
  const payload = getKioskFixturePayload(scope, targetReference);
  const service = payload.services.find((option) => option.id === input.serviceId) ?? payload.services[0];
  const barber = payload.barbers.find((option) => option.id === input.preferredBarberId)
    ?? payload.barbers.find((option) => option.acceptsWalkIns)
    ?? payload.barbers[0];
  const waitMinutes = barber?.estimatedWaitMinutes ?? payload.queue.averageWaitMinutes;

  fixtureBookingCounter += 1;
  const matchedClient = FIXTURE_CLIENTS.find((client) => client.profileId === input.selectedProfileId);

  return {
    appointmentId: `kiosk-fixture-appt-${fixtureBookingCounter}`,
    confirmationCode: `LOCAL${String(fixtureBookingCounter).padStart(3, "0")}`,
    barberId: barber?.id ?? KIOSK_FIXTURE_BARBER_ID,
    barberName: barber?.name ?? "Blaze King",
    serviceId: service?.id ?? FIXTURE_BARBERS[0].services[0].id,
    serviceName: service?.name ?? FIXTURE_BARBERS[0].services[0].name,
    startsAt: input.kioskAction === "schedule_ahead" && input.scheduledAt
      ? new Date(input.scheduledAt).toISOString()
      : nextAvailableAt(waitMinutes),
    shopLabel: payload.shop.shopName,
    clientPublicUsername: matchedClient?.publicUsername
      ?? input.publicUsername?.trim().replace(/^@+/, "")
      ?? undefined,
    activationInviteQueued: false,
    estimatedWaitMinutes: waitMinutes,
    estimatedStartTime: nextAvailableAt(waitMinutes),
    waitDisplayLabel: waitLabel(waitMinutes)
  };
}

export function verifyKioskFixturePin(pin: string) {
  return pin.trim() === KIOSK_FIXTURE_PIN;
}

/** Test-only reset so booking codes stay deterministic across specs. */
export function resetKioskFixtureBookings() {
  fixtureBookingCounter = 0;
}
