import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return {
    ...actual,
    isSupabaseEnabled: () => false
  };
});

import { createInitialEngagementState } from "@/lib/engagement/engine";
import { createInitialMarketplaceState } from "@/lib/marketplace/engine";
import { buildMarketplaceOwnerMetrics } from "@/lib/marketplace/growth";
import type { MarketplaceRuntimeData } from "@/lib/marketplace/provider";

describe("marketplace growth", () => {
  it("builds closed-loop conversion funnel and referral metrics from persisted state", async () => {
    const runtime: MarketplaceRuntimeData = {
      state: createInitialMarketplaceState(),
      servicePopularity: [],
      rankingInputs: [],
      conversionEvents: [
        {
          id: "discover-1",
          eventType: "discovery_impression",
          barberId: "barber-wave",
          username: "wave",
          clientId: "client-jordan",
          locationId: "loc-ybor",
          sourceKind: "discovery",
          sourceReference: "wave",
          metadata: {},
          createdAt: "2026-03-25T09:00:00-04:00"
        },
        {
          id: "discover-2",
          eventType: "discovery_impression",
          barberId: "barber-blaze",
          username: "blaze",
          clientId: "client-jordan",
          locationId: "loc-ybor",
          sourceKind: "discovery",
          sourceReference: "blaze",
          metadata: {},
          createdAt: "2026-03-25T09:01:00-04:00"
        },
        {
          id: "profile-1",
          eventType: "profile_view",
          barberId: "barber-wave",
          username: "wave",
          clientId: "client-jordan",
          locationId: "loc-ybor",
          sourceKind: "public_profile",
          sourceReference: "wave",
          metadata: {},
          createdAt: "2026-03-25T09:02:00-04:00"
        },
        {
          id: "click-1",
          eventType: "booking_cta_clicked",
          barberId: "barber-wave",
          username: "wave",
          clientId: "client-jordan",
          locationId: "loc-ybor",
          sourceKind: "public_profile",
          sourceReference: "wave",
          metadata: {},
          createdAt: "2026-03-25T09:03:00-04:00"
        },
        {
          id: "created-1",
          eventType: "booking_created",
          barberId: "barber-wave",
          username: "wave",
          clientId: "client-jordan",
          appointmentId: "appt-growth-1",
          locationId: "loc-ybor",
          sourceKind: "discovery",
          sourceReference: "wave",
          metadata: {},
          createdAt: "2026-03-25T09:04:00-04:00"
        },
        {
          id: "completed-1",
          eventType: "booking_completed",
          barberId: "barber-wave",
          username: "wave",
          clientId: "client-jordan",
          appointmentId: "appt-growth-1",
          locationId: "loc-ybor",
          sourceKind: "discovery",
          sourceReference: "wave",
          metadata: {},
          createdAt: "2026-03-25T10:30:00-04:00"
        },
        {
          id: "share-1",
          eventType: "referral_shared",
          clientId: "client-jordan",
          locationId: "loc-ybor",
          sourceKind: "client_dashboard",
          sourceReference: "client-jordan",
          metadata: {},
          createdAt: "2026-03-25T10:35:00-04:00"
        }
      ],
      bookingAttributions: [
        {
          appointmentId: "appt-growth-1",
          barberId: "barber-wave",
          username: "wave",
          clientId: "client-jordan",
          clientEmail: "client@bvrb3r.demo",
          locationId: "loc-ybor",
          sourceKind: "discovery",
          createdAt: "2026-03-25T09:04:00-04:00"
        }
      ]
    };
    const engagementState = createInitialEngagementState();
    engagementState.referralEvents = [
      {
        id: "referral-growth-1",
        referralCodeId: "referral-code-jordan",
        referrerClientId: "client-jordan",
        referredClientEmail: "friend.one@example.com",
        status: "invited",
        rewardPoints: 75,
        createdAt: "2026-03-24T08:00:00-04:00"
      },
      {
        id: "referral-growth-2",
        referralCodeId: "referral-code-jordan",
        referrerClientId: "client-jordan",
        referredClientEmail: "friend.two@example.com",
        referredClientId: "client-ref-2",
        status: "signed_up",
        rewardPoints: 75,
        createdAt: "2026-03-24T09:00:00-04:00",
        signedUpAt: "2026-03-24T09:15:00-04:00"
      },
      {
        id: "referral-growth-3",
        referralCodeId: "referral-code-jordan",
        referrerClientId: "client-jordan",
        referredClientEmail: "friend.three@example.com",
        referredClientId: "client-ref-3",
        status: "booked",
        rewardPoints: 75,
        createdAt: "2026-03-24T10:00:00-04:00",
        signedUpAt: "2026-03-24T10:05:00-04:00",
        bookedAt: "2026-03-25T09:04:00-04:00"
      },
      {
        id: "referral-growth-4",
        referralCodeId: "referral-code-jordan",
        referrerClientId: "client-jordan",
        referredClientEmail: "friend.four@example.com",
        referredClientId: "client-ref-4",
        status: "credited",
        rewardPoints: 75,
        createdAt: "2026-03-24T11:00:00-04:00",
        signedUpAt: "2026-03-24T11:05:00-04:00",
        bookedAt: "2026-03-25T09:04:00-04:00",
        completedAt: "2026-03-25T10:30:00-04:00",
        creditedAt: "2026-03-25T10:31:00-04:00",
        appointmentId: "appt-growth-1",
        creditedTransactionId: "loyalty-credit-1"
      }
    ];

    const metrics = await buildMarketplaceOwnerMetrics(runtime, engagementState);

    expect(metrics.discoveryImpressions).toBe(2);
    expect(metrics.profileViews).toBe(1);
    expect(metrics.bookingClicks).toBe(1);
    expect(metrics.bookingsCreated).toBe(1);
    expect(metrics.bookingsCompleted).toBe(1);
    expect(metrics.discoveryToBookingRate).toBe(50);
    expect(metrics.profileToBookingRate).toBe(100);
    expect(metrics.clickToBookingRate).toBe(100);
    expect(metrics.referralShares).toBe(1);
    expect(metrics.referralInvites).toBe(4);
    expect(metrics.referralSignUps).toBe(3);
    expect(metrics.referralBookings).toBe(2);
    expect(metrics.referralCompleted).toBe(1);
    expect(metrics.referralCredited).toBe(1);
    expect(metrics.topSources[0]).toEqual({
      sourceKind: "discovery",
      count: 4
    });
  });
});
