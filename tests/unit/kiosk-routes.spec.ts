import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KIOSK_FIXTURE_BARBER_ID,
  KIOSK_FIXTURE_PIN,
  KIOSK_FIXTURE_SHOP_ID,
  resetKioskFixtureBookings
} from "@/lib/kiosk/local-fixture";
import { resetRateLimits } from "@/lib/kiosk/rate-limit";
import { KioskServiceError } from "@/lib/kiosk/service";
import { KioskSessionError } from "@/lib/kiosk/session-service";
import { KioskSettingsError } from "@/lib/kiosk/settings-service";

const {
  getKioskPayloadMock,
  getBarberKioskPayloadMock,
  createKioskBookingMock,
  createBarberKioskBookingMock,
  createKioskWaitlistMock,
  getKioskSettingsStatusMock,
  assertKioskDeviceSessionMock
} = vi.hoisted(() => ({
  getKioskPayloadMock: vi.fn(),
  getBarberKioskPayloadMock: vi.fn(),
  createKioskBookingMock: vi.fn(),
  createBarberKioskBookingMock: vi.fn(),
  createKioskWaitlistMock: vi.fn(),
  getKioskSettingsStatusMock: vi.fn(),
  assertKioskDeviceSessionMock: vi.fn()
}));

vi.mock("@/lib/kiosk/session-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/kiosk/session-service")>("@/lib/kiosk/session-service");
  return {
    ...actual,
    assertKioskDeviceSession: assertKioskDeviceSessionMock
  };
});

vi.mock("@/lib/kiosk/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/kiosk/service")>("@/lib/kiosk/service");
  return {
    ...actual,
    getKioskPayload: getKioskPayloadMock,
    getBarberKioskPayload: getBarberKioskPayloadMock,
    createKioskBooking: createKioskBookingMock,
    createBarberKioskBooking: createBarberKioskBookingMock,
    createKioskWaitlist: createKioskWaitlistMock
  };
});

import { GET as getKiosk } from "@/app/api/kiosk/[shopId]/route";
import { POST as postKioskBooking } from "@/app/api/kiosk/[shopId]/booking/route";
import { POST as postKioskWaitlist } from "@/app/api/kiosk/[shopId]/waitlist/route";
import { GET as getBarberKiosk } from "@/app/api/kiosk/barber/[barberId]/route";
import { POST as postBarberKioskBooking } from "@/app/api/kiosk/barber/[barberId]/booking/route";
import { GET as getKioskSettings } from "@/app/api/kiosk/settings/route";
import { POST as postVerifyPin } from "@/app/api/kiosk/verify-pin/route";

vi.mock("@/lib/kiosk/settings-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/kiosk/settings-service")>("@/lib/kiosk/settings-service");
  return {
    ...actual,
    getKioskSettingsStatus: getKioskSettingsStatusMock
  };
});

describe("kiosk routes", () => {
  beforeEach(() => {
    getKioskPayloadMock.mockReset();
    getBarberKioskPayloadMock.mockReset();
    createKioskBookingMock.mockReset();
    createBarberKioskBookingMock.mockReset();
    createKioskWaitlistMock.mockReset();
    getKioskSettingsStatusMock.mockReset();
    // Default: kiosk is configured (owner has set a PIN and enabled it), so
    // the launch gate passes unless a test overrides it.
    getKioskSettingsStatusMock.mockResolvedValue({ scope: "shop", targetReference: "any", enabled: true, pinSet: true });
    assertKioskDeviceSessionMock.mockReset();
    assertKioskDeviceSessionMock.mockResolvedValue(undefined);
    resetRateLimits();
  });

  it("returns the branded kiosk payload", async () => {
    getKioskPayloadMock.mockResolvedValue({
      shop: {
        shopId: "loc-ybor",
        shopName: "BVRB3R Ybor",
        subtitle: "Check in or book your appointment",
        locationLabel: "Ybor City, Tampa"
      },
      services: [{ id: "srv-cut", name: "Signature Cut", category: "Cut" }],
      barbers: [],
      queue: { activeCount: 1, averageWaitMinutes: 8, kioskEntriesToday: 4 },
      defaults: { autoResetSeconds: 10, bookingMode: "next_available" }
    });

    const response = await getKiosk(new Request("https://bvrb3r.demo/api/kiosk/loc-ybor"), {
      params: Promise.resolve({ shopId: "loc-ybor" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.shop.shopName).toBe("BVRB3R Ybor");
    expect(body.queue.kioskEntriesToday).toBe(4);
  });

  it("loads a shop kiosk payload by public shop username target", async () => {
    getKioskPayloadMock.mockResolvedValue({
      shop: {
        shopId: "shop-ybor",
        shopName: "BVRB3R Ybor",
        subtitle: "Check in or book your appointment",
        locationLabel: "Ybor City, Tampa",
        mode: "shop"
      },
      services: [{ id: "srv-cut", name: "Signature Cut", category: "Cut" }],
      barbers: [{ id: "barber-blaze", name: "Blaze King", liveStatusLabel: "Bookable", nextAvailableAt: null, acceptsWalkIns: true }],
      queue: { activeCount: 0, averageWaitMinutes: 0, kioskEntriesToday: 0 },
      defaults: { autoResetSeconds: 10, bookingMode: "next_available", appointmentSource: "shop_kiosk", allowChooseBarber: true }
    });

    const response = await getKiosk(new Request("https://bvrb3r.demo/api/kiosk/thebvrb3rshopuniversitymall"), {
      params: Promise.resolve({ shopId: "thebvrb3rshopuniversitymall" })
    });

    expect(response.status).toBe(200);
    expect(getKioskPayloadMock).toHaveBeenCalledWith("thebvrb3rshopuniversitymall");
  });

  it("returns kiosk settings status without requiring the PIN for entry", async () => {
    getKioskSettingsStatusMock.mockResolvedValue({
      scope: "shop",
      targetReference: "shop-ybor",
      enabled: true,
      pinSet: true
    });

    const response = await getKioskSettings(new Request("https://bvrb3r.demo/api/kiosk/settings?scope=shop&targetReference=shop-ybor"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.pinSet).toBe(true);
  });

  it("rejects invalid kiosk booking payloads", async () => {
    const response = await postKioskBooking(new NextRequest("https://bvrb3r.demo/api/kiosk/loc-ybor/booking", {
      method: "POST",
      body: JSON.stringify({ fullName: "J" })
    }), {
      params: Promise.resolve({ shopId: "loc-ybor" })
    });

    expect(response.status).toBe(400);
  });

  it("creates a kiosk booking", async () => {
    createKioskBookingMock.mockResolvedValue({
      appointmentId: "appt-1",
      confirmationCode: "BVR123",
      barberId: "barber-blaze",
      barberName: "Blaze King",
      serviceId: "srv-cut",
      serviceName: "Signature Cut",
      startsAt: "2026-03-27T14:00:00.000Z",
      shopLabel: "BVRB3R Ybor / Ybor City / Tampa"
    });

    const response = await postKioskBooking(new NextRequest("https://bvrb3r.demo/api/kiosk/loc-ybor/booking", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Jordan Ellis",
        phone: "8135550101",
        email: "jordan@example.com",
        publicUsername: "jordanellis",
        serviceId: "srv-cut"
      })
    }), {
      params: Promise.resolve({ shopId: "loc-ybor" })
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.confirmationCode).toBe("BVR123");
  });

  /**
   * The public username is opt-in. A walk-in who declines to pick a handle
   * still books; guest-to-account conversion is PR 23's job, not a gate a
   * client has to pass to sit in a chair.
   */
  describe("optional public username", () => {
    const booking = {
      appointmentId: "appt-guest",
      confirmationCode: "BVR777",
      barberId: "barber-blaze",
      barberName: "Blaze King",
      serviceId: "srv-cut",
      serviceName: "Signature Cut",
      startsAt: "2026-03-27T14:00:00.000Z",
      shopLabel: "BVRB3R Ybor / Ybor City / Tampa"
    };

    it("books a shop-kiosk guest with no username at all", async () => {
      createKioskBookingMock.mockResolvedValue(booking);

      const response = await postKioskBooking(new NextRequest("https://bvrb3r.demo/api/kiosk/loc-ybor/booking", {
        method: "POST",
        body: JSON.stringify({
          fullName: "Jordan Ellis",
          phone: "8135550101",
          email: "jordan@example.com",
          serviceId: "srv-cut"
        })
      }), { params: Promise.resolve({ shopId: "loc-ybor" }) });

      expect(response.status).toBe(201);
      expect(createKioskBookingMock).toHaveBeenCalledWith(expect.objectContaining({ serviceId: "srv-cut" }));
      expect(createKioskBookingMock.mock.calls[0][0].publicUsername).toBeUndefined();
    });

    it("books a shop-kiosk guest who sends a blank username string", async () => {
      createKioskBookingMock.mockResolvedValue(booking);

      const response = await postKioskBooking(new NextRequest("https://bvrb3r.demo/api/kiosk/loc-ybor/booking", {
        method: "POST",
        body: JSON.stringify({
          fullName: "Jordan Ellis",
          phone: "8135550101",
          email: "jordan@example.com",
          publicUsername: "   ",
          serviceId: "srv-cut"
        })
      }), { params: Promise.resolve({ shopId: "loc-ybor" }) });

      expect(response.status).toBe(201);
    });

    it("books a barber-kiosk guest with no username", async () => {
      createBarberKioskBookingMock.mockResolvedValue({ ...booking, appointmentId: "appt-barber-guest" });

      const response = await postBarberKioskBooking(new NextRequest("https://bvrb3r.demo/api/kiosk/barber/barber-blaze/booking", {
        method: "POST",
        body: JSON.stringify({
          fullName: "Jordan Ellis",
          phone: "8135550101",
          email: "jordan@example.com",
          serviceId: "srv-cut"
        })
      }), { params: Promise.resolve({ barberId: "barber-blaze" }) });

      expect(response.status).toBe(201);
      expect(createBarberKioskBookingMock.mock.calls[0][0].publicUsername).toBeUndefined();
    });

    it("books a recognised profile with no name, phone, email or username", async () => {
      createKioskBookingMock.mockResolvedValue(booking);

      const response = await postKioskBooking(new NextRequest("https://bvrb3r.demo/api/kiosk/loc-ybor/booking", {
        method: "POST",
        body: JSON.stringify({ selectedProfileId: "profile-client", serviceId: "srv-cut" })
      }), { params: Promise.resolve({ shopId: "loc-ybor" }) });

      expect(response.status).toBe(201);
      expect(createKioskBookingMock.mock.calls[0][0].selectedProfileId).toBe("profile-client");
    });

    it("books a recognised barber-kiosk profile the same way", async () => {
      createBarberKioskBookingMock.mockResolvedValue(booking);

      const response = await postBarberKioskBooking(new NextRequest("https://bvrb3r.demo/api/kiosk/barber/barber-blaze/booking", {
        method: "POST",
        body: JSON.stringify({ selectedProfileId: "profile-client", serviceId: "srv-cut" })
      }), { params: Promise.resolve({ barberId: "barber-blaze" }) });

      expect(response.status).toBe(201);
    });

    it("still requires name, phone and email from a guest", async () => {
      for (const payload of [
        { phone: "8135550101", email: "jordan@example.com", serviceId: "srv-cut" },
        { fullName: "Jordan Ellis", email: "jordan@example.com", serviceId: "srv-cut" },
        { fullName: "Jordan Ellis", phone: "8135550101", serviceId: "srv-cut" },
        { fullName: "J", phone: "8135550101", email: "jordan@example.com", serviceId: "srv-cut" },
        { fullName: "Jordan Ellis", phone: "813", email: "jordan@example.com", serviceId: "srv-cut" }
      ]) {
        const response = await postKioskBooking(new NextRequest("https://bvrb3r.demo/api/kiosk/loc-ybor/booking", {
          method: "POST",
          body: JSON.stringify(payload)
        }), { params: Promise.resolve({ shopId: "loc-ybor" }) });

        expect(response.status, `payload should be rejected: ${JSON.stringify(payload)}`).toBe(400);
      }
    });

    it("still requires a service", async () => {
      const response = await postKioskBooking(new NextRequest("https://bvrb3r.demo/api/kiosk/loc-ybor/booking", {
        method: "POST",
        body: JSON.stringify({ fullName: "Jordan Ellis", phone: "8135550101", email: "jordan@example.com" })
      }), { params: Promise.resolve({ shopId: "loc-ybor" }) });

      expect(response.status).toBe(400);
    });
  });

  it("returns a barber kiosk payload", async () => {
    getBarberKioskPayloadMock.mockResolvedValue({
      shop: {
        shopId: "barber-blaze",
        shopName: "Blaze King",
        subtitle: "Book your cut with this barber",
        locationLabel: "Ybor City",
        mode: "barber"
      },
      services: [{ id: "srv-cut", name: "Signature Cut", category: "Cut" }],
      barbers: [{ id: "barber-blaze", name: "Blaze King", liveStatusLabel: "Bookable", nextAvailableAt: null, acceptsWalkIns: true }],
      queue: { activeCount: 0, averageWaitMinutes: 10, kioskEntriesToday: 0 },
      defaults: { autoResetSeconds: 10, bookingMode: "next_available", appointmentSource: "barber_kiosk", allowChooseBarber: false }
    });

    const response = await getBarberKiosk(new Request("https://bvrb3r.demo/api/kiosk/barber/barber-blaze"), {
      params: Promise.resolve({ barberId: "barber-blaze" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.shop.mode).toBe("barber");
    expect(body.defaults.appointmentSource).toBe("barber_kiosk");
  });

  it("creates a barber kiosk booking through the barber kiosk route", async () => {
    createBarberKioskBookingMock.mockResolvedValue({
      appointmentId: "appt-barber-kiosk",
      confirmationCode: "BVR321",
      barberId: "barber-blaze",
      barberName: "Blaze King",
      serviceId: "srv-cut",
      serviceName: "Signature Cut",
      startsAt: "2026-03-27T14:00:00.000Z",
      shopLabel: "loc-ybor"
    });

    const response = await postBarberKioskBooking(new NextRequest("https://bvrb3r.demo/api/kiosk/barber/barber-blaze/booking", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Jordan Ellis",
        phone: "8135550101",
        email: "jordan@example.com",
        publicUsername: "jordanellis",
        serviceId: "srv-cut"
      })
    }), {
      params: Promise.resolve({ barberId: "barber-blaze" })
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(createBarberKioskBookingMock).toHaveBeenCalledWith(expect.objectContaining({
      barberId: "barber-blaze",
      serviceId: "srv-cut"
    }));
    expect(body.appointmentId).toBe("appt-barber-kiosk");
  });

  it("creates a kiosk waitlist entry and propagates queue-safe errors", async () => {
    createKioskWaitlistMock.mockRejectedValue(new KioskServiceError("No live queue lane is available.", 409));

    const response = await postKioskWaitlist(new NextRequest("https://bvrb3r.demo/api/kiosk/loc-ybor/waitlist", {
      method: "POST",
      body: JSON.stringify({
        fullName: "Jordan Ellis",
        phone: "8135550101",
        idempotencyKey: "kiosk-waitlist-jordan-ellis"
      })
    }), {
      params: Promise.resolve({ shopId: "loc-ybor" })
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/queue lane/i);
  });

  it("refuses to serve a shop kiosk whose owner has not set a PIN", async () => {
    getKioskSettingsStatusMock.mockResolvedValue({ scope: "shop", targetReference: "loc-ybor", enabled: true, pinSet: false });

    const response = await getKiosk(new NextRequest("https://bvrb3r.demo/api/kiosk/loc-ybor"), {
      params: Promise.resolve({ shopId: "loc-ybor" })
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/kiosk pin/i);
    expect(getKioskPayloadMock).not.toHaveBeenCalled();
  });

  it("refuses shop kiosk bookings and waitlist joins when the kiosk is disabled", async () => {
    getKioskSettingsStatusMock.mockResolvedValue({ scope: "shop", targetReference: "loc-ybor", enabled: false, pinSet: true });

    const bookingResponse = await postKioskBooking(new NextRequest("https://bvrb3r.demo/api/kiosk/loc-ybor/booking", {
      method: "POST",
      body: JSON.stringify({ fullName: "Jordan Ellis", phone: "8135550101", email: "jordan@example.com", publicUsername: "jordanellis", serviceId: "srv-cut" })
    }), { params: Promise.resolve({ shopId: "loc-ybor" }) });
    const waitlistResponse = await postKioskWaitlist(new NextRequest("https://bvrb3r.demo/api/kiosk/loc-ybor/waitlist", {
      method: "POST",
      body: JSON.stringify({ fullName: "Jordan Ellis", phone: "8135550101" })
    }), { params: Promise.resolve({ shopId: "loc-ybor" }) });

    expect(bookingResponse.status).toBe(403);
    expect(waitlistResponse.status).toBe(403);
    expect(createKioskBookingMock).not.toHaveBeenCalled();
    expect(createKioskWaitlistMock).not.toHaveBeenCalled();
  });

  it("refuses the barber kiosk payload and bookings until the barber sets a PIN", async () => {
    getKioskSettingsStatusMock.mockResolvedValue({ scope: "barber", targetReference: "barber-blaze", enabled: true, pinSet: false });

    const payloadResponse = await getBarberKiosk(new NextRequest("https://bvrb3r.demo/api/kiosk/barber/barber-blaze"), {
      params: Promise.resolve({ barberId: "barber-blaze" })
    });
    const bookingResponse = await postBarberKioskBooking(new NextRequest("https://bvrb3r.demo/api/kiosk/barber/barber-blaze/booking", {
      method: "POST",
      body: JSON.stringify({ fullName: "Jordan Ellis", phone: "8135550101", email: "jordan@example.com", publicUsername: "jordanellis", serviceId: "srv-cut" })
    }), { params: Promise.resolve({ barberId: "barber-blaze" }) });

    expect(payloadResponse.status).toBe(403);
    expect(bookingResponse.status).toBe(403);
    expect(getBarberKioskPayloadMock).not.toHaveBeenCalled();
    expect(createBarberKioskBookingMock).not.toHaveBeenCalled();
    expect(getKioskSettingsStatusMock).toHaveBeenCalledWith({ scope: "barber", targetReference: "barber-blaze" });
  });

  it("refuses kiosk mutations without an active device session", async () => {
    assertKioskDeviceSessionMock.mockRejectedValue(new KioskSessionError("This kiosk device has no active session. Relaunch Kiosk Mode from a staff account.", 401, "session_missing"));

    const bookingResponse = await postKioskBooking(new NextRequest("https://bvrb3r.demo/api/kiosk/loc-ybor/booking", {
      method: "POST",
      body: JSON.stringify({ fullName: "Jordan Ellis", phone: "8135550101", email: "jordan@example.com", publicUsername: "jordanellis", serviceId: "srv-cut" })
    }), { params: Promise.resolve({ shopId: "loc-ybor" }) });
    const body = await bookingResponse.json();

    expect(bookingResponse.status).toBe(401);
    expect(body.code).toBe("session_missing");
    expect(createKioskBookingMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the kiosk settings lookup itself fails", async () => {
    getKioskSettingsStatusMock.mockRejectedValue(new KioskSettingsError("Unable to load kiosk settings.", 500, "settings_lookup_failed"));

    const response = await getKiosk(new NextRequest("https://bvrb3r.demo/api/kiosk/loc-ybor"), {
      params: Promise.resolve({ shopId: "loc-ybor" })
    });

    expect(response.status).toBe(503);
    expect(getKioskPayloadMock).not.toHaveBeenCalled();
  });

  describe("local-only seeded fixture", () => {
    const originalFlag = process.env.KIOSK_LOCAL_FIXTURE;

    beforeEach(() => {
      process.env.KIOSK_LOCAL_FIXTURE = "true";
      resetKioskFixtureBookings();
      // Every real path is broken on purpose, so anything that still answers
      // proves it came from the in-memory fixture and touched nothing else.
      getKioskSettingsStatusMock.mockRejectedValue(new KioskSettingsError("Supabase unavailable.", 500, "settings_lookup_failed"));
      getKioskPayloadMock.mockRejectedValue(new Error("Supabase must not be reached."));
      getBarberKioskPayloadMock.mockRejectedValue(new Error("Supabase must not be reached."));
      createKioskBookingMock.mockRejectedValue(new Error("Supabase must not be reached."));
      createBarberKioskBookingMock.mockRejectedValue(new Error("Supabase must not be reached."));
    });

    afterEach(() => {
      if (originalFlag === undefined) {
        delete process.env.KIOSK_LOCAL_FIXTURE;
      } else {
        process.env.KIOSK_LOCAL_FIXTURE = originalFlag;
      }
    });

    it("serves the seeded shop kiosk payload without Supabase or the launch gate", async () => {
      const response = await getKiosk(new NextRequest(`https://bvrb3r.demo/api/kiosk/${KIOSK_FIXTURE_SHOP_ID}`), {
        params: Promise.resolve({ shopId: KIOSK_FIXTURE_SHOP_ID })
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.shop.mode).toBe("shop");
      expect(body.services.length).toBeGreaterThan(0);
      expect(getKioskPayloadMock).not.toHaveBeenCalled();
      expect(getKioskSettingsStatusMock).not.toHaveBeenCalled();
    });

    it("serves the seeded barber kiosk payload", async () => {
      const response = await getBarberKiosk(new NextRequest(`https://bvrb3r.demo/api/kiosk/barber/${KIOSK_FIXTURE_BARBER_ID}`), {
        params: Promise.resolve({ barberId: KIOSK_FIXTURE_BARBER_ID })
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.shop.mode).toBe("barber");
      expect(getBarberKioskPayloadMock).not.toHaveBeenCalled();
    });

    it("books against the fixture in memory while still validating the payload", async () => {
      const rejected = await postKioskBooking(new NextRequest(`https://bvrb3r.demo/api/kiosk/${KIOSK_FIXTURE_SHOP_ID}/booking`, {
        method: "POST",
        body: JSON.stringify({ fullName: "J" })
      }), { params: Promise.resolve({ shopId: KIOSK_FIXTURE_SHOP_ID }) });

      const accepted = await postKioskBooking(new NextRequest(`https://bvrb3r.demo/api/kiosk/${KIOSK_FIXTURE_SHOP_ID}/booking`, {
        method: "POST",
        body: JSON.stringify({
          fullName: "Jordan Ellis",
          phone: "8135550101",
          email: "jordan@example.com",
          publicUsername: "jordanellis",
          serviceId: "kiosk-fixture-srv-signature"
        })
      }), { params: Promise.resolve({ shopId: KIOSK_FIXTURE_SHOP_ID }) });
      const body = await accepted.json();

      expect(rejected.status).toBe(400);
      expect(accepted.status).toBe(201);
      expect(body.confirmationCode).toMatch(/^LOCAL/);
      expect(createKioskBookingMock).not.toHaveBeenCalled();
      expect(assertKioskDeviceSessionMock).not.toHaveBeenCalled();
    });

    it("books against the seeded barber kiosk in memory", async () => {
      const response = await postBarberKioskBooking(new NextRequest(`https://bvrb3r.demo/api/kiosk/barber/${KIOSK_FIXTURE_BARBER_ID}/booking`, {
        method: "POST",
        body: JSON.stringify({
          fullName: "Jordan Ellis",
          phone: "8135550101",
          email: "jordan@example.com",
          publicUsername: "jordanellis",
          serviceId: "kiosk-fixture-srv-fade"
        })
      }), { params: Promise.resolve({ barberId: KIOSK_FIXTURE_BARBER_ID }) });
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.barberId).toBe(KIOSK_FIXTURE_BARBER_ID);
      expect(createBarberKioskBookingMock).not.toHaveBeenCalled();
    });

    it("verifies the staff exit against the fixture PIN only", async () => {
      const good = await postVerifyPin(new NextRequest("https://bvrb3r.demo/api/kiosk/verify-pin", {
        method: "POST",
        body: JSON.stringify({ scope: "shop", targetReference: KIOSK_FIXTURE_SHOP_ID, pin: KIOSK_FIXTURE_PIN })
      }));
      const bad = await postVerifyPin(new NextRequest("https://bvrb3r.demo/api/kiosk/verify-pin", {
        method: "POST",
        body: JSON.stringify({ scope: "shop", targetReference: KIOSK_FIXTURE_SHOP_ID, pin: "0000" })
      }));

      expect(good.status).toBe(200);
      expect((await good.json()).ok).toBe(true);
      expect(bad.status).toBe(401);
    });

    it("leaves real shops and barbers behind the launch gate while the flag is on", async () => {
      const shopResponse = await getKiosk(new NextRequest("https://bvrb3r.demo/api/kiosk/loc-ybor"), {
        params: Promise.resolve({ shopId: "loc-ybor" })
      });
      const barberResponse = await getBarberKiosk(new NextRequest("https://bvrb3r.demo/api/kiosk/barber/barber-blaze"), {
        params: Promise.resolve({ barberId: "barber-blaze" })
      });

      expect(shopResponse.status).toBe(503);
      expect(barberResponse.status).toBe(503);
      expect(getKioskSettingsStatusMock).toHaveBeenCalledWith({ scope: "shop", targetReference: "loc-ybor" });
      expect(getKioskPayloadMock).not.toHaveBeenCalled();
    });
  });
});
