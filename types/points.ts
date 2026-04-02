export type PointsRole = "client" | "barber" | "owner";
export type PointsPointClass = "promo" | "earned";
export type PointsEventType = "referral" | "booking" | "retention" | "tip" | "campaign" | "cashout";
export type PointsTransactionStatus =
  | "pending"
  | "unlocked"
  | "redeemed"
  | "expired"
  | "reversed"
  | "cashed_out";
export type RewardEligibilityStatus = "eligible" | "blocked" | "pending_review";
export type CashoutRequestStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "paid"
  | "failed"
  | "rejected"
  | "reversed";
export type PointsSourceType =
  | "referral_event"
  | "appointment"
  | "booking_redemption"
  | "subscription_credit"
  | "campaign_credit"
  | "cashout_request"
  | "refund"
  | "manual";
export type RewardCampaignRoleTarget = PointsRole | "all";
export type RewardCampaignEventTarget = PointsEventType | "all";
export type PointsRedemptionPurpose = "booking_discount" | "subscription_credit" | "campaign_credit";
export type PointsActivityTone = "positive" | "neutral" | "warning";

export interface UserPointsBalanceRecord {
  userId: string;
  role: PointsRole;
  totalPoints: number;
  pendingPoints: number;
  unlockedPoints: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  updatedAt: string;
}

export interface PointsTransactionRecord {
  id: string;
  userId: string;
  role: PointsRole;
  pointClass: PointsPointClass;
  eventType: PointsEventType;
  sourceType: PointsSourceType;
  sourceId: string;
  referralId?: string | null;
  pointsDelta: number;
  inAppValue: number;
  cashValue: number;
  status: PointsTransactionStatus;
  createdAt: string;
  unlockedAt?: string | null;
  expiresAt?: string | null;
  reversedAt?: string | null;
  metadata: Record<string, unknown>;
}

export interface PointsProgramRuleRecord {
  id: string;
  role: PointsRole;
  eventType: PointsEventType;
  maxPointsPerEvent: number;
  maxPointsPerUserWindow: number;
  windowDays: number;
  expirationDays?: number | null;
  cashoutAllowed: boolean;
  delayUnlockHours: number;
  createdAt: string;
}

export interface RewardCampaignRecord {
  id: string;
  name: string;
  roleTarget: RewardCampaignRoleTarget;
  eventTarget: RewardCampaignEventTarget;
  multiplier: number;
  pointClass: PointsPointClass;
  budgetCap: number;
  startAt: string;
  endAt: string;
  isActive: boolean;
}

export interface RewardEligibilitySnapshotRecord {
  id: string;
  userId: string;
  role: PointsRole;
  eventType: PointsEventType;
  eligibilityStatus: RewardEligibilityStatus;
  validationFlags: Record<string, unknown>;
  createdAt: string;
}

export interface CashoutRequestRecord {
  id: string;
  userId: string;
  role: PointsRole;
  pointsRequested: number;
  cashValue: number;
  status: CashoutRequestStatus;
  createdAt: string;
  processedAt?: string | null;
  metadata: Record<string, unknown>;
}

export interface PointsState {
  balances: UserPointsBalanceRecord[];
  transactions: PointsTransactionRecord[];
  programRules: PointsProgramRuleRecord[];
  campaigns: RewardCampaignRecord[];
  eligibilitySnapshots: RewardEligibilitySnapshotRecord[];
  cashoutRequests: CashoutRequestRecord[];
}

export interface PointsBalanceView {
  userId: string;
  role: PointsRole;
  totalPoints: number;
  pendingPoints: number;
  unlockedPoints: number;
  lifetimeEarned: number;
  lifetimeRedeemed: number;
  inAppValue: number;
  cashoutValue: number;
  promoUnlockedPoints: number;
  earnedUnlockedPoints: number;
  referralPendingPoints: number;
  reservedCashoutPoints: number;
  cashoutEligiblePoints: number;
  updatedAt: string;
  explanation: PointsBalanceExplanation;
}

export interface PointsHistoryView {
  balance: PointsBalanceView;
  transactions: PointsTransactionRecord[];
  eligibilitySnapshots: RewardEligibilitySnapshotRecord[];
  cashoutRequests: CashoutRequestRecord[];
  activity: PointsActivityView[];
}

export interface PointsCampaignView {
  campaigns: RewardCampaignRecord[];
  activeCampaigns: RewardCampaignRecord[];
}

export interface PointsRedemptionPreview {
  requestedPoints: number;
  approvedPoints: number;
  promoPointsUsed: number;
  earnedPointsUsed: number;
  discountAmount: number;
  maxRedeemablePoints: number;
  remainingUnlockedPoints: number;
  remainingPromoPoints: number;
  remainingEarnedPoints: number;
  maxRedemptionRate: number;
  blockedReason?: string;
}

export interface PointsCashoutPreview {
  requestedPoints: number;
  approvedPoints: number;
  cashValue: number;
  minimumThresholdPoints: number;
  remainingEarnedPoints: number;
  blockedReason?: string;
}

export interface OwnerPointsCampaignImpact {
  campaignId: string;
  name: string;
  issuedPoints: number;
  inAppValue: number;
  redeemedValue: number;
  attributedRevenue: number;
  rewardCostRate: number;
  redemptionRate: number;
}

export interface PointsBalanceExplanation {
  nextMilestonePoints: number;
  pointsToNextMilestone: number;
  progressPercent: number;
  nextMilestoneInAppValue: number;
  nextMilestoneCashValue: number;
  progressLabel: string;
  valueAdvantageLabel: string;
  unlockHint: string;
  cashoutHint: string;
}

export interface PointsActivityView {
  id: string;
  eventType: PointsEventType;
  status: PointsTransactionStatus | CashoutRequestStatus;
  title: string;
  detail: string;
  amountLabel: string;
  statusLabel: string;
  occurredAt: string;
  tone: PointsActivityTone;
}

export interface PointsEventBreakdownItem {
  eventType: PointsEventType;
  issuedPoints: number;
  issuedInAppValue: number;
  transactionCount: number;
}

export interface OwnerPointsAnalyticsSummary {
  issuedPoints: number;
  pendingPoints: number;
  unlockedPoints: number;
  redeemedPoints: number;
  cashedOutPoints: number;
  pointLiabilityPoints: number;
  pointLiabilityValue: number;
  reversedPoints: number;
  issuedInAppValue: number;
  redeemedInAppValue: number;
  cashedOutValue: number;
  rewardSpendRate: number;
  redemptionRate: number;
  cashoutRate: number;
  reversalRate: number;
  fraudReviewRate: number;
  referralRewardTransactions: number;
  referralConversionRate: number;
  ltvUplift: number;
  issuanceByEventType: PointsEventBreakdownItem[];
  topCampaigns: OwnerPointsCampaignImpact[];
}

export interface PointsRedemptionCommitView {
  balance: PointsBalanceView;
  preview: PointsRedemptionPreview;
  transactions: PointsTransactionRecord[];
}

export interface PointsCashoutRequestView {
  balance: PointsBalanceView;
  preview: PointsCashoutPreview;
  request: CashoutRequestRecord;
}
