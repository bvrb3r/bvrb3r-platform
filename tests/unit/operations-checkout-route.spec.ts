import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCurrentUserFromServerMock,
  getLiveOperationsProviderMock,
  recordBookingUpdatedPlatformEventsMock,
  createSupabaseAdminClientMock,
  getEngagementProviderMock,
  getMarketplaceProviderMock,
  getMarketplaceActivationProviderMock,
  getMonetizationAttributionMock,
  readActiveClientMembershipSubscriptionMock,
  processCompletedAppointmentPointsMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  getLiveOperationsProviderMock: vi.fn(),
  recordBookingUpdatedPlatformEventsMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn(),
  getEngagementProviderMock: vi.fn(),
  getMarketplaceProviderMock: vi.fn(),
  getMarketplaceActivationProviderMock: vi.fn(),
  getMonetizationAttributionMock: vi.fn(),
  readActiveClientMembershipSubscriptionMock: vi.fn(),
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

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/engagement/provider", () => ({
  getEngagementProvider: getEngagementProviderMock
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

vi.mock("@/lib/monetization/service", () => ({
  readActiveClientMembershipSubscription: readActiveClientMembershipSubscriptionMock
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
    createSupabaseAdminClientMock.mockReset();
    getEngagementProviderMock.mockReset();
    getMarketplaceProviderMock.mockReset();
    getMarketplaceActivationProviderMock.mockReset();
    getMonetizationAttributionMock.mockReset();
    readActiveClientMembershipSubscriptionMock.mockReset();
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
    createSupabaseAdminClientMock.mockReturnValue({ from: vi.fn() });
    recordBookingUpdatedPlatformEventsMock.mockResolvedValue(undefined);
    getEngagementProviderMock.mockResolvedValue({
      rewardCompletedBooking: vi.fn().mockResolvedValue(undefined)
    });
    getMarketplaceProviderMock.mockResolvedValue({
      recordBookingCompleted: vi.fn().mockResolvedValue(undefined)
    });
    getMarketplaceActivationProviderMock.mockResolvedValue({
      readState: vi.fn().mockResolvedValue({}),
      recordMonetizationEvent: vi.fn().mockResolvedValue(undefined)
    });
    getMonetizationAttributionMock.mockReturnValue({});
    readActiveClientMembershipSubscriptionMock.mockResolvedValue(null);
    processCompletedAppointmentPointsMock.mockResolvedValue(undefined);
  });

  it("emits a booking update platform event when checkout succeeds", async () => {
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
    expect(body.appointment.id).toBe("appt-live-1");
  });
});
