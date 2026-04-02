import type {
  CashoutRequestRecord,
  PointsProgramRuleRecord,
  PointsState,
  PointsTransactionRecord,
  RewardCampaignRecord,
  RewardEligibilitySnapshotRecord,
  UserPointsBalanceRecord
} from "@/types/points";

const NOW = "2026-03-25T10:00:00-04:00";

export const demoUserPointsBalances: UserPointsBalanceRecord[] = [
  {
    userId: "user-client",
    role: "client",
    totalPoints: 79,
    pendingPoints: 8,
    unlockedPoints: 71,
    lifetimeEarned: 99,
    lifetimeRedeemed: 20,
    updatedAt: NOW
  },
  {
    userId: "user-blaze",
    role: "barber",
    totalPoints: 92,
    pendingPoints: 12,
    unlockedPoints: 80,
    lifetimeEarned: 92,
    lifetimeRedeemed: 0,
    updatedAt: NOW
  },
  {
    userId: "user-owner",
    role: "owner",
    totalPoints: 140,
    pendingPoints: 40,
    unlockedPoints: 100,
    lifetimeEarned: 160,
    lifetimeRedeemed: 20,
    updatedAt: NOW
  }
];

export const demoPointsTransactions: PointsTransactionRecord[] = [
  {
    id: "pts-txn-client-referral",
    userId: "user-client",
    role: "client",
    pointClass: "earned",
    eventType: "referral",
    sourceType: "referral_event",
    sourceId: "referral-event-1",
    referralId: "referral-event-1",
    pointsDelta: 10,
    inAppValue: 1,
    cashValue: 0.7,
    status: "unlocked",
    createdAt: "2026-03-04T13:31:00-05:00",
    unlockedAt: "2026-03-06T13:31:00-05:00",
    metadata: {
      referredClientId: "client-cam",
      appointmentId: "appt-8"
    }
  },
  {
    id: "pts-txn-client-booking",
    userId: "user-client",
    role: "client",
    pointClass: "earned",
    eventType: "booking",
    sourceType: "appointment",
    sourceId: "appt-7",
    pointsDelta: 8,
    inAppValue: 0.8,
    cashValue: 0.56,
    status: "pending",
    createdAt: "2026-03-24T17:00:00-04:00",
    unlockedAt: "2026-03-26T17:00:00-04:00",
    metadata: {
      appointmentId: "appt-7",
      locationId: "loc-hyde"
    }
  },
  {
    id: "pts-txn-client-tip",
    userId: "user-client",
    role: "client",
    pointClass: "earned",
    eventType: "tip",
    sourceType: "appointment",
    sourceId: "appt-7:tip",
    pointsDelta: 5,
    inAppValue: 0.5,
    cashValue: 0,
    status: "unlocked",
    createdAt: "2026-03-22T18:05:00-04:00",
    unlockedAt: "2026-03-24T18:05:00-04:00",
    metadata: {
      appointmentId: "appt-7",
      locationId: "loc-ybor",
      tipAmount: 8
    }
  },
  {
    id: "pts-txn-client-retention",
    userId: "user-client",
    role: "client",
    pointClass: "earned",
    eventType: "retention",
    sourceType: "manual",
    sourceId: "retention-streak-1",
    pointsDelta: 36,
    inAppValue: 3.6,
    cashValue: 0,
    status: "unlocked",
    createdAt: "2026-03-15T09:00:00-04:00",
    unlockedAt: "2026-03-17T09:00:00-04:00",
    metadata: {
      locationId: "loc-ybor",
      streakCount: 3
    }
  },
  {
    id: "pts-txn-client-campaign",
    userId: "user-client",
    role: "client",
    pointClass: "promo",
    eventType: "campaign",
    sourceType: "campaign_credit",
    sourceId: "campaign-referral-boost",
    pointsDelta: 40,
    inAppValue: 4,
    cashValue: 0,
    status: "unlocked",
    createdAt: "2026-03-21T10:30:00-04:00",
    unlockedAt: "2026-03-21T10:30:00-04:00",
    metadata: {
      campaignId: "campaign-referral-boost",
      locationId: "loc-ybor"
    }
  },
  {
    id: "pts-txn-client-redeemed",
    userId: "user-client",
    role: "client",
    pointClass: "promo",
    eventType: "campaign",
    sourceType: "booking_redemption",
    sourceId: "appt-4",
    pointsDelta: -20,
    inAppValue: -2,
    cashValue: 0,
    status: "redeemed",
    createdAt: "2026-03-18T09:10:00-04:00",
    metadata: {
      appointmentId: "appt-4",
      redemptionPurpose: "booking_discount"
    }
  },
  {
    id: "pts-txn-barber-referral",
    userId: "user-blaze",
    role: "barber",
    pointClass: "earned",
    eventType: "referral",
    sourceType: "referral_event",
    sourceId: "referral-event-1:barber",
    referralId: "referral-event-1",
    pointsDelta: 15,
    inAppValue: 1.5,
    cashValue: 1.05,
    status: "unlocked",
    createdAt: "2026-03-04T13:31:00-05:00",
    unlockedAt: "2026-03-06T13:31:00-05:00",
    metadata: {
      appointmentId: "appt-8",
      locationId: "loc-ybor"
    }
  },
  {
    id: "pts-txn-barber-campaign",
    userId: "user-blaze",
    role: "barber",
    pointClass: "earned",
    eventType: "campaign",
    sourceType: "campaign_credit",
    sourceId: "campaign-retention-streak:barber-blaze",
    pointsDelta: 65,
    inAppValue: 6.5,
    cashValue: 4.55,
    status: "unlocked",
    createdAt: "2026-03-16T12:00:00-04:00",
    unlockedAt: "2026-03-16T12:00:00-04:00",
    metadata: {
      campaignId: "campaign-retention-streak",
      locationId: "loc-ybor"
    }
  },
  {
    id: "pts-txn-barber-pending",
    userId: "user-blaze",
    role: "barber",
    pointClass: "promo",
    eventType: "campaign",
    sourceType: "campaign_credit",
    sourceId: "campaign-slow-day:barber-blaze",
    pointsDelta: 12,
    inAppValue: 1.2,
    cashValue: 0,
    status: "pending",
    createdAt: "2026-03-25T08:30:00-04:00",
    unlockedAt: "2026-03-27T08:30:00-04:00",
    metadata: {
      campaignId: "campaign-slow-day",
      locationId: "loc-ybor"
    }
  },
  {
    id: "pts-txn-owner-referral",
    userId: "user-owner",
    role: "owner",
    pointClass: "earned",
    eventType: "referral",
    sourceType: "referral_event",
    sourceId: "referral-event-1:owner",
    referralId: "referral-event-1",
    pointsDelta: 20,
    inAppValue: 2,
    cashValue: 1.4,
    status: "unlocked",
    createdAt: "2026-03-04T13:31:00-05:00",
    unlockedAt: "2026-03-06T13:31:00-05:00",
    metadata: {
      appointmentId: "appt-8",
      locationId: "loc-ybor"
    }
  },
  {
    id: "pts-txn-owner-unlocked-campaign",
    userId: "user-owner",
    role: "owner",
    pointClass: "promo",
    eventType: "campaign",
    sourceType: "campaign_credit",
    sourceId: "campaign-owner-credit-1",
    pointsDelta: 100,
    inAppValue: 10,
    cashValue: 0,
    status: "unlocked",
    createdAt: "2026-03-12T08:00:00-04:00",
    unlockedAt: "2026-03-12T08:00:00-04:00",
    metadata: {
      campaignId: "campaign-slow-day",
      locationId: "loc-ybor"
    }
  },
  {
    id: "pts-txn-owner-campaign",
    userId: "user-owner",
    role: "owner",
    pointClass: "promo",
    eventType: "campaign",
    sourceType: "campaign_credit",
    sourceId: "campaign-slow-day",
    pointsDelta: 40,
    inAppValue: 4,
    cashValue: 0,
    status: "pending",
    createdAt: "2026-03-25T08:00:00-04:00",
    unlockedAt: "2026-03-27T08:00:00-04:00",
    metadata: {
      campaignId: "campaign-slow-day"
    }
  },
  {
    id: "pts-txn-owner-redeemed",
    userId: "user-owner",
    role: "owner",
    pointClass: "promo",
    eventType: "campaign",
    sourceType: "campaign_credit",
    sourceId: "campaign-owner-credit-1:redeemed",
    pointsDelta: -20,
    inAppValue: -2,
    cashValue: 0,
    status: "redeemed",
    createdAt: "2026-03-18T08:00:00-04:00",
    metadata: {
      campaignId: "campaign-slow-day",
      locationId: "loc-ybor",
      redemptionPurpose: "campaign_credit"
    }
  }
];

export const demoPointsProgramRules: PointsProgramRuleRecord[] = [
  {
    id: "points-rule-client-referral",
    role: "client",
    eventType: "referral",
    maxPointsPerEvent: 10,
    maxPointsPerUserWindow: 40,
    windowDays: 30,
    expirationDays: 180,
    cashoutAllowed: false,
    delayUnlockHours: 48,
    createdAt: NOW
  },
  {
    id: "points-rule-barber-referral",
    role: "barber",
    eventType: "referral",
    maxPointsPerEvent: 15,
    maxPointsPerUserWindow: 60,
    windowDays: 30,
    expirationDays: 180,
    cashoutAllowed: true,
    delayUnlockHours: 48,
    createdAt: NOW
  },
  {
    id: "points-rule-owner-referral",
    role: "owner",
    eventType: "referral",
    maxPointsPerEvent: 20,
    maxPointsPerUserWindow: 80,
    windowDays: 30,
    expirationDays: 180,
    cashoutAllowed: true,
    delayUnlockHours: 48,
    createdAt: NOW
  },
  {
    id: "points-rule-client-booking",
    role: "client",
    eventType: "booking",
    maxPointsPerEvent: 8,
    maxPointsPerUserWindow: 32,
    windowDays: 30,
    expirationDays: 120,
    cashoutAllowed: false,
    delayUnlockHours: 48,
    createdAt: NOW
  },
  {
    id: "points-rule-client-retention",
    role: "client",
    eventType: "retention",
    maxPointsPerEvent: 12,
    maxPointsPerUserWindow: 24,
    windowDays: 30,
    expirationDays: 120,
    cashoutAllowed: false,
    delayUnlockHours: 48,
    createdAt: NOW
  },
  {
    id: "points-rule-client-tip",
    role: "client",
    eventType: "tip",
    maxPointsPerEvent: 6,
    maxPointsPerUserWindow: 18,
    windowDays: 30,
    expirationDays: 90,
    cashoutAllowed: false,
    delayUnlockHours: 48,
    createdAt: NOW
  }
];

export const demoRewardCampaigns: RewardCampaignRecord[] = [
  {
    id: "campaign-referral-boost",
    name: "Referral boost week",
    roleTarget: "client",
    eventTarget: "referral",
    multiplier: 1.5,
    pointClass: "promo",
    budgetCap: 300,
    startAt: "2026-03-20T00:00:00-04:00",
    endAt: "2026-03-31T23:59:59-04:00",
    isActive: true
  },
  {
    id: "campaign-slow-day",
    name: "Slow day fill incentive",
    roleTarget: "owner",
    eventTarget: "campaign",
    multiplier: 1,
    pointClass: "promo",
    budgetCap: 500,
    startAt: "2026-03-25T00:00:00-04:00",
    endAt: "2026-03-29T23:59:59-04:00",
    isActive: true
  },
  {
    id: "campaign-retention-streak",
    name: "Retention streak bonus",
    roleTarget: "client",
    eventTarget: "retention",
    multiplier: 1.25,
    pointClass: "earned",
    budgetCap: 250,
    startAt: "2026-03-21T00:00:00-04:00",
    endAt: "2026-04-05T23:59:59-04:00",
    isActive: true
  }
];

export const demoRewardEligibilitySnapshots: RewardEligibilitySnapshotRecord[] = [
  {
    id: "eligibility-client-referral",
    userId: "user-client",
    role: "client",
    eventType: "referral",
    eligibilityStatus: "eligible",
    validationFlags: {
      paymentSettled: true,
      appointmentCompleted: true,
      referralUnique: true
    },
    createdAt: "2026-03-04T13:31:00-05:00"
  },
  {
    id: "eligibility-owner-campaign",
    userId: "user-owner",
    role: "owner",
    eventType: "campaign",
    eligibilityStatus: "pending_review",
    validationFlags: {
      budgetRemaining: true,
      fraudScreened: true
    },
    createdAt: NOW
  }
];

export const demoCashoutRequests: CashoutRequestRecord[] = [
  {
    id: "cashout-blaze-1",
    userId: "user-blaze",
    role: "barber",
    pointsRequested: 40,
    cashValue: 2.8,
    status: "under_review",
    createdAt: "2026-03-22T10:30:00-04:00",
    processedAt: null,
    metadata: {
      requestedBy: "user-blaze",
      connectedAccountReady: true
    }
  }
];

export function createInitialPointsState(): PointsState {
  return JSON.parse(JSON.stringify({
    balances: demoUserPointsBalances,
    transactions: demoPointsTransactions,
    programRules: demoPointsProgramRules,
    campaigns: demoRewardCampaigns,
    eligibilitySnapshots: demoRewardEligibilitySnapshots,
    cashoutRequests: demoCashoutRequests
  })) as PointsState;
}
