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
  recordBookingCreatedPlatformEventMock,
  queueBookingCreatedNotificationsMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  getLiveOperationsProviderMock: vi.fn(),
  getMarketplaceProviderMock: vi.fn(),
  recordReferralBookingProgressMock: vi.fn(),
  trackAiRecommendationMock: vi.fn(),
  createBookingMock: vi.fn(),
  recordBookingCreatedMock: vi.fn(),
  recordBookingCreatedPlatformEventMock: vi.fn(),
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

vi.mock("@/lib/core/booking-events", () => ({
  recordBookingCreatedPlatformEvent: recordBookingCreatedPlatformEventMock
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
    recordBookingCreatedPlatformEventMock.mockReset();
    queueBookingCreatedNotificationsMock.mockReset();

    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        id: "11111111-1111-4111-8111-111111111111",
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
    recordBookingCreatedPlatformEventMock.mockResolvedValue({ ok: true });
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
      pointsUserId: "11111111-1111-4111-8111-111111111111",
      paymentMethodId: "pm-default",
      pointsToRedeem: 24,
      actorRole: "client",
      actorEmail: "client@bvrb3r.demo",
      actorProfileId: "11111111-1111-4111-8111-111111111111",
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

  it("creates a guest booking with submitted email and no signed-in client actor fields", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        id: "guest-user",
        role: "client_user",
        email: "guest@bvrb3r.local"
      },
      activeClient: null,
      clientId: "",
      isSignedInClient: false,
      isGuest: true
    });
    createBookingMock.mockResolvedValue({
      appointment: {
        ...appointmentFixture,
        id: "appt-guest",
        confirmationCode: "BVRGUEST1",
        clientId: "guest-client-row"
      }
    });

    const response = await postBooking(new NextRequest("https://bvrb3r.demo/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        locationId: "loc-ybor",
        barberId: "barber-blaze",
        serviceId: "srv-signature",
        addOnIds: [],
        appointmentTime: "2026-03-23T14:00:00-04:00",
        clientName: "Guest Booker",
        clientPhone: "(813) 555-0199",
        clientEmail: " Guest@Example.COM ",
        sourceKind: "public_profile",
        barberUsername: "blazereed"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.appointment.confirmationCode).toBe("BVRGUEST1");
    expect(createBookingMock).toHaveBeenCalledWith(expect.objectContaining({
      clientId: undefined,
      pointsUserId: undefined,
      actorRole: "client",
      actorEmail: "guest@example.com",
      actorProfileId: undefined,
      createdBy: undefined,
      deferPaymentCollection: true,
      bookingSource: "public_profile"
    }));
    expect(queueBookingCreatedNotificationsMock).toHaveBeenCalledWith(expect.objectContaining({
      clientName: "Guest Booker",
      clientEmail: "guest@example.com"
    }));
    expect(recordBookingCreatedMock).toHaveBeenCalledWith(expect.objectContaining({
      appointmentId: "appt-guest",
      clientId: undefined,
      clientEmail: "guest@example.com",
      sourceKind: "public_profile"
    }));
    expect(recordReferralBookingProgressMock).not.toHaveBeenCalled();
  });

  it("rejects guest booking requests without a valid email", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        id: "guest-user",
        role: "client_user",
        email: "guest@bvrb3r.local"
      },
      activeClient: null,
      clientId: "",
      isSignedInClient: false,
      isGuest: true
    });

    const response = await postBooking(new NextRequest("https://bvrb3r.demo/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        locationId: "loc-ybor",
        barberId: "barber-blaze",
        serviceId: "srv-signature",
        addOnIds: [],
        appointmentTime: "2026-03-23T14:00:00-04:00",
        clientName: "Guest Booker",
        clientPhone: "(813) 555-0199"
      })
    }));

    expect(response.status).toBe(400);
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("blocks signed-in non-client sessions instead of silently booking as a guest", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        id: "22222222-2222-4222-8222-222222222222",
        role: "barber_user",
        email: "barber@bvrb3r.demo"
      },
      activeClient: null,
      clientId: "",
      isSignedInClient: false,
      isGuest: false
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
        clientEmail: "jordan@example.com"
      })
    }));

    expect(response.status).toBe(403);
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("preserves Culture booking attribution without using marketplace source enums", async () => {
    createBookingMock.mockResolvedValue({
      appointment: {
        ...appointmentFixture,
        id: "appt-culture"
      }
    });

    const cultureAttribution = {
      source: "culture",
      culturePostId: "post-culture-1",
      cultureAuthorId: "author-profile-1",
      cultureSurface: "client_culture",
      barberId: "barber-blaze",
      serviceId: "srv-signature",
      locationId: "loc-ybor",
      targetRoute: "/booking/new?source=culture&culturePostId=post-culture-1&barberId=barber-blaze",
      cta: "book_barber"
    };

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
        cultureAttribution
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.appointment.id).toBe("appt-culture");
    expect(createBookingMock).toHaveBeenCalledWith(expect.objectContaining({
      bookingSource: "culture"
    }));
    expect(recordBookingCreatedPlatformEventMock).toHaveBeenCalledWith(expect.objectContaining({
      appointment: expect.objectContaining({
        id: "appt-culture",
        barberId: "barber-blaze",
        serviceId: "srv-signature",
        locationId: "loc-ybor"
      }),
      context: expect.objectContaining({
        cultureAttribution
      })
    }));
    expect(recordBookingCreatedMock).not.toHaveBeenCalled();
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

  it("hides internal shop-lane verification language from client booking errors", async () => {
    createBookingMock.mockRejectedValue(
      new LiveOperationValidationError(
        "Business verification must be approved for this shop lane.",
        "verification_blocked",
        {
          gate: "shop_activation",
          barberId: "barber-blaze",
          locationId: "loc-ybor",
          codes: ["business_verification_required"],
          reasons: ["Business verification must be approved for this shop lane."],
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
    expect(body.error).toBe("This provider is not available for booking yet.");
    expect(body.details.reasons).toEqual(["This provider is not available for booking yet."]);
    expect(JSON.stringify(body)).not.toContain("Business verification must be approved for this shop lane.");
  });

  it("does not expose independent barber pseudo-location ids in client booking errors", async () => {
    createBookingMock.mockRejectedValue(
      new LiveOperationValidationError(
        "Shop independent-barber-43b3cda2 was not found.",
        "invalid_resource_reference"
      )
    );

    const response = await postBooking(new NextRequest("https://bvrb3r.demo/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        locationId: "independent-barber-43b3cda2",
        barberId: "barber-phillip",
        serviceId: "srv-test-cut",
        addOnIds: [],
        appointmentTime: "2026-03-23T14:00:00-04:00",
        clientName: "Jordan Ellis",
        clientPhone: "(813) 555-0190"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("This provider is not available for booking yet.");
    expect(JSON.stringify(body)).not.toContain("independent-barber-43b3cda2");
  });

  it("does not expose public barber reference pseudo ids in client booking errors", async () => {
    createBookingMock.mockRejectedValue(
      new LiveOperationValidationError(
        "Barber barber-43b3cda2 was not found.",
        "invalid_resource_reference"
      )
    );

    const response = await postBooking(new NextRequest("https://bvrb3r.demo/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        locationId: "independent-barber-43b3cda2",
        barberId: "barber-43b3cda2",
        serviceId: "srv-test-cut",
        addOnIds: [],
        appointmentTime: "2026-03-23T14:00:00-04:00",
        clientName: "Jordan Ellis",
        clientPhone: "(813) 555-0190"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("This barber is not available for booking yet.");
    expect(JSON.stringify(body)).not.toContain("barber-43b3cda2");
  });

  it("does not expose public client reference pseudo ids in client booking errors", async () => {
    createBookingMock.mockRejectedValue(
      new LiveOperationValidationError(
        "Client client-1fd26b88 was not found.",
        "invalid_resource_reference"
      )
    );

    const response = await postBooking(new NextRequest("https://bvrb3r.demo/api/bookings", {
      method: "POST",
      body: JSON.stringify({
        locationId: "independent-barber-43b3cda2",
        barberId: "barber-43b3cda2",
        serviceId: "srv-test-cut",
        addOnIds: [],
        appointmentTime: "2026-03-23T14:00:00-04:00",
        clientName: "Jordan Ellis",
        clientPhone: "(813) 555-0190"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("We could not book this appointment. Please try again.");
    expect(JSON.stringify(body)).not.toContain("client-1fd26b88");
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

  it("returns a safe stage-specific error for unexpected booking transaction failures", async () => {
    createBookingMock.mockRejectedValue(new Error("database write failed with internal details"));

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

    expect(response.status).toBe(500);
    expect(body.error).toBe("We could not book this appointment. Please try again.");
    expect(body.code).toBe("booking_processing_failed");
    expect(JSON.stringify(body)).not.toContain("database write failed");
  });

  it("returns and logs the exact safe failed booking stage when transaction diagnostics are attached", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("null value in column location_id violates not-null constraint");
    (error as {
      bookingTransaction?: Record<string, unknown>;
    }).bookingTransaction = {
      stage: "appointment_insert_failed",
      safeMessage: "Appointment could not be saved.",
      canonicalClientUuidPresent: true,
      canonicalBarberUuidPresent: true,
      canonicalServiceUuidPresent: true,
      canonicalLocationUuidPresent: true,
      paymentMethodResolved: false,
      stripePaymentIntentIdPresent: false,
      appointmentInsertStarted: true,
      appointmentInsertSucceeded: false
    };
    createBookingMock.mockRejectedValue(error);

    try {
      const response = await postBooking(new NextRequest("https://bvrb3r.demo/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          locationId: "independent-barber-43b3cda2",
          barberId: "barber-43b3cda2",
          serviceId: "srv-test-cut",
          addOnIds: [],
          appointmentTime: "2026-03-23T14:00:00-04:00",
          clientName: "Jordan Ellis",
          clientPhone: "(813) 555-0190"
        })
      }));
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe("Appointment could not be saved.");
      expect(body.code).toBe("booking_processing_failed");
      expect(consoleSpy).toHaveBeenCalledWith("[bookings] booking_transaction_stage_failed", expect.objectContaining({
        stage: "appointment_insert_failed",
        safeMessage: "Appointment could not be saved.",
        canonicalClientUuidPresent: true,
        canonicalBarberUuidPresent: true,
        canonicalServiceUuidPresent: true,
        canonicalLocationUuidPresent: true,
        paymentMethodResolved: false,
        stripePaymentIntentIdPresent: false,
        appointmentInsertStarted: true,
        appointmentInsertSucceeded: false
      }));
      expect(JSON.stringify(body)).not.toContain("43b3cda2");
      expect(JSON.stringify(body)).not.toContain("location_id");
    } finally {
      consoleSpy.mockRestore();
    }
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
