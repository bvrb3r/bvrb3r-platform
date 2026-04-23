import { render, screen } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useClientAiSummaryQueryMock,
  useTrackAiRecommendationMutationMock,
  useClientHomeQueryMock,
  useClientBookingsQueryMock,
  useBarberProfileQueryMock,
  useClientMembershipQueryMock,
  useClientPointsBalanceQueryMock,
  useClientReferralSummaryMock,
  usePaymentMethodsQueryMock,
  useMarketplaceAnalyticsMutationMock
} = vi.hoisted(() => ({
  useClientAiSummaryQueryMock: vi.fn(),
  useTrackAiRecommendationMutationMock: vi.fn(),
  useClientHomeQueryMock: vi.fn(),
  useClientBookingsQueryMock: vi.fn(),
  useBarberProfileQueryMock: vi.fn(),
  useClientMembershipQueryMock: vi.fn(),
  useClientPointsBalanceQueryMock: vi.fn(),
  useClientReferralSummaryMock: vi.fn(),
  usePaymentMethodsQueryMock: vi.fn(),
  useMarketplaceAnalyticsMutationMock: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    onClick,
    href,
    ...props
  }: ComponentProps<"a"> & {
    children?: ReactNode;
    onClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      {...props}
      href={typeof href === "string" ? href : "#"}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  )
}));

vi.mock("@/lib/booking/client", () => ({
  useClientHomeQuery: useClientHomeQueryMock,
  useClientBookingsQuery: useClientBookingsQueryMock,
  useBarberProfileQuery: useBarberProfileQueryMock,
  useClientMembershipQuery: useClientMembershipQueryMock,
  useClientPointsBalanceQuery: useClientPointsBalanceQueryMock
}));

vi.mock("@/lib/engagement/client", () => ({
  useClientReferralSummary: useClientReferralSummaryMock
}));

vi.mock("@/lib/ai/client", () => ({
  useClientAiSummaryQuery: useClientAiSummaryQueryMock,
  useTrackAiRecommendationMutation: useTrackAiRecommendationMutationMock
}));

vi.mock("@/lib/payments/client", () => ({
  usePaymentMethodsQuery: usePaymentMethodsQueryMock
}));

vi.mock("@/lib/marketplace/client", () => ({
  useMarketplaceAnalyticsMutation: useMarketplaceAnalyticsMutationMock
}));

import { ClientHomeScreen } from "@/components/client-experience/client-home-screen";

describe("client home screen", () => {
  beforeEach(() => {
    useClientHomeQueryMock.mockReset();
    useClientBookingsQueryMock.mockReset();
    useBarberProfileQueryMock.mockReset();
    useClientMembershipQueryMock.mockReset();
    useClientPointsBalanceQueryMock.mockReset();
    useClientReferralSummaryMock.mockReset();
    usePaymentMethodsQueryMock.mockReset();
    useMarketplaceAnalyticsMutationMock.mockReset();
    useClientAiSummaryQueryMock.mockReset();
    useTrackAiRecommendationMutationMock.mockReset();

    useClientHomeQueryMock.mockReturnValue({
      data: {
        client: {
          clientReference: "client-jordan",
          fullName: "Jordan Ellis",
          favoriteBarberReference: "barber-wave"
        },
        locationId: "loc-ybor",
        trustedBarbers: [
          {
            barberId: "barber-wave",
            username: "wave",
            barberName: "Wave Carter",
            rating: 4.9,
            reviewCount: 120,
            priceRange: [55, 70],
            priceRangeLabel: "$55 - $70",
            nextAvailableAt: "2026-04-24T15:00:00.000Z",
            availabilityLabel: "Today 3:00 PM",
            distanceMiles: 1.2,
            locationId: "loc-ybor",
            locationLabel: "Centro Ybor Flagship",
            shopName: "Centro Ybor Flagship",
            specialties: ["Precision fades"],
            mostBookedService: "Signature Precision Cut",
            mostBookedServiceId: "srv-signature",
            retentionScore: 92,
            activityScore: 128,
            badges: ["verified_identity"]
          }
        ],
        favoriteBarber: {
          barberId: "barber-wave",
          username: "wave",
          barberName: "Wave Carter",
          rating: 4.9,
          reviewCount: 120,
          priceRange: [55, 70],
          priceRangeLabel: "$55 - $70",
          nextAvailableAt: "2026-04-24T15:00:00.000Z",
          availabilityLabel: "Today 3:00 PM",
          distanceMiles: 1.2,
          locationId: "loc-ybor",
          locationLabel: "Centro Ybor Flagship",
          shopName: "Centro Ybor Flagship",
          specialties: ["Precision fades"],
          mostBookedService: "Signature Precision Cut",
          mostBookedServiceId: "srv-signature",
          retentionScore: 92,
          activityScore: 128,
          badges: ["verified_identity"]
        },
        nextAvailableChair: {
          barberId: "barber-wave",
          username: "wave",
          barberName: "Wave Carter",
          matchedFrom: "available_now",
          matchReason: "Fastest trusted chair near you.",
          appointmentTime: "2026-04-24T15:00:00.000Z",
          locationId: "loc-ybor",
          shopName: "Centro Ybor Flagship",
          priceFrom: 55,
          rating: 4.9
        }
      },
      isLoading: false,
      error: null
    });

    useClientBookingsQueryMock.mockReturnValue({
      data: {
        nextAppointment: {
          id: "appt-next",
          barberId: "barber-wave",
          serviceId: "srv-signature",
          locationId: "loc-ybor",
          status: "confirmed",
          start: "2026-04-28T14:00:00.000Z",
          depositAmount: 10,
          balanceDue: 45,
          view: {
            barber: { name: "Wave Carter" },
            service: { name: "Signature Precision Cut" },
            location: { name: "Centro Ybor Flagship" }
          }
        },
        nextAppointmentPayment: {
          outstandingBalance: 45,
          defaultPaymentMethod: {
            id: "pm-default",
            provider: "stripe",
            brand: "Visa",
            last4: "4242",
            expMonth: 12,
            expYear: 2029,
            isDefault: true,
            createdAt: "2026-04-01T00:00:00.000Z",
            label: "Visa ending in 4242"
          },
          latestBookingPayment: {
            id: "pay-1",
            appointmentId: "appt-next",
            amount: 55,
            currency: "usd",
            provider: "stripe",
            paymentStatus: "captured",
            paymentType: "booking",
            paidAt: "2026-04-20T00:00:00.000Z",
            createdAt: "2026-04-20T00:00:00.000Z"
          }
        },
        history: [
          {
            id: "appt-last",
            barberId: "barber-wave",
            serviceId: "srv-signature",
            locationId: "loc-ybor",
            start: "2026-04-20T14:00:00.000Z",
            totalAmount: 55,
            grandTotal: 55,
            view: {
              barber: { name: "Wave Carter" },
              service: { name: "Signature Precision Cut" },
              location: { name: "Centro Ybor Flagship" }
            }
          }
        ]
      },
      isLoading: false,
      error: null
    });

    useClientPointsBalanceQueryMock.mockReturnValue({
      data: {
        unlockedPoints: 120,
        pendingPoints: 10,
        promoUnlockedPoints: 40,
        earnedUnlockedPoints: 80,
        lifetimeEarned: 220,
        lifetimeRedeemed: 40,
        totalPoints: 130,
        inAppValue: 12,
        cashoutValue: 0,
        referralPendingPoints: 0,
        reservedCashoutPoints: 0,
        cashoutEligiblePoints: 0,
        updatedAt: "2026-04-20T00:00:00.000Z",
        explanation: {
          nextMilestonePoints: 200,
          pointsToNextMilestone: 80,
          progressPercent: 60,
          nextMilestoneInAppValue: 20,
          nextMilestoneCashValue: 0,
          progressLabel: "80 points to the next milestone.",
          valueAdvantageLabel: "Ready for a real booking discount.",
          unlockHint: "Complete services unlock points.",
          cashoutHint: "Cashout is not enabled for clients."
        }
      },
      isLoading: false,
      error: null
    });

    useClientReferralSummaryMock.mockReturnValue({
      data: {
        clientId: "client-jordan",
        referralCode: {
          id: "ref-code-1",
          clientId: "client-jordan",
          code: "BVRJORDAN",
          rewardPoints: 10,
          active: true,
          createdAt: "2026-04-01T00:00:00.000Z"
        },
        inviteLink: "/r/BVRJORDAN",
        shareMessage: "Share your code.",
        totals: {
          invited: 2,
          signedUp: 1,
          booked: 1,
          completed: 1,
          credited: 1,
          rewardPointsEarned: 10
        },
        recentReferrals: []
      },
      isLoading: false,
      error: null
    });

    useClientMembershipQueryMock.mockReturnValue({
      data: {
        subscription: {
          id: "sub-client-core",
          subjectType: "client",
          subjectId: "client-jordan",
          displayName: "Jordan Ellis",
          provider: "stripe_billing",
          providerSubscriptionId: "sub_123",
          providerCustomerId: "cus_123",
          providerPriceId: "price_123",
          planCode: "client_core",
          planName: "Client Core",
          planInterval: "monthly",
          unitAmount: 19,
          currency: "usd",
          subscriptionStatus: "active",
          billingState: "current",
          entitlementStatus: "active",
          updatedAt: "2026-04-20T00:00:00.000Z"
        },
        value: {
          subscriptionId: "sub-client-core",
          provider: "stripe_billing",
          providerCustomerId: "cus_123",
          planCode: "client_core",
          sourceLabel: "Membership",
          planName: "Client Core",
          subscriptionStatus: "active",
          billingState: "current",
          entitlementStatus: "active",
          valueHeadline: "Client Core is active.",
          valueMessage: "Member pricing and faster repeat booking are live on this account.",
          savingsMessage: "Use points and member pricing together when it makes sense.",
          perkLabels: ["10% member pricing", "Priority booking"],
          canSubscribe: false,
          canCancel: true
        },
        plans: [],
        activePlan: null,
        pricingAdjustment: null,
        canSubscribe: false,
        canCancel: true
      },
      isLoading: false,
      error: null
    });

    usePaymentMethodsQueryMock.mockReturnValue({
      data: {
        methods: [
          {
            id: "pm-default",
            provider: "stripe",
            brand: "Visa",
            last4: "4242",
            expMonth: 12,
            expYear: 2029,
            isDefault: true,
            createdAt: "2026-04-01T00:00:00.000Z",
            label: "Visa ending in 4242"
          }
        ]
      },
      isLoading: false
    });
    useClientAiSummaryQueryMock.mockReturnValue({
      data: {
        generatedAt: "2026-04-20T00:00:00.000Z",
        rebookingReminder: {
          recommendationId: "rebooking:client-jordan:appt-last:28",
          type: "rebooking_reminder",
          title: "Time to line up your next cut.",
          reason: "Last cut was 28 days ago. Your typical cadence is about 28 days.",
          explanation: "This reminder is based on your completed visit history with Wave Carter.",
          actionLabel: "Rebook now",
          cadenceSource: "routine",
          confidence: "strong",
          lastCompletedAt: "2026-04-20T14:00:00.000Z",
          daysSinceLastService: 28,
          typicalCadenceDays: 28,
          barberName: "Wave Carter",
          serviceName: "Signature Precision Cut",
          booking: {
            barberId: "barber-wave",
            locationId: "loc-ybor",
            serviceId: "srv-signature",
            sourceKind: "client_dashboard"
          }
        },
        availableNowSuggestions: [
          {
            recommendationId: "available-now:barber-wave:loc-ybor:2026-04-24T15:00:00.000Z",
            type: "available_now",
            title: "Open chair with Wave Carter.",
            reason: "Next real opening is in 2 hours.",
            explanation: "Fastest trusted chair near you.",
            actionLabel: "Book this chair",
            barberName: "Wave Carter",
            username: "wave",
            appointmentTime: "2026-04-24T15:00:00.000Z",
            locationId: "loc-ybor",
            shopName: "Centro Ybor Flagship",
            priceFrom: 55,
            rating: 4.9,
            distanceMiles: 1.2,
            specialties: ["Precision fades"],
            matchedFrom: "available_now",
            booking: {
              barberId: "barber-wave",
              username: "wave",
              locationId: "loc-ybor",
              appointmentTime: "2026-04-24T15:00:00.000Z",
              sourceKind: "haircut_now",
              matchedFrom: "available_now"
            }
          }
        ],
        nextLayer: {
          personalization: { status: "scaffolded", signalKeys: [], notes: [] },
          pricingSuggestions: { status: "scaffolded", signalKeys: [], notes: [] },
          churnPrediction: { status: "scaffolded", signalKeys: [], notes: [] }
        }
      },
      isLoading: false,
      error: null
    });
    useTrackAiRecommendationMutationMock.mockReturnValue({
      mutate: vi.fn()
    });

    useBarberProfileQueryMock.mockReturnValue({
      data: {
        barber: { id: "barber-wave", name: "Wave Carter" },
        profile: {
          username: "wave",
          headline: "Precision fades that hold their shape.",
          photoAccent: "#7cff00",
          specialties: ["Precision fades"]
        },
        proof: { reviewScore: 4.9 },
        shopLocations: [{ name: "Centro Ybor Flagship" }],
        bookingCtaHref: "/booking/new?barberId=barber-wave&serviceId=srv-signature"
      }
    });
    useMarketplaceAnalyticsMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
      mutate: vi.fn()
    });
  });

  it("renders the real rebook, upcoming, wallet, retention, and history loop", () => {
    render(<ClientHomeScreen isSignedInClient displayName="Jordan Ellis" />);

    expect(screen.getByRole("link", { name: "Rebook" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book the next open chair" })).toBeInTheDocument();
    expect(screen.getByText("Rebooking reminder")).toBeInTheDocument();
    expect(screen.getByText("Last cut was 28 days ago. Your typical cadence is about 28 days.")).toBeInTheDocument();
    expect(screen.getByText("Upcoming appointment")).toBeInTheDocument();
    expect(screen.getAllByText("Signature Precision Cut").length).toBeGreaterThan(0);
    expect(screen.getByText("Wallet snapshot")).toBeInTheDocument();
    expect(screen.getByText("Visa ending in 4242")).toBeInTheDocument();
    expect(screen.getByText("BVR Points and retention")).toBeInTheDocument();
    expect(screen.getByText(/120 BVR Points/)).toBeInTheDocument();
    expect(screen.getByText("Referrals 1 credited")).toBeInTheDocument();
    expect(screen.getByText("Code BVRJORDAN")).toBeInTheDocument();
    expect(screen.getByText("Client Core | current")).toBeInTheDocument();
    expect(screen.getByText("Member pricing and faster repeat booking are live on this account.")).toBeInTheDocument();
    expect(screen.getByText("Recent visits")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open full history" })).toBeInTheDocument();
  });

  it("shows clean empty states for a fresh client with no real history or retention state", () => {
    useClientHomeQueryMock.mockReturnValue({
      data: {
        client: {
          clientReference: "client-jordan",
          fullName: "Jordan Ellis",
          favoriteBarberReference: null
        },
        locationId: "loc-ybor",
        trustedBarbers: [],
        favoriteBarber: null,
        nextAvailableChair: null
      },
      isLoading: false,
      error: null
    });

    useClientBookingsQueryMock.mockReturnValue({
      data: {
        nextAppointment: null,
        nextAppointmentPayment: null,
        history: []
      },
      isLoading: false,
      error: null
    });

    useClientPointsBalanceQueryMock.mockReturnValue({
      data: {
        unlockedPoints: 0,
        pendingPoints: 0,
        promoUnlockedPoints: 0,
        earnedUnlockedPoints: 0,
        lifetimeEarned: 0,
        lifetimeRedeemed: 0,
        totalPoints: 0,
        inAppValue: 0,
        cashoutValue: 0,
        referralPendingPoints: 0,
        reservedCashoutPoints: 0,
        cashoutEligiblePoints: 0,
        updatedAt: "2026-04-20T00:00:00.000Z",
        explanation: {
          nextMilestonePoints: 100,
          pointsToNextMilestone: 100,
          progressPercent: 0,
          nextMilestoneInAppValue: 10,
          nextMilestoneCashValue: 0,
          progressLabel: "Complete a service to begin earning.",
          valueAdvantageLabel: "No rewards yet.",
          unlockHint: "Complete services unlock points.",
          cashoutHint: "Cashout is not enabled for clients."
        }
      },
      isLoading: false,
      error: null
    });
    useClientReferralSummaryMock.mockReturnValue({
      data: {
        clientId: "client-jordan",
        inviteLink: "/referrals",
        shareMessage: "Share your code.",
        totals: {
          invited: 0,
          signedUp: 0,
          booked: 0,
          completed: 0,
          credited: 0,
          rewardPointsEarned: 0
        },
        recentReferrals: []
      },
      isLoading: false,
      error: null
    });
    useClientMembershipQueryMock.mockReturnValue({
      data: {
        subscription: null,
        value: null,
        plans: [],
        activePlan: null,
        pricingAdjustment: null,
        canSubscribe: true,
        canCancel: false
      },
      isLoading: false,
      error: null
    });
    usePaymentMethodsQueryMock.mockReturnValue({
      data: { methods: [] },
      isLoading: false
    });
    useClientAiSummaryQueryMock.mockReturnValue({
      data: {
        generatedAt: "2026-04-20T00:00:00.000Z",
        rebookingReminder: null,
        availableNowSuggestions: [],
        nextLayer: {
          personalization: { status: "scaffolded", signalKeys: [], notes: [] },
          pricingSuggestions: { status: "scaffolded", signalKeys: [], notes: [] },
          churnPrediction: { status: "scaffolded", signalKeys: [], notes: [] }
        }
      },
      isLoading: false,
      error: null
    });

    useBarberProfileQueryMock.mockReturnValue({ data: null });

    render(<ClientHomeScreen isSignedInClient displayName="Jordan Ellis" />);

    expect(screen.getByText("Find your first barber, Jordan.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a barber" })).toBeInTheDocument();
    expect(screen.getByText("Nothing booked yet")).toBeInTheDocument();
    expect(screen.getByText("Retention starts after real visits close")).toBeInTheDocument();
    expect(screen.getByText("Referrals 0 credited")).toBeInTheDocument();
    expect(screen.getByText("No active membership yet")).toBeInTheDocument();
    expect(screen.getByText("No barbers are accepting bookings here yet.")).toBeInTheDocument();
    expect(screen.getByText("No past appointments")).toBeInTheDocument();
  });
});
