import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KioskServiceError } from "@/lib/kiosk/service";

const {
  getKioskPayloadMock,
  getBarberKioskPayloadMock,
  createKioskBookingMock,
  createBarberKioskBookingMock,
  createKioskWaitlistMock
} = vi.hoisted(() => ({
  getKioskPayloadMock: vi.fn(),
  getBarberKioskPayloadMock: vi.fn(),
  createKioskBookingMock: vi.fn(),
  createBarberKioskBookingMock: vi.fn(),
  createKioskWaitlistMock: vi.fn()
}));

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

describe("kiosk routes", () => {
  beforeEach(() => {
    getKioskPayloadMock.mockReset();
    getBarberKioskPayloadMock.mockReset();
    createKioskBookingMock.mockReset();
    createBarberKioskBookingMock.mockReset();
    createKioskWaitlistMock.mockReset();
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
        serviceId: "srv-cut"
      })
    }), {
      params: Promise.resolve({ shopId: "loc-ybor" })
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.confirmationCode).toBe("BVR123");
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
        phone: "8135550101"
      })
    }), {
      params: Promise.resolve({ shopId: "loc-ybor" })
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/queue lane/i);
  });
});
