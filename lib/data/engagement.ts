import type {
  BarberFollowRecord,
  EngagementEventRecord,
  EngagementNotificationRecord,
  GrowthRecommendationRecord,
  LoyaltyAccountRecord,
  LoyaltyRewardRuleRecord,
  LoyaltyTransactionRecord,
  NotificationPreferenceRecord,
  RankingSnapshotRecord,
  ReferralCodeRecord,
  ReferralEventRecord,
  RebookingCycleRecord,
  RebookingRecommendationRecord,
  ReputationScoreRecord
} from "@/types/engagement";

export const demoLoyaltyAccounts: LoyaltyAccountRecord[] = [
  { id: "loyalty-jordan", clientId: "client-jordan", pointsBalance: 220, lifetimePoints: 540, tier: "vip", referralCredits: 2, updatedAt: "2026-03-08T18:15:00-05:00" },
  { id: "loyalty-nova", clientId: "client-nova", pointsBalance: 90, lifetimePoints: 170, tier: "core", referralCredits: 1, updatedAt: "2026-03-07T19:10:00-05:00" },
  { id: "loyalty-ava", clientId: "client-ava", pointsBalance: 145, lifetimePoints: 260, tier: "vip", referralCredits: 0, updatedAt: "2026-03-06T14:20:00-05:00" },
  { id: "loyalty-malik", clientId: "client-malik", pointsBalance: 65, lifetimePoints: 95, tier: "core", referralCredits: 0, updatedAt: "2026-03-05T11:00:00-05:00" }
];

export const demoLoyaltyTransactions: LoyaltyTransactionRecord[] = [
  { id: "loyalty-txn-1", clientId: "client-jordan", reason: "completed_booking", pointsDelta: 25, label: "Completed premium visit", referenceId: "appt-1", createdAt: "2026-03-08T11:20:00-05:00" },
  { id: "loyalty-txn-2", clientId: "client-jordan", reason: "review", pointsDelta: 15, label: "Left a 5-star review", referenceId: "review-1", createdAt: "2026-03-06T10:00:00-05:00" },
  { id: "loyalty-txn-3", clientId: "client-jordan", reason: "referral", pointsDelta: 75, label: "Referral credited", referenceId: "referral-event-1", createdAt: "2026-03-04T13:30:00-05:00" },
  { id: "loyalty-txn-4", clientId: "client-nova", reason: "completed_booking", pointsDelta: 25, label: "Completed executive shave", referenceId: "appt-4", createdAt: "2026-03-08T09:45:00-05:00" },
  { id: "loyalty-txn-5", clientId: "client-ava", reason: "reward_redemption", pointsDelta: -80, label: "Redeemed treatment upgrade", referenceId: "reward-vip-upgrade", createdAt: "2026-03-02T16:10:00-05:00" },
  { id: "loyalty-txn-6", clientId: "client-malik", reason: "completed_booking", pointsDelta: 25, label: "Completed design session", referenceId: "appt-5", createdAt: "2026-03-01T13:40:00-05:00" }
];

export const demoLoyaltyRewardRules: LoyaltyRewardRuleRecord[] = [
  {
    id: "reward-rule-repeat-third",
    ruleCode: "repeat_third_visit_bonus",
    title: "Repeat third visit bonus",
    triggerEvent: "completed_booking",
    active: true,
    thresholdCount: 3,
    everyNthCount: 3,
    requiresActiveMembership: false,
    pointsDelta: 40,
    metadata: {
      reason: "every third completed visit unlocks a loyalty bonus"
    },
    updatedAt: "2026-03-08T12:00:00-05:00"
  },
  {
    id: "reward-rule-comeback",
    ruleCode: "comeback_bonus",
    title: "Comeback booking bonus",
    triggerEvent: "completed_booking",
    active: true,
    thresholdCount: 1,
    minDaysSinceLastCompletion: 35,
    requiresActiveMembership: false,
    pointsDelta: 30,
    metadata: {
      reason: "returning after a long gap earns a reactivation reward"
    },
    updatedAt: "2026-03-08T12:00:00-05:00"
  },
  {
    id: "reward-rule-member-completion",
    ruleCode: "member_completion_bonus",
    title: "Membership completion bonus",
    triggerEvent: "completed_booking",
    active: true,
    thresholdCount: 1,
    requiresActiveMembership: true,
    pointsDelta: 15,
    metadata: {
      reason: "active members stack bonus points on completed visits"
    },
    updatedAt: "2026-03-08T12:00:00-05:00"
  }
];

export const demoReferralCodes: ReferralCodeRecord[] = [
  { id: "referral-code-jordan", clientId: "client-jordan", code: "JORDANVIP", rewardPoints: 75, active: true, createdAt: "2026-02-01T09:00:00-05:00" },
  { id: "referral-code-nova", clientId: "client-nova", code: "NOVAEDGE", rewardPoints: 50, active: true, createdAt: "2026-02-14T09:00:00-05:00" },
  { id: "referral-code-ava", clientId: "client-ava", code: "AVALUXE", rewardPoints: 50, active: true, createdAt: "2026-02-20T09:00:00-05:00" }
];

export const demoReferralEvents: ReferralEventRecord[] = [
  {
    id: "referral-event-1",
    referralCodeId: "referral-code-jordan",
    referrerClientId: "client-jordan",
    referredClientEmail: "friend.one@example.com",
    referredClientId: "client-cam",
    status: "credited",
    rewardPoints: 75,
    createdAt: "2026-03-03T10:15:00-05:00",
    signedUpAt: "2026-03-03T12:30:00-05:00",
    bookedAt: "2026-03-04T09:00:00-05:00",
    completedAt: "2026-03-04T13:30:00-05:00",
    creditedAt: "2026-03-04T13:31:00-05:00",
    appointmentId: "appt-8",
    creditedTransactionId: "loyalty-txn-3"
  },
  {
    id: "referral-event-2",
    referralCodeId: "referral-code-nova",
    referrerClientId: "client-nova",
    referredClientEmail: "friend.two@example.com",
    status: "completed",
    rewardPoints: 50,
    createdAt: "2026-03-05T12:00:00-05:00",
    signedUpAt: "2026-03-05T14:15:00-05:00",
    bookedAt: "2026-03-06T11:20:00-05:00",
    completedAt: "2026-03-07T15:10:00-05:00",
    appointmentId: "appt-9"
  },
  {
    id: "referral-event-3",
    referralCodeId: "referral-code-ava",
    referrerClientId: "client-ava",
    referredClientEmail: "friend.three@example.com",
    status: "invited",
    rewardPoints: 50,
    createdAt: "2026-03-08T09:45:00-05:00"
  }
];

export const demoBarberFollows: BarberFollowRecord[] = [
  { id: "follow-1", clientId: "client-jordan", barberId: "barber-wave", notifyOnAvailability: true, notifyOnPortfolio: true, createdAt: "2026-03-05T08:30:00-05:00" },
  { id: "follow-2", clientId: "client-jordan", barberId: "barber-blaze", notifyOnAvailability: true, notifyOnPortfolio: false, createdAt: "2026-03-06T17:00:00-05:00" },
  { id: "follow-3", clientId: "client-ava", barberId: "barber-luxe", notifyOnAvailability: true, notifyOnPortfolio: true, createdAt: "2026-03-04T11:10:00-05:00" },
  { id: "follow-4", clientId: "client-malik", barberId: "barber-fade", notifyOnAvailability: false, notifyOnPortfolio: true, createdAt: "2026-03-02T14:00:00-05:00" }
];

export const demoEngagementEvents: EngagementEventRecord[] = [
  { id: "engagement-1", actorRole: "client", actorId: "client-jordan", targetType: "barber", targetId: "barber-wave", eventType: "appointment_rebooked", metadata: { cadenceDays: 14 }, createdAt: "2026-03-08T11:25:00-05:00" },
  { id: "engagement-2", actorRole: "client", actorId: "client-cam", targetType: "service", targetId: "srv-signature", eventType: "waitlist_joined", metadata: { locationId: "loc-ybor" }, createdAt: "2026-03-08T12:10:00-05:00" },
  { id: "engagement-3", actorRole: "client", actorId: "client-jordan", targetType: "barber", targetId: "barber-wave", eventType: "barber_reviewed", metadata: { rating: 5 }, createdAt: "2026-03-06T10:00:00-05:00" },
  { id: "engagement-4", actorRole: "barber_user", actorId: "barber-wave", targetType: "barber", targetId: "barber-wave", eventType: "service_completed", metadata: { appointmentId: "appt-2" }, createdAt: "2026-03-08T12:55:00-05:00" },
  { id: "engagement-5", actorRole: "booth_rent_barber", actorId: "barber-blaze", targetType: "barber", targetId: "barber-blaze", eventType: "payout_released", metadata: { period: "Week of Mar 3" }, createdAt: "2026-03-04T17:00:00-05:00" },
  { id: "engagement-6", actorRole: "barber_user", actorId: "barber-fade", targetType: "barber", targetId: "barber-fade", eventType: "portfolio_updated", metadata: { assetCount: 3 }, createdAt: "2026-03-07T09:40:00-05:00" },
  { id: "engagement-7", actorRole: "barber_user", actorId: "barber-wave", targetType: "barber", targetId: "barber-wave", eventType: "review_received", metadata: { reviewId: "review-1" }, createdAt: "2026-03-06T10:05:00-05:00" },
  { id: "engagement-8", actorRole: "client", actorId: "client-jordan", targetType: "barber", targetId: "barber-blaze", eventType: "barber_followed", metadata: { notifyOnAvailability: true }, createdAt: "2026-03-06T17:00:00-05:00" },
  { id: "engagement-9", actorRole: "client", actorId: "client-ava", targetType: "service", targetId: "srv-color", eventType: "reward_redeemed", metadata: { pointsUsed: 80 }, createdAt: "2026-03-02T16:10:00-05:00" },
  { id: "engagement-10", actorRole: "barber_user", actorId: "barber-fade", targetType: "barber", targetId: "barber-fade", eventType: "booking_accepted", metadata: { appointmentId: "appt-5" }, createdAt: "2026-03-08T12:15:00-05:00" }
];

export const demoRebookingCycles: RebookingCycleRecord[] = [
  { id: "cycle-jordan", clientId: "client-jordan", barberId: "barber-wave", serviceId: "srv-signature", averageCycleDays: 14, confidence: "high", lastCompletedAt: "2026-03-06T10:00:00-05:00", nextSuggestedAt: "2026-03-18T09:00:00-05:00" },
  { id: "cycle-nova", clientId: "client-nova", barberId: "barber-blaze", serviceId: "srv-razor", averageCycleDays: 21, confidence: "medium", lastCompletedAt: "2026-03-08T09:40:00-05:00", nextSuggestedAt: "2026-03-27T09:00:00-05:00" },
  { id: "cycle-ava", clientId: "client-ava", barberId: "barber-luxe", serviceId: "srv-color", averageCycleDays: 28, confidence: "medium", lastCompletedAt: "2026-03-07T16:50:00-05:00", nextSuggestedAt: "2026-04-02T10:00:00-05:00" },
  { id: "cycle-malik", clientId: "client-malik", barberId: "barber-fade", serviceId: "srv-design", averageCycleDays: 18, confidence: "low", lastCompletedAt: "2026-03-01T14:00:00-05:00", nextSuggestedAt: "2026-03-17T09:00:00-05:00" }
];

export const demoRebookingRecommendations: RebookingRecommendationRecord[] = [
  { id: "recommendation-jordan", clientId: "client-jordan", barberId: "barber-wave", serviceId: "srv-signature", message: "Your fade should be ready for a refresh next week. Lock in Wave before the afternoon book fills up.", remindAt: "2026-03-16T09:00:00-05:00", status: "queued", reason: "High-confidence 14-day cadence based on recent premium cut history.", createdAt: "2026-03-08T18:00:00-05:00" },
  { id: "recommendation-ava", clientId: "client-ava", barberId: "barber-luxe", serviceId: "srv-color", message: "Your color blend usually comes back cleanest when you rebook within four weeks.", remindAt: "2026-03-31T10:00:00-05:00", status: "suggested", reason: "Color services are trending toward a 28-day cadence in your visit history.", createdAt: "2026-03-08T18:02:00-05:00" },
  { id: "recommendation-malik", clientId: "client-malik", barberId: "barber-fade", serviceId: "srv-design", message: "Fade Monroe has openings coming up around your normal game-day refresh window.", remindAt: "2026-03-15T09:00:00-05:00", status: "suggested", reason: "Lower-confidence pattern based on limited design-session history.", createdAt: "2026-03-08T18:04:00-05:00" }
];

export const demoNotificationPreferences: NotificationPreferenceRecord[] = [
  { id: "pref-client-jordan", userEmail: "client@bvrb3r.demo", role: "client", clientId: "client-jordan", inAppEnabled: true, smsEnabled: true, emailEnabled: true, pushEnabled: true, updatedAt: "2026-03-08T08:00:00-05:00" },
  { id: "pref-wave", userEmail: "wave@bvrb3r.demo", role: "barber_user", barberId: "barber-wave", inAppEnabled: true, smsEnabled: false, emailEnabled: true, pushEnabled: true, updatedAt: "2026-03-08T08:05:00-05:00" },
  { id: "pref-blaze", userEmail: "blaze@bvrb3r.demo", role: "booth_rent_barber", barberId: "barber-blaze", inAppEnabled: true, smsEnabled: false, emailEnabled: true, pushEnabled: false, updatedAt: "2026-03-08T08:10:00-05:00" },
  { id: "pref-owner", userEmail: "owner@bvrb3r.demo", role: "owner", inAppEnabled: true, smsEnabled: false, emailEnabled: true, pushEnabled: true, updatedAt: "2026-03-08T08:20:00-05:00" }
];

export const demoEngagementNotifications: EngagementNotificationRecord[] = [
  { id: "engage-note-1", userEmail: "client@bvrb3r.demo", role: "client", clientId: "client-jordan", channel: "sms", type: "rebooking_reminder", title: "Your fade refresh window is coming up", body: "Wave Carter still has premium afternoon availability next week.", status: "scheduled", createdAt: "2026-03-08T18:00:00-05:00", scheduledFor: "2026-03-16T09:00:00-05:00" },
  { id: "engage-note-2", userEmail: "client@bvrb3r.demo", role: "client", clientId: "client-jordan", channel: "in_app", type: "loyalty_milestone", title: "BVRB3R Points unlocked", body: "You are 30 points away from a premium add-on reward.", status: "sent", createdAt: "2026-03-08T18:05:00-05:00" },
  { id: "engage-note-3", userEmail: "wave@bvrb3r.demo", role: "barber_user", barberId: "barber-wave", channel: "in_app", type: "review_alert", title: "New 5-star review", body: "Jordan Ellis left a premium review after the last visit.", status: "sent", createdAt: "2026-03-06T10:05:00-05:00" },
  { id: "engage-note-4", userEmail: "blaze@bvrb3r.demo", role: "booth_rent_barber", barberId: "barber-blaze", channel: "email", type: "payout_alert", title: "Revenue ledger refreshed", body: "Your weekly rent ledger and collected revenue summary are ready.", status: "sent", createdAt: "2026-03-04T17:05:00-05:00" },
  { id: "engage-note-5", userEmail: "owner@bvrb3r.demo", role: "owner", channel: "in_app", type: "instant_booking_alert", title: "Discovery demand rising in Ybor", body: "Instant-booking demand is growing faster than current chair capacity during late afternoon windows.", status: "placeholder", createdAt: "2026-03-08T19:00:00-05:00" }
];

export const demoReputationScores: ReputationScoreRecord[] = [
  { barberId: "barber-wave", reviewScore: 98, punctualityScore: 94, completionScore: 96, retentionScore: 92, overallScore: 95, tier: "elite", updatedAt: "2026-03-08T18:10:00-05:00" },
  { barberId: "barber-fade", reviewScore: 92, punctualityScore: 89, completionScore: 93, retentionScore: 84, overallScore: 89.5, tier: "trusted", updatedAt: "2026-03-08T18:10:00-05:00" },
  { barberId: "barber-blaze", reviewScore: 99, punctualityScore: 91, completionScore: 95, retentionScore: 90, overallScore: 93.75, tier: "elite", updatedAt: "2026-03-08T18:10:00-05:00" },
  { barberId: "barber-luxe", reviewScore: 95, punctualityScore: 90, completionScore: 92, retentionScore: 88, overallScore: 91.25, tier: "trusted", updatedAt: "2026-03-08T18:10:00-05:00" }
];

export const demoRankingSnapshots: RankingSnapshotRecord[] = [
  { id: "rank-wave-booked", barberId: "barber-wave", dimension: "most_booked", rankPosition: 1, score: 96, label: "Most booked in Ybor", observedAt: "2026-03-08T18:00:00-05:00" },
  { id: "rank-wave-rated", barberId: "barber-wave", dimension: "highest_rated", rankPosition: 1, score: 98, label: "Highest rated this week", observedAt: "2026-03-08T18:00:00-05:00" },
  { id: "rank-fade-growth", barberId: "barber-fade", dimension: "fastest_growing", rankPosition: 2, score: 88, label: "Fastest growing in Hyde Park", observedAt: "2026-03-08T18:00:00-05:00" },
  { id: "rank-fade-style", barberId: "barber-fade", dimension: "style_leader", rankPosition: 1, score: 91, label: "Design detail leader", observedAt: "2026-03-08T18:00:00-05:00" },
  { id: "rank-blaze-booked", barberId: "barber-blaze", dimension: "most_booked", rankPosition: 2, score: 90, label: "Executive grooming favorite", observedAt: "2026-03-08T18:00:00-05:00" },
  { id: "rank-luxe-style", barberId: "barber-luxe", dimension: "style_leader", rankPosition: 1, score: 93, label: "Camera-ready finish leader", observedAt: "2026-03-08T18:00:00-05:00" }
];

export const demoGrowthRecommendations: GrowthRecommendationRecord[] = [
  { id: "growth-wave-rebook", barberId: "barber-wave", title: "Push rebooking over 60%", description: "Wave has the highest rating in the network. Opening a few more late-afternoon slots should convert more premium repeat visits.", focusArea: "rebooking", priority: "high", status: "open", actionLabel: "Open premium refresh slots", createdAt: "2026-03-08T17:00:00-05:00" },
  { id: "growth-fade-portfolio", barberId: "barber-fade", title: "Upload more design work", description: "Your burst-fade demand is growing. Add 3 more strong portfolio examples to improve discovery conversion.", focusArea: "portfolio", priority: "high", status: "open", actionLabel: "Add portfolio content", createdAt: "2026-03-08T17:10:00-05:00" },
  { id: "growth-blaze-punctuality", barberId: "barber-blaze", title: "Tighten first-service punctuality", description: "A few lunch-break guests are arriving on compressed schedules. Starting the first chair on time will protect retention.", focusArea: "punctuality", priority: "medium", status: "in_progress", actionLabel: "Review first-chair setup", createdAt: "2026-03-08T17:20:00-05:00" },
  { id: "growth-luxe-availability", barberId: "barber-luxe", title: "Open one more camera-ready lane", description: "Demand for luxury finish work is outpacing current Saturday availability in Hyde Park.", focusArea: "availability", priority: "medium", status: "open", actionLabel: "Expand premium availability", createdAt: "2026-03-08T17:30:00-05:00" }
];

