import { buildClientDashboardFeed, buildClientFavoriteCandidates, buildClientPrimaryBookingHref, buildQuickRebookHref } from "@/lib/client-experience/dashboard";
import type { ClientEngagementSummary } from "@/types/engagement";

function createSummary(overrides: Partial<ClientEngagementSummary> = {}): ClientEngagementSummary {
  return {
    clientId: "client-jordan",
    pointsBalance: 120,
    lifetimePoints: 340,
    tier: "vip",
    referralCredits: 2,
    completedBookings: 6,
    favoriteBarberName: "Blaze King",
    rebookingRecommendation: {
      id: "rebook-1",
      clientId: "client-jordan",
      barberId: "barber-blaze",
      serviceId: "srv-signature",
      message: "It is time to lock your next signature cut.",
      remindAt: "2026-03-28T12:00:00-04:00",
      status: "suggested",
      reason: "repeat cadence",
      createdAt: "2026-03-24T09:00:00-04:00"
    },
    intelligence: {
      clientId: "client-jordan",
      favoriteBarberId: "barber-blaze",
      favoriteLocationId: "loc-ybor",
      primaryServiceId: "srv-signature",
      lastCompletedAt: "2026-03-10T13:00:00-04:00",
      nextDueAt: "2026-03-24T13:00:00-04:00",
      averageCycleDays: 14,
      completedVisitCount: 6,
      repeatVisitCount: 5,
      activeAppointmentCount: 0,
      rebookingWindow: "due_now",
      churnRisk: "medium",
      churnScore: 61,
      reengagementEligible: true,
      loyaltySegment: "loyal",
      nextBestAction: "Rebook with Blaze this week.",
      explanation: "Your routine is at the usual two-week mark.",
      recommendationReasons: ["repeat cadence", "favorite barber", "completed history"],
      recommendedBarberId: "barber-blaze",
      recommendedLocationId: "loc-ybor",
      recommendedServiceId: "srv-signature",
      updatedAt: "2026-03-24T09:00:00-04:00"
    },
    recommendedBarbers: [
      {
        barberId: "barber-wave",
        barberName: "Wave Carter",
        username: "wave",
        nextAvailableAt: "2026-03-25T11:00:00-04:00",
        score: 88,
        reason: "Great reviews and relevant availability."
      }
    ],
    followedBarbers: [
      {
        barberId: "barber-blaze",
        barberName: "Blaze King",
        username: "blaze",
        nextAvailableAt: "2026-03-24T15:30:00-04:00",
        notifyOnAvailability: true
      }
    ],
    followSuggestions: [
      {
        barberId: "barber-wave",
        barberName: "Wave Carter",
        username: "wave",
        reason: "Trusted nearby with strong repeat behavior."
      }
    ],
    rewards: [
      {
        id: "reward-1",
        title: "Add-on credit",
        pointsRequired: 100,
        unlocked: true
      }
    ],
    referralCode: {
      id: "ref-1",
      clientId: "client-jordan",
      code: "JORDAN",
      rewardPoints: 25,
      active: true,
      createdAt: "2026-03-01T09:00:00-05:00"
    },
    recentTransactions: [],
    recentNotifications: [
      {
        id: "notif-1",
        userEmail: "client@bvrb3r.demo",
        role: "client",
        clientId: "client-jordan",
        channel: "in_app",
        type: "promotion_follow_up",
        title: "Your comeback offer is live",
        body: "Use your comeback offer on the next visit with Blaze.",
        status: "queued",
        createdAt: "2026-03-24T09:00:00-04:00"
      },
      {
        id: "notif-2",
        userEmail: "client@bvrb3r.demo",
        role: "client",
        clientId: "client-jordan",
        channel: "in_app",
        type: "rebooking_reminder",
        title: "You are due for your next cut",
        body: "Blaze has time this week if you want the same service again.",
        status: "queued",
        createdAt: "2026-03-24T09:05:00-04:00"
      }
    ],
    recentEvents: [],
    automation: {
      eligibleAutomationCount: 2,
      pendingRuns: 1,
      processingRuns: 0,
      retryScheduledRuns: 0,
      completedRuns: 1,
      failedRuns: 0,
      blockedRuns: 0,
      nextAutomation: undefined,
      recentRuns: []
    },
    ...overrides
  };
}

describe("client dashboard feed helpers", () => {
  it("builds one-tap rebook links with canonical service and time prefills", () => {
    const href = buildQuickRebookHref({
      barberId: "barber-blaze",
      username: "blaze",
      locationId: "loc-ybor",
      serviceId: "srv-signature",
      appointmentTime: "2026-03-24T15:30:00-04:00"
    });

    expect(href).toBe("/booking/new?barberId=barber-blaze&barber=blaze&locationId=loc-ybor&serviceId=srv-signature&source=client_dashboard&appointmentTime=2026-03-24T15%3A30%3A00-04%3A00");
  });

  it("builds a personalized feed using rebooking, offers, loyalty, and availability signals", () => {
    const items = buildClientDashboardFeed({
      home: {
        locationId: "loc-ybor",
        favoriteBarber: {
          barberId: "barber-blaze",
          username: "blaze",
          barberName: "Blaze King",
          rating: 4.9,
          nextAvailableAt: "2026-03-24T15:30:00-04:00",
          shopName: "BVRB3R Ybor",
          specialties: ["Fades"],
          mostBookedService: "Signature cut"
        },
        trustedBarbers: [],
        nextAvailableChair: {
          barberId: "barber-blaze",
          username: "blaze",
          barberName: "Blaze King",
          locationId: "loc-ybor",
          appointmentTime: "2026-03-24T15:30:00-04:00",
          shopName: "BVRB3R Ybor",
          matchReason: "Favorite barber opening",
          matchedFrom: "favorite_barber"
        }
      },
      bookings: {
        favoriteBarber: {
          barber: { id: "barber-blaze", name: "Blaze King" },
          profile: { username: "blaze", headline: "Precision fades all day.", specialties: ["Fades", "Beards"] },
          nextAvailableAt: "2026-03-24T15:30:00-04:00",
          shopLocations: [{ id: "loc-ybor", name: "BVRB3R Ybor", neighborhood: "Ybor" }],
          mostBookedService: {
            service: { id: "srv-signature", name: "Signature cut" }
          }
        },
        nextAppointment: null,
        history: [
          {
            id: "appt-1",
            barberId: "barber-blaze",
            serviceId: "srv-signature",
            locationId: "loc-ybor",
            start: "2026-03-10T13:00:00-04:00",
            totalAmount: 60,
            grandTotal: 60,
            balanceDue: 0,
            view: {
              barber: { name: "Blaze King" },
              service: { name: "Signature cut" },
              location: { name: "BVRB3R Ybor" }
            }
          }
        ],
        routine: {
          averageCycleDays: 14,
          serviceReference: "srv-signature",
          nextSuggestedAt: "2026-03-24T13:00:00-04:00"
        }
      },
      summary: createSummary()
    });

    expect(items.map((item) => item.kind)).toEqual(expect.arrayContaining(["rebook", "favorite", "availability", "promotion", "loyalty"]));
    expect(items[0]?.href).toContain("serviceId=srv-signature");
    expect(items[0]?.href).toContain("barberId=barber-blaze");
  });

  it("builds favorite candidates without repeating the active favorite barber", () => {
    const candidates = buildClientFavoriteCandidates({
      home: {
        locationId: "loc-ybor",
        trustedBarbers: [
          {
            barberId: "barber-blaze",
            username: "blaze",
            barberName: "Blaze King",
            rating: 4.9,
            nextAvailableAt: "2026-03-24T15:30:00-04:00",
            shopName: "BVRB3R Ybor",
            specialties: ["Fades"],
            mostBookedService: "Signature cut"
          },
          {
            barberId: "barber-wave",
            username: "wave",
            barberName: "Wave Carter",
            rating: 4.8,
            nextAvailableAt: "2026-03-25T11:00:00-04:00",
            shopName: "BVRB3R Ybor",
            specialties: ["Beards"],
            mostBookedService: "Premium grooming"
          }
        ]
      },
      summary: createSummary(),
      favoriteBarberId: "barber-blaze"
    });

    expect(candidates.some((candidate) => candidate.barberId === "barber-blaze")).toBe(false);
    expect(candidates[0]?.barberId).toBe("barber-wave");
    expect(candidates[0]?.bookingHref).toContain("serviceId=srv-signature");
  });

  it("surfaces referral and membership value items when those client-value rails are available", () => {
    const items = buildClientDashboardFeed({
      home: {
        locationId: "loc-ybor",
        trustedBarbers: []
      },
      bookings: {
        membershipValue: {
          sourceLabel: "BVRB3R Ybor",
          planName: "Shop Core",
          subscriptionStatus: "active",
          billingState: "current",
          entitlementStatus: "enabled",
          valueHeadline: "BVRB3R Ybor is membership-backed",
          valueMessage: "Your regular shop is already organized around membership value.",
          savingsMessage: "2 rewards can be claimed right now.",
          renewalMessage: "Current period ends Apr 12.",
          perkLabels: ["2 rewards ready", "25 points active"]
        }
      },
      summary: createSummary({
        pointsBalance: 0,
        referralCredits: 0,
        recentNotifications: [],
        intelligence: {
          ...createSummary().intelligence,
          rebookingWindow: "building"
        }
      }),
      referrals: {
        clientId: "client-jordan",
        referralCode: {
          id: "ref-1",
          clientId: "client-jordan",
          code: "JORDAN",
          rewardPoints: 25,
          active: true,
          createdAt: "2026-03-01T09:00:00-05:00"
        },
        inviteLink: "https://bvrb3r.test/ref/JORDAN",
        shareMessage: "Invite someone into BVRB3R.",
        totals: {
          invited: 1,
          signedUp: 1,
          booked: 1,
          completed: 1,
          credited: 1,
          rewardPointsEarned: 25
        },
        recentReferrals: []
      }
    });

    expect(items.map((item) => item.kind)).toEqual(expect.arrayContaining(["referral", "membership"]));
    expect(items.find((item) => item.kind === "referral")?.href).toBe("/referrals");
    expect(items.find((item) => item.kind === "membership")?.badge).toBe("active");
  });

  it("keeps the hero booking CTA inside the booking flow even when the feed leads with non-booking value cards", () => {
    const href = buildClientPrimaryBookingHref({
      home: {
        locationId: "loc-ybor",
        trustedBarbers: []
      },
      bookings: {},
      summary: createSummary({
        intelligence: {
          ...createSummary().intelligence,
          favoriteBarberId: undefined,
          primaryServiceId: undefined,
          rebookingWindow: "building"
        },
        favoriteBarberName: undefined,
        pointsBalance: 0,
        referralCredits: 0,
        recentNotifications: []
      })
    });

    expect(href).toBe("/booking/new?mode=next-available");
  });

  it("uses the next available chair as the hero booking CTA when there is no preferred barber yet", () => {
    const href = buildClientPrimaryBookingHref({
      home: {
        locationId: "loc-ybor",
        trustedBarbers: [],
        nextAvailableChair: {
          barberId: "barber-wave",
          username: "wave",
          barberName: "Wave Carter",
          locationId: "loc-ybor",
          appointmentTime: "2026-03-25T11:00:00-04:00",
          shopName: "BVRB3R Ybor",
          matchReason: "Fastest nearby opening",
          matchedFrom: "available_now"
        }
      },
      bookings: {},
      summary: createSummary({
        intelligence: {
          ...createSummary().intelligence,
          favoriteBarberId: undefined,
          primaryServiceId: undefined,
          rebookingWindow: "building"
        },
        favoriteBarberName: undefined
      })
    });

    expect(href).toContain("barberId=barber-wave");
    expect(href).toContain("appointmentTime=2026-03-25T11%3A00%3A00-04%3A00");
  });
});
