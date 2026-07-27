import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KIOSK_FIXTURE_BARBER_ID,
  KIOSK_FIXTURE_PIN,
  KIOSK_FIXTURE_SHOP_ID,
  createKioskFixtureBooking,
  getKioskFixturePayload,
  isKioskFixtureEnabled,
  isKioskFixtureTarget,
  resetKioskFixtureBookings,
  searchKioskFixtureClients,
  verifyKioskFixturePin
} from "@/lib/kiosk/local-fixture";

describe("kiosk local fixture gating", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stays off unless the flag is explicitly set", () => {
    vi.stubEnv("KIOSK_LOCAL_FIXTURE", undefined);
    expect(isKioskFixtureEnabled()).toBe(false);

    vi.stubEnv("KIOSK_LOCAL_FIXTURE", "1");
    expect(isKioskFixtureEnabled()).toBe(false);

    vi.stubEnv("KIOSK_LOCAL_FIXTURE", "true");
    expect(isKioskFixtureEnabled()).toBe(true);
  });

  it("can never be reached in production even with the flag set", () => {
    vi.stubEnv("KIOSK_LOCAL_FIXTURE", "true");
    vi.stubEnv("NODE_ENV", "production");

    expect(isKioskFixtureEnabled()).toBe(false);
    expect(isKioskFixtureTarget("shop", KIOSK_FIXTURE_SHOP_ID)).toBe(false);
    expect(isKioskFixtureTarget("barber", KIOSK_FIXTURE_BARBER_ID)).toBe(false);
  });

  it("only claims its own seeded identifiers, never a real shop or barber", () => {
    vi.stubEnv("KIOSK_LOCAL_FIXTURE", "true");

    expect(isKioskFixtureTarget("shop", KIOSK_FIXTURE_SHOP_ID)).toBe(true);
    expect(isKioskFixtureTarget("barber", KIOSK_FIXTURE_BARBER_ID)).toBe(true);
    expect(isKioskFixtureTarget("shop", "loc-ybor")).toBe(false);
    expect(isKioskFixtureTarget("barber", "barber-blaze")).toBe(false);
    // Scopes do not cross over.
    expect(isKioskFixtureTarget("shop", KIOSK_FIXTURE_BARBER_ID)).toBe(false);
    expect(isKioskFixtureTarget("barber", KIOSK_FIXTURE_SHOP_ID)).toBe(false);
  });
});

describe("kiosk local fixture payloads", () => {
  beforeEach(() => {
    vi.stubEnv("KIOSK_LOCAL_FIXTURE", "true");
    resetKioskFixtureBookings();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("seeds a shop kiosk with enough services and barbers to run the whole mission", () => {
    const payload = getKioskFixturePayload("shop", KIOSK_FIXTURE_SHOP_ID);

    expect(payload.shop.mode).toBe("shop");
    expect(payload.shop.shopName).toMatch(/local fixture/i);
    expect(payload.services.length).toBeGreaterThanOrEqual(2);
    expect(payload.barbers.length).toBeGreaterThanOrEqual(2);
    expect(payload.barbers.some((barber) => barber.acceptsWalkIns)).toBe(true);
    expect(payload.defaults.appointmentSource).toBe("shop_kiosk");
    expect(payload.defaults.allowChooseBarber).toBe(true);
  });

  it("seeds a barber kiosk scoped to the single barber", () => {
    const payload = getKioskFixturePayload("barber", KIOSK_FIXTURE_BARBER_ID);

    expect(payload.shop.mode).toBe("barber");
    expect(payload.barbers).toHaveLength(1);
    expect(payload.barbers[0]?.id).toBe(KIOSK_FIXTURE_BARBER_ID);
    expect(payload.defaults.appointmentSource).toBe("barber_kiosk");
    expect(payload.defaults.allowChooseBarber).toBe(false);
  });

  it("returns a walk-in booking without any network or payment side effect", () => {
    const payload = getKioskFixturePayload("shop", KIOSK_FIXTURE_SHOP_ID);
    const booking = createKioskFixtureBooking("shop", KIOSK_FIXTURE_SHOP_ID, {
      fullName: "Jordan Ellis",
      phone: "8135550101",
      email: "jordan@example.com",
      publicUsername: "@jordanellis",
      serviceId: payload.services[1].id,
      kioskAction: "book_next_opening"
    });

    expect(booking.confirmationCode).toBe("LOCAL001");
    expect(booking.serviceId).toBe(payload.services[1].id);
    expect(booking.clientPublicUsername).toBe("jordanellis");
    expect(booking.barberId).toBeTruthy();
    expect(Number.isNaN(Date.parse(booking.startsAt))).toBe(false);
  });

  it("honours a scheduled-ahead time and increments confirmation codes", () => {
    const payload = getKioskFixturePayload("shop", KIOSK_FIXTURE_SHOP_ID);
    createKioskFixtureBooking("shop", KIOSK_FIXTURE_SHOP_ID, { serviceId: payload.services[0].id });
    const scheduled = createKioskFixtureBooking("shop", KIOSK_FIXTURE_SHOP_ID, {
      serviceId: payload.services[0].id,
      kioskAction: "schedule_ahead",
      scheduledAt: "2026-08-01T15:30:00.000Z"
    });

    expect(scheduled.confirmationCode).toBe("LOCAL002");
    expect(scheduled.startsAt).toBe("2026-08-01T15:30:00.000Z");
  });

  it("supports the returning-client lookup used by the details step", () => {
    expect(searchKioskFixtureClients("p")).toEqual([]);
    expect(searchKioskFixtureClients("@phillip")[0]?.publicUsername).toBe("phillipmcgee");
    expect(searchKioskFixtureClients("duran")[0]?.displayName).toBe("Marisol Duran");
    expect(searchKioskFixtureClients("nobody-here")).toEqual([]);
  });

  it("unlocks the staff exit with its own PIN and rejects anything else", () => {
    expect(verifyKioskFixturePin(KIOSK_FIXTURE_PIN)).toBe(true);
    expect(verifyKioskFixturePin(` ${KIOSK_FIXTURE_PIN} `)).toBe(true);
    expect(verifyKioskFixturePin("0000")).toBe(false);
    expect(verifyKioskFixturePin("")).toBe(false);
  });
});
