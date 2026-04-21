import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveOperationConflictError, LiveOperationValidationError, type LiveAppointmentRecord } from "@/lib/operations/live-state";

const {
  getClientExperienceContextMock,
  getLiveOperationsProviderMock,
  getMarketplaceProviderMock,
  getEngagementProviderMock,
  createBookingMock,
  recordBookingCreatedMock,
  recordEventMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  getLiveOperationsProviderMock: vi.fn(),
  getMarketplaceProviderMock: vi.fn(),
  getEngagementProviderMock: vi.fn(),
  createBookingMock: vi.fn(),
  recordBookingCreatedMock: vi.fn(),
  recordEventMock: vi.fn()
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/lib/operations/live-provider", () => ({
  getLiveOperationsProvider: getLiveOperationsProviderMock
}));

vi.mock("@/lib/marketplace/provider", () => ({
  getMarketplaceProvider: getMarketplaceProviderMock
}));

vi.mock("@/lib/engagement/provider", () => ({
  getEngagementProvider: getEngagementProviderMock
}));

import { POST as postBooking } from "@/app/api/bookings/route";

const appointmentFixture: LiveAppointmentRecord = {
  id: "appt-new",
  locationId: "loc-ybor",
  barberId: "barber-blaze",
  clientId: "client-jordan",
  serviceId: "srv-signature",
  status: "confirmed",
  start: "2026-03-23T14:00:00-04:00",
  end: "2026-03-23T15:10:00-04:00",
  chair: "Chair 6",
  addOnIds: ["srv-beard"],
  depositAmount: 15,
  totalAmount: 73,
  balanceDue: 58,
  tipAmount: 0,
  note: "",
  source: "booking",
  revision: 1,
  updatedAt: "2026-03-23T13:00:00-04:00"
};

describe("bookings route", () => {
  beforeEach(() => {
    getClientExperienceContextMock.mockReset();
    getLiveOperationsProviderMock.mockReset();
    getMarketplaceProviderMock.mockReset();
    getEngagementProviderMock.mockReset();
    createBookingMock.mockReset();
    recordBookingCreatedMock.mockReset();
    recordEventMock.mockReset();

    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        id: "user-client",
        role: "client"
      },
      activeClient: {
        email: "client@bvrb3r.demo"
      },
      clientId: "client-jordan",
      isSignedInClient: true
    });
    getLiveOperationsProviderMock.mockResolvedValue({
      createBooking: createBookingMock
    });
    getMarketplaceProviderMock.mockResolvedValue({
      recordBookingCreated: recordBookingCreatedMock
    });
    getEngagementProviderMock.mockResolvedValue({
      recordEvent: recordEventMock
    });
  });

  it("rejects invalid booking payloads", async () => {
    const response = await postBooking(new NextRequest("https://bvrb3r.demo/api/bookings", {
      method: "POST",
      body: JSON.stringify({ barberId: "barber-blaze" })
    }));

    expect(response.status).toBe(400);
  });

  it("creates a booking with the client-scoped actor context", async () => {
    createBookingMock.mockResolvedValue({
      appointment: appointmentFixture
    });

    const response = await postBooking(new NextRequest("https://bvrb3r.demo/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        locationId: "loc-ybor",
        barberId: "barber-blaze",
        serviceId: "srv-signature",
        addOnIds: ["srv-beard"],
        appointmentTime: "2026-03-23T14:00:00-04:00",
        clientName: "Jordan Ellis",
        clientPhone: "(813) 555-0190",
        pointsToRedeem: 24
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.appointment.id).toBe("appt-new");
    expect(createBookingMock).toHaveBeenCalledWith(expect.objectContaining({
      locationId: "loc-ybor",
      barberId: "barber-blaze",
      serviceId: "srv-signature",
      clientId: "client-jordan",
      pointsUserId: "user-client",
      pointsToRedeem: 24,
      actorRole: "client",
      actorEmail: "client@bvrb3r.demo",
      bookingSource: "booking"
    }));
  });

  it("returns a safe validation error when a stale service selection reaches the API", async () => {
    createBookingMock.mockRejectedValue(
      new LiveOperationValidationError("Service srv-razor is not available for booking.")
    );

    const response = await postBooking(new NextRequest("https://bvrb3r.demo/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        locationId: "loc-ybor",
        barberId: "barber-blaze",
        serviceId: "srv-razor",
        addOnIds: [],
        appointmentTime: "2026-03-23T14:00:00-04:00",
        clientName: "Jordan Ellis",
        clientPhone: "(813) 555-0190"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/srv-razor/i);
    expect(body.code).toBe("invalid_booking_selection");
  });

  it("returns verification blocker details when the lane is not eligible for booking", async () => {
    createBookingMock.mockRejectedValue(
      new LiveOperationValidationError(
        "Identity verification must be approved for this barber lane.",
        "verification_blocked",
        {
          gate: "booking",
          barberId: "barber-blaze",
          locationId: "loc-ybor",
          codes: ["identity_verification_required"],
          reasons: ["Identity verification must be approved for this barber lane."],
          degraded: false
        }
      )
    );

    const response = await postBooking(new NextRequest("https://bvrb3r.demo/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        locationId: "loc-ybor",
        barberId: "barber-blaze",
        serviceId: "srv-signature",
        addOnIds: [],
        appointmentTime: "2026-03-23T14:00:00-04:00",
        clientName: "Jordan Ellis",
        clientPhone: "(813) 555-0190"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("verification_blocked");
    expect(body.details.gate).toBe("booking");
    expect(body.details.codes).toContain("identity_verification_required");
  });

  it("preserves live conflict responses for schedule collisions", async () => {
    createBookingMock.mockRejectedValue(
      new LiveOperationConflictError("The selected time is no longer available with this barber.", appointmentFixture, "schedule_conflict")
    );

    const response = await postBooking(new NextRequest("https://bvrb3r.demo/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        locationId: "loc-ybor",
        barberId: "barber-blaze",
        serviceId: "srv-signature",
        addOnIds: [],
        appointmentTime: "2026-03-23T14:00:00-04:00",
        clientName: "Jordan Ellis",
        clientPhone: "(813) 555-0190"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("schedule_conflict");
    expect(body.latestAppointment.id).toBe("appt-new");
  });
});
