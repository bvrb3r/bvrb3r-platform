import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserFromServerMock,
  getLiveOperationsProviderMock,
  recordBookingUpdatedPlatformEventsMock,
  readAppointmentRetentionQualificationMock,
  readQualifyingReferralEventMock,
  finalizeReferralRewardMock,
  getMarketplaceProviderMock,
  getMarketplaceActivationProviderMock,
  getMonetizationAttributionMock,
  processCompletedAppointmentPointsMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  getLiveOperationsProviderMock: vi.fn(),
  recordBookingUpdatedPlatformEventsMock: vi.fn(),
  readAppointmentRetentionQualificationMock: vi.fn(),
  readQualifyingReferralEventMock: vi.fn(),
  finalizeReferralRewardMock: vi.fn(),
  getMarketplaceProviderMock: vi.fn(),
  getMarketplaceActivationProviderMock: vi.fn(),
  getMonetizationAttributionMock: vi.fn(),
  processCompletedAppointmentPointsMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/operations/live-provider", () => ({
  getLiveOperationsProvider: getLiveOperationsProviderMock
}));

vi.mock("@/lib/core/booking-events", () => ({
  recordBookingUpdatedPlatformEvents: recordBookingUpdatedPlatformEventsMock
}));

vi.mock("@/lib/payments/service", () => ({
  readAppointmentRetentionQualification: readAppointmentRetentionQualificationMock
}));

vi.mock("@/lib/referrals/service", () => ({
  readQualifyingReferralEvent: readQualifyingReferralEventMock,
  finalizeReferralReward: finalizeReferralRewardMock
}));

vi.mock("@/lib/marketplace/provider", () => ({
  getMarketplaceProvider: getMarketplaceProviderMock
}));

vi.mock("@/lib/marketplace/activation-provider", () => ({
  getMarketplaceActivationProvider: getMarketplaceActivationProviderMock
}));

vi.mock("@/lib/marketplace/activation", () => ({
  getMonetizationAttribution: getMonetizationAttributionMock
}));

vi.mock("@/lib/points/engine", () => ({
  processCompletedAppointmentPoints: processCompletedAppointmentPointsMock
}));

import { POST as postCheckout } from "@/app/api/operations/appointments/[appointmentId]/checkout/route";

describe("operations checkout route", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    getLiveOperationsProviderMock.mockReset();
    recordBookingUpdatedPlatformEventsMock.mockReset();
    readAppointmentRetentionQualificationMock.mockReset();
    readQualifyingReferralEventMock.mockReset();
    finalizeReferralRewardMock.mockReset();
    getMarketplaceProviderMock.mockReset();
    getMarketplaceActivationProviderMock.mockReset();
    getMonetizationAttributionMock.mockReset();
    processCompletedAppointmentPointsMock.mockReset();

    getCurrentUserFromServerMock.mockResolvedValue({
      user: {
        id: "profile-owner",
        role: "owner",
        email: "owner@bvrb3r.app"
      }
    });
    getLiveOperationsProviderMock.mockResolvedValue({
      checkoutAppointment: vi.fn().mockResolvedValue({
        appointment: {
          id: "appt-live-1",
          clientId: "client-jordan",
          barberId: "barber-phillip",
          locationId: "loc-ybor",
          status: "completed",
          totalAmount: 70,
          grandTotal: 82,
          tipAmount: 12,
          completedAt: "2026-04-20T14:00:00.000Z",
          updatedAt: "2026-04-20T14:05:00.000Z",
          revision: 5
        },
        snapshot: {
          appointments: [
            {
              id: "appt-history-1",
              clientId: "client-jordan",
              status: "completed",
              completedAt: "2026-04-10T14:00:00.000Z",
              updatedAt: "2026-04-10T14:05:00.000Z"
            },
            {
              id: "appt-live-1",
              clientId: "client-jordan",
              status: "completed",
              completedAt: "2026-04-20T14:00:00.000Z",
              updatedAt: "2026-04-20T14:05:00.000Z"
            }
          ],
          clients: [
            {
              id: "client-jordan",
              phone: "8135551212"
            }
          ]
        }
      })
    });
    recordBookingUpdatedPlatformEventsMock.mockResolvedValue(undefined);
    readAppointmentRetentionQualificationMock.mockResolvedValue({
      serviceCompleted: true,
      paymentSettled: true,
      refundState: "clean",
      disputeHold: false,
      latestPaymentStatus: "captured",
      reason: "Captured booking payment recorded."
    });
    readQualifyingReferralEventMock.mockResolvedValue(null);
    finalizeReferralRewardMock.mockResolvedValue({ referralEvent: null });
    getMarketplaceProviderMock.mockResolvedValue({
      recordBookingCompleted: vi.fn().mockResolvedValue(undefined)
    });
    getMarketplaceActivationProviderMock.mockResolvedValue({
      readState: vi.fn().mockResolvedValue({}),
      recordMonetizationEvent: vi.fn().mockResolvedValue(undefined)
    });
    getMonetizationAttributionMock.mockReturnValue({});
    processCompletedAppointmentPointsMock.mockResolvedValue({
      transactions: [],
      balances: {},
      referralReward: null
    });
  });

  it("emits a booking update platform event and passes canonical retention qualification to points", async () => {
    const response = await postCheckout(
      new Request("http://localhost:3000/api/operations/appointments/appt-live-1/checkout", {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: 4,
          tipAmount: 12,
          paymentMethod: "tap_to_pay"
        })
      }) as any,
      {
        params: Promise.resolve({ appointmentId: "appt-live-1" })
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(recordBookingUpdatedPlatformEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        appointment: expect.objectContaining({ id: "appt-live-1" }),
        actorId: "profile-owner",
        actorRole: "owner",
        route: "/api/operations/appointments/[appointmentId]/checkout",
        source: "api"
      })
    );
    expect(readAppointmentRetentionQualificationMock).toHaveBeenCalledWith("appt-live-1");
    expect(processCompletedAppointmentPointsMock).toHaveBeenCalledWith(expect.objectContaining({
      appointmentId: "appt-live-1",
      clientId: "client-jordan",
      completedBookingCount: 2,
      paymentSettled: true,
      serviceCompleted: true,
      refundState: "clean",
      referralReward: null
    }));
    expect(body.appointment.id).toBe("appt-live-1");
  });

  it("finalizes a referral reward only after points issuance links a canonical ledger transaction", async () => {
    readQualifyingReferralEventMock.mockResolvedValue({
      id: "referral-event-1",
      referrerClientId: "client-referrer"
    });
    processCompletedAppointmentPointsMock.mockResolvedValue({
      transactions: [],
      balances: {},
      referralReward: {
        referralId: "referral-event-1",
        creditedTransactionId: "pts-ledger-1",
        rewardPointsIssued: 45
      }
    });

    const response = await postCheckout(
      new Request("http://localhost:3000/api/operations/appointments/appt-live-1/checkout", {
        method: "POST",
        body: JSON.stringify({
          expectedRevision: 4,
          tipAmount: 12,
          paymentMethod: "tap_to_pay"
        })
      }) as any,
      {
        params: Promise.resolve({ appointmentId: "appt-live-1" })
      }
    );

    expect(response.status).toBe(200);
    expect(processCompletedAppointmentPointsMock).toHaveBeenCalledWith(expect.objectContaining({
      referralReward: {
        referralId: "referral-event-1",
        referrerClientId: "client-referrer"
      }
    }));
    expect(finalizeReferralRewardMock).toHaveBeenCalledWith({
      referralEventId: "referral-event-1",
      appointmentId: "appt-live-1",
      creditedTransactionId: "pts-ledger-1",
      rewardPointsIssued: 45,
      occurredAt: "2026-04-20T14:00:00.000Z"
    });
  });
});
