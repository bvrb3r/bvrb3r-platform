import type { SubscriptionSummaryView } from "@/types/monetization";
import type { CashoutRequestStatus } from "@/types/points";
import type { BoothRentStatusView } from "@/types/wallet";

export type MoneyTimelineEventType =
  | "booking_created"
  | "payment_authorized"
  | "payment_captured"
  | "platform_fee_taken"
  | "barber_earnings_calculated"
  | "shop_split_applied"
  | "points_redeemed"
  | "points_issued"
  | "payout_eligible"
  | "payout_sent"
  | "payout_completed"
  | "refund_issued"
  | "points_reversed";

export type MoneyTimelineEventStatus = "posted" | "pending" | "blocked";
export type PayoutQueueStatus = "not_ready" | "pending" | "queued" | "in_transit" | "paid" | "failed" | "reversed";
export type BillingInvoiceStatus = "draft" | "open" | "paid" | "failed" | "void" | "uncollectible" | "past_due";
export type ScheduledJobName =
  | "process_payout_eligibility"
  | "process_booth_rent_deductions"
  | "process_platform_subscription_billing"
  | "unlock_pending_points"
  | "expire_points"
  | "process_cashout_queue"
  | "detect_financial_anomalies"
  | "process_growth_automations"
  | "refresh_financial_reporting";
export type ScheduledJobRunStatus = "queued" | "running" | "completed" | "failed" | "skipped";
export type ScheduledJobTriggerSource = "manual" | "scheduled" | "background";
export type FinancialAnomalyType =
  | "payout_stuck"
  | "cashout_stale"
  | "payout_failure"
  | "cashout_failure"
  | "refund_hold_gap"
  | "negative_earnings"
  | "breakdown_mismatch"
  | "points_liability_spike";
export type FinancialAnomalyStatus = "open" | "investigating" | "resolved" | "dismissed";
export type FinancialAnomalySeverity = "low" | "medium" | "high" | "critical";

export interface MoneyTimelineEventView {
  id: string;
  type: MoneyTimelineEventType;
  label: string;
  status: MoneyTimelineEventStatus;
  occurredAt: string | null;
  amount?: number;
  note?: string;
  sourceId?: string;
  metadata: Record<string, unknown>;
}

export interface BookingMoneyTimelineView {
  appointmentId: string;
  currency: string;
  paymentStatus: string | null;
  payoutStatus: PayoutQueueStatus;
  events: MoneyTimelineEventView[];
}

export interface BookingTransactionBreakdownView {
  appointmentId: string;
  currency: string;
  gross: number;
  discounts: number;
  net: number;
  tax: number;
  tip: number;
  total: number;
  platformFee: number;
  processorFee: number;
  barberEarnings: number;
  shopEarnings: number;
  pointsUsed: number;
  pointsEarned: number;
  payoutStatus: PayoutQueueStatus;
}

export interface PayoutVisibilityView {
  appointmentId: string;
  paymentId?: string | null;
  routingRecordId?: string | null;
  status: PayoutQueueStatus;
  eligibleAmount: number;
  thresholdAmount: number;
  thresholdRemaining: number;
  minimumThresholdMet: boolean;
  blockedReasons: string[];
  stripeReady: boolean;
  disputeHold: boolean;
  refundHold: boolean;
  nextAction: string;
  executionCount: number;
  lastUpdatedAt: string | null;
}

export interface ReceiptLineItemView {
  label: string;
  kind: "service" | "add_on" | "discount" | "tax" | "tip" | "points" | "platform_fee" | "barber_earnings" | "shop_earnings";
  amount: number;
}

export interface BookingReceiptView {
  appointmentId: string;
  issuedAt: string;
  clientName: string;
  barberName: string;
  shopLabel: string;
  paymentMethodLabel: string;
  pointsUsed: number;
  pointsEarned: number;
  lines: ReceiptLineItemView[];
  totals: {
    gross: number;
    discounts: number;
    tax: number;
    tip: number;
    total: number;
  };
}

export interface TaxSummaryView {
  role: "barber" | "shop" | "owner";
  subjectId: string;
  year: number;
  gross: number;
  fees: number;
  net: number;
  payouts: number;
  refunds: number;
  pointsIncentiveCost: number;
  platformRevenue: number;
  subscriptionRevenue: number;
  generatedAt: string;
}

export interface BillingInvoiceView {
  id: string;
  subscriptionId: string;
  providerInvoiceId: string;
  status: BillingInvoiceStatus;
  amountDue: number;
  amountPaid: number;
  currency: string;
  hostedInvoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  invoiceCreatedAt: string;
  invoiceDueAt?: string | null;
  paidAt?: string | null;
  attemptCount: number;
  lastError?: string | null;
}

export interface BillingHistoryEventView {
  id: string;
  type:
    | "subscription_started"
    | "subscription_updated"
    | "subscription_cancelled"
    | "invoice_opened"
    | "invoice_paid"
    | "invoice_failed"
    | "billing_retry_requested";
  status: string;
  label: string;
  occurredAt: string;
  amount?: number;
  invoiceId?: string;
  metadata: Record<string, unknown>;
}

export interface BillingHistoryView {
  subscription: SubscriptionSummaryView | null;
  invoices: BillingInvoiceView[];
  history: BillingHistoryEventView[];
  recoveryInvoice: BillingInvoiceView | null;
}

export interface CashoutAuditLogEntryView {
  actorUserId: string;
  actorRole: string;
  action: string;
  createdAt: string;
  note?: string;
  metadata: Record<string, unknown>;
}

export interface CashoutReviewEntryView {
  requestId: string;
  userId: string;
  role: "barber" | "owner";
  userLabel: string;
  pointsRequested: number;
  cashValue: number;
  status: CashoutRequestStatus;
  createdAt: string;
  processedAt?: string | null;
  fraudFlags: string[];
  reviewNote?: string | null;
  payoutReference?: string | null;
  failureReason?: string | null;
  auditLog: CashoutAuditLogEntryView[];
  canReview: boolean;
  canApprove: boolean;
  canReject: boolean;
  canMarkPaid: boolean;
  canMarkFailed: boolean;
  canReverse: boolean;
}

export interface CashoutReviewQueueView {
  summary: {
    requested: number;
    underReview: number;
    approved: number;
    paid: number;
    failed: number;
    rejected: number;
    reversed: number;
  };
  requests: CashoutReviewEntryView[];
}

export interface ScheduledJobRunView {
  id: string;
  jobName: ScheduledJobName;
  scopeKey: string;
  relatedLocationIds: string[];
  status: ScheduledJobRunStatus;
  triggerSource: ScheduledJobTriggerSource;
  actorUserId?: string | null;
  actorRole?: string | null;
  startedAt: string;
  completedAt?: string | null;
  failedAt?: string | null;
  retryCount: number;
  lastError?: string | null;
  resultSummary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface ScheduledJobStatusView {
  summary: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    skipped: number;
  };
  recentRuns: ScheduledJobRunView[];
  latestByJob: Partial<Record<ScheduledJobName, ScheduledJobRunView>>;
}

export interface FinancialAnomalyView {
  id: string;
  dedupeKey: string;
  anomalyType: FinancialAnomalyType;
  status: FinancialAnomalyStatus;
  severity: FinancialAnomalySeverity;
  summary: string;
  description?: string | null;
  locationId?: string | null;
  barberId?: string | null;
  userId?: string | null;
  appointmentId?: string | null;
  paymentId?: string | null;
  cashoutRequestId?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  detectedAt: string;
  resolvedAt?: string | null;
  dismissedAt?: string | null;
  metadata: Record<string, unknown>;
}

export interface FinancialAnomalyQueueView {
  summary: {
    open: number;
    investigating: number;
    resolved: number;
    dismissed: number;
    critical: number;
  };
  items: FinancialAnomalyView[];
}

export interface OwnerMoneyDashboardView {
  revenueBreakdown: {
    grossRevenue: number;
    netRevenue: number;
    platformFeeRevenue: number;
    processorFeeVisibility: number;
    subscriptionRevenue: number;
  };
  payoutFlow: {
    pendingAmount: number;
    queuedAmount: number;
    inTransitAmount: number;
    paidAmount: number;
    failedAmount: number;
    reversedAmount: number;
    avgPayoutDelayHours: number;
  };
  boothRent: {
    paid: number;
    due: number;
    overdue: number;
    overdueAmount: number;
  };
  pointsCostVsRevenue: number;
  refundRate: number;
  revenuePerUser: number;
  barberEarningsGrowth: number;
  cashoutQueue: CashoutReviewQueueView;
  anomalies: FinancialAnomalyQueueView;
  scheduledJobs: ScheduledJobStatusView;
  exports: {
    taxSummaryPath: string;
    payoutsPath: string;
    revenuePath: string;
    incentivesPath: string;
  };
  recentCashouts: CashoutReviewEntryView[];
}

export interface BarberMoneyDashboardView {
  todayEarnings: number;
  pendingPayouts: number;
  completedPayouts: number;
  wallet: {
    pendingBalance: number;
    availableBalance: number;
    currency: string;
    updatedAt: string | null;
  };
  boothRent: BoothRentStatusView;
  pointsEarned: number;
  pointsCashedOut: number;
  tax: TaxSummaryView;
  cashoutSummary: {
    requested: number;
    underReview: number;
    approved: number;
    paid: number;
    failed: number;
    reversed: number;
  };
  payoutVisibility: PayoutVisibilityView[];
  recentCashouts: CashoutReviewEntryView[];
}
