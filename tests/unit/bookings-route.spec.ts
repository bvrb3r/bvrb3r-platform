import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveOperationConflictError, LiveOperationValidationError, type LiveAppointmentRecord } from "@/lib/operations/live-state";

const {
  getClientExperienceContextMock,
  getLiveOperationsProviderMock,
  getMarketplaceProviderMock,
  recordReferralBookingProgressMock,
  trackAiRecommendationMock,
  createBookingMock,
  recordBookingCreatedMock,
  queueBookingCreatedNotificationsMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  getLiveOperationsProviderMock: vi.fn(),
  getMarketplaceProviderMock: vi.fn(),
  recordReferralBookingProgressMock: vi.fn(),
  trackAiRecommendationMock: vi.fn(),
  createBookingMock: vi.fn(),
  recordBookingCreatedMock: vi.fn(),
  queueBookingCreatedNotificationsMock: vi.fn()
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

vi.mock("@/lib/referrals/service", () => ({
  recordReferralBookingProgress: recordReferralBookingProgressMock
}));

vi.mock("@/lib/ai/service", () => ({
  trackAiRecommendation: trackAiRecommendationMock
}));

vi.mock("@/lib/booking/notifications", () => ({
  queueBookingCreatedNotifications: queueBookingCreatedNotificationsMock
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
    recordReferralBookingProgressMock.mockReset();
    trackAiRecommendationMock.mockReset();
    createBookingMock.mockReset();
    recordBookingCreatedMock.mockReset();
    queueBookingCreatedNotificationsMock.mockReset();

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
    recordReferralBookingProgressMock.mockResolvedValue({ referralEvent: null });
    trackAiRecommendationMock.mockResolvedValue({ ok: true });
    queueBookingCreatedNotificationsMock.mockResolvedValue({ queued: 2, skipped: false });
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
        paymentMethodId: "pm-default",
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
      paymentMethodId: "pm-default",
      pointsToRedeem: 24,
      actorRole: "client",
      actorEmail: "client@bvrb3r.demo",
      bookingSource: "booking"
    }));
    expect(recordReferralBookingProgressMock).toHaveBeenCalledWith({
      clientId: "client-jordan",
      appointmentId: "appt-new"
    });
    expect(queueBookingCreatedNotificationsMock).toHaveBeenCalledWith(expect.objectContaining({
      appointment: appointmentFixture,
      clientName: "Jordan Ellis",
      clientEmail: "client@bvrb3r.demo",
      startsAt: appointmentFixture.start
    }));
  });

  it("keeps the booking successful when confirmation notification queueing fails", async () => {
    createBookingMock.mockResolvedValue({
      appointment: appointmentFixture
    });
    queueBookingCreatedNotificationsMock.mockRejectedValueOnce(new Error("notification write failed"));

    const response = await postBooking(new NextRequest("https://bvrb3r.demo/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        locationId: "loc-ybor",
        barberId: "barber-blaze",
        serviceId: "srv-signature",
        addOnIds: [],
        appointmentTime: "2026-03-23T14:00:00-04:00",
        clientName: "Jordan Ellis",
        clientPhone: "(813) 555-0190",
        barberName: "Blaze Reed",
        serviceName: "Signature Cut"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.appointment.id).toBe("appt-new");
    expect(queueBookingCreatedNotificationsMock).toHaveBeenCalledWith(expect.objectContaining({
      barberName: "Blaze Reed",
      serviceName: "Signature Cut"
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

  it("records an AI conversion when a booking is created from a recommendation", async () => {
    createBookingMock.mockResolvedValue({
      appointment: appointmentFixture
    });

    const response = await postBooking(new NextRequest("https://bvrb3r.demo/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        locationId: "loc-ybor",
        barberId: "barber-blaze",
        serviceId: "srv-signature",
        addOnIds: [],
        appointmentTime: "2026-03-23T14:00:00-04:00",
        clientName: "Jordan Ellis",
        clientPhone: "(813) 555-0190",
        aiRecommendationId: "rebooking:client-jordan:appt-last:28",
        aiRecommendationType: "rebooking_reminder"
      })
    }));

    expect(response.status).toBe(200);
    expect(trackAiRecommendationMock).toHaveBeenCalledWith(expect.objectContaining({
      recommendationId: "rebooking:client-jordan:appt-last:28",
      recommendationType: "rebooking_reminder",
      action: "converted",
      surface: "client_home",
      relatedIds: expect.objectContaining({
        appointmentId: "appt-new",
        barberId: "barber-blaze"
      })
    }));
  });
});
