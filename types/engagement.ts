import type { BarberActivationSummary, OwnerMarketplaceActivationSummary } from "@/types/activation";
import type { Role } from "@/types/domain";
import type { OwnerMoneyDashboardView } from "@/types/fintech";
import type { OwnerMonetizationSummary } from "@/types/monetization";
import type { OwnerPointsAnalyticsSummary } from "@/types/points";
import type { BarberTrustWorkspaceSummary, OwnerTrustWorkspaceSummary } from "@/types/trust";

export type LoyaltyTier = "core" | "vip" | "elite";
export type LoyaltyTransactionReason =
  | "completed_booking"
  | "behavior_reward"
  | "review"
  | "referral"
  | "reward_redemption"
  | "manual_adjustment";
export type LoyaltyRewardRuleTrigger = "completed_booking";
export type ReferralStatus = "invited" | "signed_up" | "booked" | "completed" | "credited";
export type EngagementEventType =
  | "appointment_booked"
  | "appointment_rebooked"
  | "waitlist_joined"
  | "barber_followed"
  | "barber_reviewed"
  | "reward_redeemed"
  | "service_completed"
  | "review_received"
  | "payout_released"
  | "profile_updated"
  | "portfolio_updated"
  | "booking_accepted";
export type NotificationChannel = "in_app" | "sms" | "email" | "push";
export type NotificationStatus = "queued" | "scheduled" | "sent" | "placeholder";
export type RebookingRecommendationStatus = "suggested" | "queued" | "sent" | "accepted";
export type ReputationTier = "standard" | "trusted" | "elite";
export type RankingDimension = "most_booked" | "highest_rated" | "fastest_growing" | "style_leader";
export type GrowthRecommendationStatus = "open" | "in_progress" | "resolved";
export type IntelligenceRebookingWindow = "building" | "on_track" | "due_soon" | "due_now" | "overdue" | "scheduled";
export type IntelligenceRiskLevel = "low" | "medium" | "high";
export type LoyaltySegment = "new" | "repeat" | "loyal" | "vip" | "at_risk";
export type AutomationType =
  | "rebooking_reminder"
  | "reengagement_nudge"
  | "promotion_follow_up"
  | "reward_follow_up";
export type AutomationRunStatus =
  | "pending"
  | "queued"
  | "processing"
  | "retry_scheduled"
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked";
export type AutomationTriggerSource = "manual" | "background" | "refresh";
export type AutomationFailureKind = "transient" | "terminal" | "blocked";
export type AutomationDeliveryStatus = "queued" | "retrying" | "delivered" | "placeholder" | "failed";
export type AutomationEventType =
  | "snapshot_refreshed"
  | "run_queued"
  | "run_started"
  | "run_completed"
  | "run_failed"
  | "run_cancelled"
  | "retry_scheduled"
  | "delivery_succeeded"
  | "delivery_failed";
export type EngagementNotificationType =
  | "rebooking_reminder"
  | "reengagement_nudge"
  | "loyalty_milestone"
  | "referral_prompt"
  | "new_follower"
  | "booking_alert"
  | "review_alert"
  | "payout_alert"
  | "instant_booking_alert"
  | "waitlist_opening"
  | "referral_reward"
  | "verification_update"
  | "trust_status_update"
  | "boost_update"
  | "featured_placement_update"
  | "barber_opportunity"
  | "promotion_follow_up"
  | "reward_follow_up";

export interface LoyaltyAccountRecord {
  id: string;
  clientId: string;
  pointsBalance: number;
  lifetimePoints: number;
  tier: LoyaltyTier;
  referralCredits: number;
  updatedAt: string;
}

export interface LoyaltyTransactionRecord {
  id: string;
  clientId: string;
  reason: LoyaltyTransactionReason;
  pointsDelta: number;
  label: string;
  referenceId?: string;
  createdAt: string;
}

export interface LoyaltyRewardRuleRecord {
  id: string;
  ruleCode: string;
  title: string;
  triggerEvent: LoyaltyRewardRuleTrigger;
  active: boolean;
  thresholdCount: number;
  everyNthCount?: number;
  minDaysSinceLastCompletion?: number;
  requiresActiveMembership: boolean;
  pointsDelta: number;
  metadata: Record<string, string | number | boolean | null>;
  updatedAt: string;
}

export interface ReferralCodeRecord {
  id: string;
  clientId: string;
  code: string;
  rewardPoints: number;
  active: boolean;
  createdAt: string;
}

export interface ReferralEventRecord {
  id: string;
  referralCodeId: string;
  referrerClientId: string;
  referredClientEmail: string;
  referredClientId?: string;
  status: ReferralStatus;
  rewardPoints: number;
  createdAt: string;
  signedUpAt?: string;
  bookedAt?: string;
  completedAt?: string;
  creditedAt?: string;
  appointmentId?: string;
  creditedTransactionId?: string;
}

export interface BarberFollowRecord {
  id: string;
  clientId: string;
  barberId: string;
  notifyOnAvailability: boolean;
  notifyOnPortfolio: boolean;
  createdAt: string;
}

export interface EngagementEventRecord {
  id: string;
  actorRole: Role;
  actorId: string;
  targetType: "client" | "barber" | "owner" | "location" | "referral" | "service";
  targetId: string;
  eventType: EngagementEventType;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface RebookingCycleRecord {
  id: string;
  clientId: string;
  barberId?: string;
  serviceId?: string;
  averageCycleDays: number;
  confidence: "low" | "medium" | "high";
  lastCompletedAt: string;
  nextSuggestedAt: string;
}

export interface RebookingRecommendationRecord {
  id: string;
  clientId: string;
  barberId?: string;
  serviceId?: string;
  message: string;
  remindAt: string;
  status: RebookingRecommendationStatus;
  reason: string;
  createdAt: string;
}

export interface ClientBarberRecommendationView {
  barberId: string;
  barberName: string;
  username?: string;
  nextAvailableAt?: string;
  score: number;
  reason: string;
}

export interface ClientIntelligenceSnapshotRecord {
  clientId: string;
  favoriteBarberId?: string;
  favoriteLocationId?: string;
  primaryServiceId?: string;
  lastCompletedAt?: string;
  nextDueAt?: string;
  averageCycleDays?: number;
  completedVisitCount: number;
  repeatVisitCount: number;
  activeAppointmentCount: number;
  rebookingWindow: IntelligenceRebookingWindow;
  churnRisk: IntelligenceRiskLevel;
  churnScore: number;
  reengagementEligible: boolean;
  loyaltySegment: LoyaltySegment;
  nextBestAction: string;
  explanation: string;
  recommendationReasons: string[];
  recommendedBarberId?: string;
  recommendedLocationId?: string;
  recommendedServiceId?: string;
  updatedAt: string;
}

export interface ReturningClientInsight {
  clientId: string;
  clientName: string;
  completedVisits: number;
  lastVisitAt?: string;
  lifetimeValue: number;
  churnRisk: IntelligenceRiskLevel;
  loyaltySegment: LoyaltySegment;
}

export interface BarberRetentionInsight {
  barberId: string;
  barberName: string;
  repeatClients: number;
  atRiskClients: number;
  rebookingOpportunities: number;
  completedServices: number;
}

export interface LocationIntelligenceSnapshotRecord {
  locationId: string;
  repeatClientCount: number;
  loyalClientCount: number;
  churnRiskClientCount: number;
  reengagementEligibleCount: number;
  rebookingOpportunityCount: number;
  completedServiceCount: number;
  topReturningClients: ReturningClientInsight[];
  barberRetention: BarberRetentionInsight[];
  updatedAt: string;
}

export interface NotificationPreferenceRecord {
  id: string;
  userEmail: string;
  role: Role;
  clientId?: string;
  barberId?: string;
  inAppEnabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  updatedAt: string;
}

export interface EngagementNotificationRecord {
  id: string;
  userEmail: string;
  role: Role;
  clientId?: string;
  barberId?: string;
  locationId?: string;
  channel: NotificationChannel;
  type: EngagementNotificationType;
  title: string;
  body: string;
  status: NotificationStatus;
  createdAt: string;
  scheduledFor?: string;
}

export interface AutomationTriggerSnapshotRecord {
  clientId: string;
  clientEmail: string;
  locationId?: string;
  barberId?: string;
  recommendedPromotionId?: string;
  rebookingWindow: IntelligenceRebookingWindow;
  churnRisk: IntelligenceRiskLevel;
  churnScore: number;
  reengagementEligible: boolean;
  loyaltySegment: LoyaltySegment;
  activeAppointmentCount: number;
  nextDueAt?: string;
  rebookingReminderEligible: boolean;
  reengagementNudgeEligible: boolean;
  promotionFollowUpEligible: boolean;
  rewardFollowUpEligible: boolean;
  nextAutomationDueAt?: string;
  automationReasons: Partial<Record<AutomationType, string>>;
  updatedAt: string;
}

export interface AutomationRunRecord {
  id: string;
  automationType: AutomationType;
  status: AutomationRunStatus;
  clientId: string;
  clientEmail: string;
  locationId?: string;
  barberId?: string;
  promotionId?: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  dueAt: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  retryEligible: boolean;
  terminalFailure: boolean;
  nextRetryAt?: string;
  retryScheduledAt?: string;
  processingStartedAt?: string;
  lastFailureKind?: AutomationFailureKind;
  lastTriggerSource?: AutomationTriggerSource;
  lastDeliveryStatus?: AutomationDeliveryStatus;
  lastDeliveryProvider?: string;
  lastDeliveryAttemptId?: string;
  notificationIds: string[];
  notificationId?: string;
  blockedReason?: string;
  errorMessage?: string;
  diagnostics?: Record<string, unknown>;
  lastEventAt?: string;
  queuedAt?: string;
  completedAt?: string;
  failedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationEventRecord {
  id: string;
  runId?: string;
  clientId: string;
  clientEmail?: string;
  locationId?: string;
  barberId?: string;
  automationType: AutomationType;
  eventType: AutomationEventType;
  runStatus: AutomationRunStatus;
  attemptNumber: number;
  channel?: NotificationChannel;
  triggerSource: AutomationTriggerSource;
  reason?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AutomationChannelSummary {
  channel: NotificationChannel;
  delivered: number;
  failed: number;
  retrying: number;
  queued: number;
  placeholder: number;
}

export interface AutomationRecentActivityRecord {
  eventId: string;
  runId?: string;
  clientId: string;
  clientEmail?: string;
  automationType: AutomationType;
  status: AutomationRunStatus;
  eventType: AutomationEventType;
  triggerSource: AutomationTriggerSource;
  reason?: string;
  createdAt: string;
}

export interface AutomationReportingSnapshotRecord {
  locationId: string;
  eligibleClients: number;
  dueNowRuns: number;
  pendingRuns: number;
  queuedRuns: number;
  processingRuns: number;
  retryScheduledRuns: number;
  retryDueRuns: number;
  completedRuns: number;
  failedRuns: number;
  blockedRuns: number;
  cancelledRuns: number;
  backlogRuns: number;
  retryCount: number;
  completionRate: number;
  failureRate: number;
  channelBreakdown: AutomationChannelSummary[];
  recentActivity: AutomationRecentActivityRecord[];
  updatedAt: string;
}

export interface ClientAutomationSummary {
  eligibleAutomationCount: number;
  pendingRuns: number;
  processingRuns: number;
  retryScheduledRuns: number;
  completedRuns: number;
  failedRuns: number;
  blockedRuns: number;
  nextAutomation?: AutomationRunRecord;
  recentRuns: AutomationRunRecord[];
}

export interface OwnerAutomationSummary {
  eligibleClients: number;
  pendingRuns: number;
  queuedRuns: number;
  dueNowRuns: number;
  processingRuns: number;
  retryScheduledRuns: number;
  retryDueRuns: number;
  completedRuns: number;
  failedRuns: number;
  blockedRuns: number;
  cancelledRuns: number;
  retryCount: number;
  backlogRuns: number;
  completionRate: number;
  failureRate: number;
  rebookingReminderEligible: number;
  reengagementEligible: number;
  promotionEligible: number;
  rewardEligible: number;
  channelBreakdown: AutomationChannelSummary[];
  recentActivity: AutomationRecentActivityRecord[];
  recentRuns: AutomationRunRecord[];
  topPendingClients: Array<{
    clientId: string;
    clientEmail: string;
    automationType: AutomationType;
    dueAt: string;
    status: AutomationRunStatus;
    title: string;
  }>;
}

export interface ReputationScoreRecord {
  barberId: string;
  reviewScore: number;
  punctualityScore: number;
  completionScore: number;
  retentionScore: number;
  overallScore: number;
  tier: ReputationTier;
  updatedAt: string;
}

export interface RankingSnapshotRecord {
  id: string;
  barberId: string;
  dimension: RankingDimension;
  rankPosition: number;
  score: number;
  label: string;
  observedAt: string;
}

export interface GrowthRecommendationRecord {
  id: string;
  barberId: string;
  title: string;
  description: string;
  focusArea: "portfolio" | "availability" | "punctuality" | "rebooking" | "reviews";
  priority: "low" | "medium" | "high";
  status: GrowthRecommendationStatus;
  actionLabel: string;
  createdAt: string;
}

export interface ClientRewardOption {
  id: string;
  title: string;
  pointsRequired: number;
  unlocked: boolean;
}

export interface ClientBarberFollowState {
  barberId: string;
  isFollowing: boolean;
  notifyOnAvailability: boolean;
  notifyOnPortfolio: boolean;
  followerCount: number;
}

export interface ClientReferralSummary {
  clientId: string;
  referralCode?: ReferralCodeRecord;
  inviteLink: string;
  shareMessage: string;
  totals: {
    invited: number;
    signedUp: number;
    booked: number;
    completed: number;
    credited: number;
    rewardPointsEarned: number;
  };
  recentReferrals: ReferralEventRecord[];
}

export interface ClientEngagementSummary {
  clientId: string;
  pointsBalance: number;
  lifetimePoints: number;
  tier: LoyaltyTier;
  referralCredits: number;
  completedBookings: number;
  favoriteBarberName?: string;
  rebookingRecommendation: RebookingRecommendationRecord | null;
  intelligence: ClientIntelligenceSnapshotRecord;
  recommendedBarbers: ClientBarberRecommendationView[];
  followedBarbers: Array<{
    barberId: string;
    barberName: string;
    username?: string;
    nextAvailableAt?: string;
    notifyOnAvailability: boolean;
  }>;
  followSuggestions: Array<{
    barberId: string;
    barberName: string;
    username?: string;
    reason: string;
  }>;
  rewards: ClientRewardOption[];
  referralCode?: ReferralCodeRecord;
  recentTransactions: LoyaltyTransactionRecord[];
  recentNotifications: EngagementNotificationRecord[];
  recentEvents: EngagementEventRecord[];
  automation: ClientAutomationSummary;
}

export interface BarberEngagementSummary {
  barberId: string;
  followerCount: number;
  earnings: {
    today: number;
    week: number;
    month: number;
    averageTip: number;
  };
  socialProof: {
    rating: number;
    reviewCount: number;
    cutsCompleted: number;
    trendingBadge?: string;
  };
  clientInsights: {
    repeatClients: number;
    retentionRate: number;
    returningClientsNeedingAttention: number;
    highestTipperName?: string;
    averageTip: number;
    topReturningClients: ReturningClientInsight[];
  };
  reputation: ReputationScoreRecord | null;
  rankings: RankingSnapshotRecord[];
  growthRecommendations: GrowthRecommendationRecord[];
  recentEvents: EngagementEventRecord[];
  marketplace: {
    profileViews: number;
    bookingClicks: number;
    bookingsCreated: number;
    bookingsCompleted: number;
    conversionRate: number;
    shareCount: number;
  };
  trust?: BarberTrustWorkspaceSummary;
  activation?: BarberActivationSummary;
}

export interface OwnerIntelligenceSummary {
  assignedLocationIds: string[];
  network: {
    revenue: number;
    chairUtilization: number;
    activeBarbers: number;
    completedServices: number;
  };
  retention: {
    repeatClientRate: number;
    loyaltyParticipants: number;
    loyaltyPointsIssued: number;
    referralConversions: number;
    rebookingEffectiveness: number;
    churnRiskClients: number;
    reengagementEligibleClients: number;
    rebookingOpportunities: number;
    loyalClients: number;
  };
  bookingTrends: Array<{
    label: string;
    value: number;
  }>;
  topBarbers: Array<{
    barberId: string;
    barberName: string;
    followerCount: number;
    reputationScore: number;
    revenue: number;
  }>;
  topReturningClients: ReturningClientInsight[];
  barberRetention: BarberRetentionInsight[];
  recentNotifications: EngagementNotificationRecord[];
  automation: OwnerAutomationSummary;
  monetization: OwnerMonetizationSummary;
  points?: OwnerPointsAnalyticsSummary;
  money?: OwnerMoneyDashboardView;
  marketplace: {
    discoveryImpressions: number;
    profileViews: number;
    bookingClicks: number;
    bookingsCreated: number;
    bookingsCompleted: number;
    followsCreated: number;
    haircutNowImpressions: number;
    shareCount: number;
    referralShares: number;
    referralSignUps: number;
    referralBookings: number;
    referralCompleted: number;
    referralCredited: number;
    discoveryToBookingRate: number;
    profileToBookingRate: number;
    clickToBookingRate: number;
    referralInvites: number;
    topSources: Array<{
      sourceKind: string;
      count: number;
    }>;
  };
  trust?: OwnerTrustWorkspaceSummary;
  activation?: OwnerMarketplaceActivationSummary;
}

export interface EngagementState {
  loyaltyAccounts: LoyaltyAccountRecord[];
  loyaltyTransactions: LoyaltyTransactionRecord[];
  loyaltyRewardRules: LoyaltyRewardRuleRecord[];
  referralCodes: ReferralCodeRecord[];
  referralEvents: ReferralEventRecord[];
  barberFollows: BarberFollowRecord[];
  engagementEvents: EngagementEventRecord[];
  rebookingCycles: RebookingCycleRecord[];
  rebookingRecommendations: RebookingRecommendationRecord[];
  notificationPreferences: NotificationPreferenceRecord[];
  notifications: EngagementNotificationRecord[];
  reputationScores: ReputationScoreRecord[];
  rankingSnapshots: RankingSnapshotRecord[];
  growthRecommendations: GrowthRecommendationRecord[];
}
