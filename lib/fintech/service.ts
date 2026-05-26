import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  buildPlatformEventIdempotencyKey,
  recordPlatformEvent,
  recordRequiredPlatformEvent
} from "@/lib/core/platform-events";
import { canonicalAppointmentUuid } from "@/lib/booking/canonical-booking";
import {
  calculatePaymentRouting,
  createPayoutExecutionIdempotencyKey,
  derivePayoutExecutionReconciliationStatus,
  deriveOperationalFintechStatus,
  determinePayoutExecutionBlockReason,
  determinePayoutReadiness,
  evaluateLegalAgreementState,
  inferStripeProcessorStatuses,
  normalizeCompensationAssignment,
  normalizeConnectedAccountStatus,
  normalizeLegalAcceptance,
  normalizeRequirementList,
  normalizeRoutingModel,
  PLATFORM_FEE_RATE,
  roundCurrency,
  type AgreementType,
  type BoothRentFrequency,
  type CompensationAssignmentInput,
  type ConnectedAccountStatusInput,
  type FintechLegalReadinessStatus,
  type FintechOnboardingStatus,
  type FintechOperationalStatus,
  type FintechPayoutReadinessStatus,
  type FintechProvider,
  type FintechSubjectType,
  type FintechTaxReadinessStatus,
  type LegalAcceptanceInput,
  type MoneyRoutingStatus,
  type PayoutExecutionReconciliationStatus,
  type PayoutExecutionStatus,
  type PayoutExecutionType,
  type RoutingModel
} from "@/lib/fintech/domain";
import { canTransitionPaymentStatus, type InternalPaymentStatus, type InternalPaymentType } from "@/lib/payments/domain";
import {
  StripeConnectError,
  buildStripeReturnUrl,
  createStripeConnectedAccount,
  createStripeDashboardLoginLink,
  createStripeOnboardingLink,
  getStripeConnectEnvironment,
  getStripeConnectOnboardingPath,
  createStripeTransfer,
  createStripeTransferReversal,
  retrieveStripeConnectedAccount,
  retrieveStripePaymentIntentSettlement,
  verifyStripeWebhookEvent,
  type StripeConnectEnvironmentView
} from "@/lib/stripe/connect";
import { processStripeBillingWebhookEvent } from "@/lib/monetization/service";
import {
  isPayoutReadinessEligible,
  loadPaymentRoutingConstraintEvidence,
  moneyRoutingDbValueForPending,
  payoutReadinessMeaning,
  readinessDbValueForBusinessMeaning,
  reconciliationDbValueForOpen,
  type PaymentRoutingConstraintEvidence
} from "@/lib/architect/mission-control/schema-constraints";
import { syncStripeConnectVerificationLane } from "@/lib/trust/provider-sync";
import { buildPublicTrustSignal, computeShopVerificationDecision, getVerificationGateDecision } from "@/lib/trust/engine";
import { getTrustProvider } from "@/lib/trust/provider";
import { isBarberAccountRole, isShopOwnerRole } from "@/lib/auth/roles";
import { calculateInstantPayoutAmounts } from "@/lib/wallet/domain";
import { syncWalletBalancesForPayment } from "@/lib/wallet/service";
import type { UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone?: string | null;
  role: UserAccount["role"];
};

type BarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
  compensation_model: string;
  commission_rate: number | string | null;
  booth_rent_amount: number | string | null;
  booth_rent_frequency: BoothRentFrequency | null;
};

type LocationRow = {
  id: string;
  reference_code: string | null;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
};

type StaffMembershipRow = {
  id: string;
  profile_id: string;
  location_id: string;
  routing_model: string | null;
  commission_rate: number | string | null;
  booth_rent_amount: number | string | null;
  booth_rent_frequency: BoothRentFrequency | null;
  payout_block_reason: string | null;
  updated_at: string;
  fintech_updated_at: string;
};

type BillingSubscriptionGuardRow = {
  id: string;
  subject_type: "barber" | "shop" | "client";
  barber_id: string | null;
  shop_id: string | null;
  subscription_status: string;
  billing_state: string;
};

type ConnectedAccountRow = {
  id: string;
  subject_type: FintechSubjectType;
  barber_id: string | null;
  shop_id: string | null;
  provider: FintechProvider;
  provider_account_id: string | null;
  onboarding_status: FintechOnboardingStatus;
  payout_readiness_status: FintechPayoutReadinessStatus;
  legal_readiness_status: FintechLegalReadinessStatus;
  tax_readiness_status: FintechTaxReadinessStatus;
  requirements_currently_due: unknown;
  requirements_eventually_due: unknown;
  requirements_past_due: unknown;
  disabled_reason: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  last_checked_at: string | null;
  onboarding_started_at: string | null;
  onboarding_completed_at: string | null;
  processor_last_synced_at: string | null;
  processor_last_event_id: string | null;
  processor_last_event_type: string | null;
  dashboard_last_accessed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type LegalAcceptanceRow = {
  id: string;
  agreement_type: AgreementType;
  agreement_version: string;
  actor_profile_id: string;
  actor_role: UserAccount["role"];
  barber_id: string | null;
  shop_id: string | null;
  accepted_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type PaymentRow = {
  id: string;
  appointment_id: string | null;
  pos_sale_id?: string | null;
  client_id: string | null;
  shop_id: string | null;
  barber_id: string | null;
  provider: string | null;
  provider_payment_intent_id: string | null;
  amount: number | string;
  currency: string;
  status?: string | null;
  payment_status: InternalPaymentStatus | string;
  payment_type: InternalPaymentType;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type AppointmentRow = {
  id: string;
  reference_code: string | null;
  status: string;
  completed_at?: string | null;
  starts_at?: string | null;
  service_id?: string | null;
  membership_id: string | null;
  barber_id: string;
  shop_id: string | null;
  location_id: string;
  client_id: string;
};

type PosSaleRow = {
  id: string;
  status: string;
  payment_method?: string | null;
  barber_id: string;
  shop_id: string | null;
  client_id: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  payment_id: string | null;
  note?: string | null;
  subtotal_cents?: number | string | null;
  amount_cents?: number | string | null;
  total_amount_cents?: number | string | null;
  platform_fee_cents?: number | string | null;
  total_cents: number | string;
  cash_recorded_at?: string | null;
  completed_at?: string | null;
  payment_status?: string | null;
  created_at: string;
  updated_at: string;
};

type PosPaymentRequestRow = {
  id: string;
  pos_sale_id: string;
  barber_id: string;
  client_id: string;
  amount_cents: number | string;
  status: string;
  requested_at: string | null;
  approved_at: string | null;
  declined_at: string | null;
  expires_at: string | null;
  payment_id: string | null;
  message_thread_id: string | null;
  created_at: string;
  updated_at: string;
};

const ACTIVE_POS_PAYMENT_REQUEST_STATUSES = new Set(["pending", "pending_approval", "pending_message_failed", "payment_pending", "pending_client_approval"]);
const CLOSED_DUPLICATE_POS_PAYMENT_REQUEST_STATUSES = new Set(["superseded", "canceled_duplicate"]);
const NO_PAYMENT_POS_PAYMENT_REQUEST_STATUSES = new Set(["declined", "failed", "expired", "canceled", "voided", "superseded", "canceled_duplicate"]);

type ClientDirectoryRow = {
  id: string;
  profile_id: string | null;
  reference_code?: string | null;
};

type BarberTransactionAppointmentRow = Pick<
  AppointmentRow,
  "id" | "reference_code" | "status" | "completed_at" | "starts_at" | "service_id" | "client_id" | "barber_id" | "shop_id" | "location_id"
>;

type ServiceDirectoryRow = {
  id: string;
  name: string | null;
};

type RefundRow = {
  id: string;
  amount: number | string;
};

type PaymentRoutingRow = {
  id: string;
  payment_id: string;
  appointment_id: string | null;
  pos_sale_id?: string | null;
  membership_id: string | null;
  routing_model: RoutingModel;
  payout_recipient_type: "barber" | "shop" | "split";
  provider_gross_amount: number | string;
  refunded_amount: number | string;
  provider_fee_amount: number | string;
  provider_net_amount: number | string;
  platform_fee_amount: number | string;
  barber_payout_amount: number | string;
  shop_split_amount: number | string;
  currency: string;
  payout_readiness_status: FintechPayoutReadinessStatus;
  money_routing_status: MoneyRoutingStatus;
  blocked_reason: string | null;
  eligible_at: string | null;
  held_at: string | null;
  released_at: string | null;
  reversed_at: string | null;
  processor_charge_id: string | null;
  processor_balance_transaction_id: string | null;
  reconciliation_status: PayoutExecutionReconciliationStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type PayoutExecutionRow = {
  id: string;
  routing_record_id: string;
  payment_id: string;
  appointment_id: string | null;
  membership_id: string | null;
  target_subject_type: "barber" | "shop";
  execution_type: PayoutExecutionType;
  target_connected_account_id: string | null;
  target_provider_account_id: string | null;
  amount: number | string;
  currency: string;
  execution_status: PayoutExecutionStatus;
  blocked_reason: string | null;
  failure_reason: string | null;
  processor_transfer_id: string | null;
  processor_reversal_id: string | null;
  idempotency_key: string;
  source_execution_id: string | null;
  source_refund_id: string | null;
  payout_reference: string | null;
  payout_speed: "standard" | "instant";
  instant_payout_fee_amount: number | string;
  net_transfer_amount: number | string;
  processor_payout_id: string | null;
  reconciliation_status: PayoutExecutionReconciliationStatus;
  metadata: Record<string, unknown>;
  initiated_by: string | null;
  attempt_count: number;
  last_attempted_at: string | null;
  executed_at: string | null;
  failed_at: string | null;
  reversed_at: string | null;
  created_at: string;
  updated_at: string;
};

type StripeWebhookEventRow = {
  id: string;
  stripe_event_id: string;
  stripe_account_id: string | null;
  connected_account_id: string | null;
  event_type: string;
  livemode: boolean;
  api_version: string | null;
  processing_status: "received" | "processed" | "ignored" | "failed";
  attempt_count: number;
  payload_excerpt: Record<string, unknown>;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
  updated_at: string;
};

type FintechActorContext = {
  profile: ProfileRow;
  role: UserAccount["role"];
  locationIds: string[];
  barber: BarberRow | null;
};

type ConnectedAccountState = {
  row: ConnectedAccountRow;
  missingAgreements: AgreementType[];
  outdatedAgreements: AgreementType[];
  missingSteps: string[];
};

export type LegalAcceptanceView = {
  agreementType: AgreementType;
  agreementVersion: string;
  acceptedAt: string;
};

export type ConnectedAccountReadinessView = {
  id: string;
  subjectType: FintechSubjectType;
  provider: FintechProvider;
  operationalStatus: FintechOperationalStatus;
  providerAccountId: string | null;
  onboardingStatus: FintechOnboardingStatus;
  payoutReadinessStatus: FintechPayoutReadinessStatus;
  legalReadinessStatus: FintechLegalReadinessStatus;
  taxReadinessStatus: FintechTaxReadinessStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsCurrentlyDue: string[];
  requirementsEventuallyDue: string[];
  requirementsPastDue: string[];
  missingAgreements: AgreementType[];
  outdatedAgreements: AgreementType[];
  missingSteps: string[];
  disabledReason: string | null;
  lastCheckedAt: string | null;
  onboardingStartedAt: string | null;
  onboardingCompletedAt: string | null;
  processorLastSyncedAt: string | null;
  processorLastEventId: string | null;
  processorLastEventType: string | null;
  dashboardLastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MembershipCompensationView = {
  id: string;
  barberId: string;
  barberName: string;
  shopId: string;
  shopLabel: string;
  routingModel: RoutingModel;
  commissionRate: number | null;
  boothRentAmount: number | null;
  boothRentFrequency: BoothRentFrequency | null;
  payoutBlockReason: string | null;
  updatedAt: string;
};

export type FintechRoutingView = {
  id: string;
  paymentId: string;
  appointmentId: string | null;
  posSaleId?: string | null;
  barberName: string | null;
  shopLabel: string | null;
  routingModel: RoutingModel;
  paymentType: InternalPaymentType;
  paymentStatus: InternalPaymentStatus;
  providerGrossAmount: number;
  refundedAmount: number;
  processorFeeAmount: number;
  providerNetAmount: number;
  platformFeeAmount: number;
  barberPayoutAmount: number;
  shopSplitAmount: number;
  payoutReadinessStatus: FintechPayoutReadinessStatus;
  moneyRoutingStatus: MoneyRoutingStatus;
  reconciliationStatus: PayoutExecutionReconciliationStatus;
  blockedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FintechManagementAccountView = ConnectedAccountReadinessView & {
  displayName: string;
  shopId: string | null;
  shopLabel: string | null;
  barberId: string | null;
  barberName: string | null;
};

export type FintechManagementPayload = {
  summary: {
    totalAccounts: number;
    readyAccounts: number;
    blockedAccounts: number;
    needsAttentionAccounts: number;
    notReadyAccounts: number;
    blockedRoutingRecords: number;
    readyForPayoutAmount: number;
  };
  shops: FintechManagementAccountView[];
  barbers: FintechManagementAccountView[];
  memberships: MembershipCompensationView[];
  blockedPayments: FintechRoutingView[];
};

export type BarberFintechMembershipView = MembershipCompensationView & {
  shopAccount: ConnectedAccountReadinessView | null;
};

export type BarberFintechReadinessPayload = {
  barberId: string;
  barberName: string;
  connectedAccount: ConnectedAccountReadinessView;
  stripeEnvironment: StripeConnectEnvironmentView;
  agreements: LegalAcceptanceView[];
  memberships: BarberFintechMembershipView[];
  routingSummary: {
    blockedPaymentsCount: number;
    pendingPaymentsCount: number;
    readyForPayoutAmount: number;
    blockedReasons: string[];
  };
  blockedPayments: FintechRoutingView[];
};

export type PayoutExecutionView = {
  id: string;
  routingRecordId: string;
  paymentId: string;
  appointmentId: string | null;
  targetSubjectType: "barber" | "shop";
  targetDisplayName: string | null;
  barberName: string | null;
  shopLabel: string | null;
  routingModel: RoutingModel;
  executionType: PayoutExecutionType;
  executionStatus: PayoutExecutionStatus;
  reconciliationStatus: PayoutExecutionReconciliationStatus;
  amount: number;
  payoutReference: string | null;
  payoutSpeed: "standard" | "instant";
  instantPayoutFeeAmount: number;
  netTransferAmount: number;
  currency: string;
  blockedReason: string | null;
  failureReason: string | null;
  processorTransferId: string | null;
  processorPayoutId: string | null;
  processorReversalId: string | null;
  providerFeeAmount: number;
  platformFeeAmount: number;
  createdAt: string;
  executedAt: string | null;
  failedAt: string | null;
  reversedAt: string | null;
};

export type FintechPayoutsPayload = {
  summary: {
    executableRoutingRecords: number;
    eligibleRoutingRecords: number;
    readyForPayoutAmount: number;
    eligiblePayoutAmount: number;
    blockedExecutionRecords: number;
    failedExecutionRecords: number;
    executedTransferCount: number;
    reversedExecutionCount: number;
    executedAmount: number;
    reversedAmount: number;
    processorFeeTracked: number;
  };
  readyRouting: FintechRoutingView[];
  recentExecutions: PayoutExecutionView[];
};

export type BarberPayoutsPayload = {
  summary: {
    executableRoutingRecords: number;
    eligibleRoutingRecords: number;
    readyForPayoutAmount: number;
    eligiblePayoutAmount: number;
    blockedExecutionRecords: number;
    failedExecutionRecords: number;
    executedTransferCount: number;
    reversedExecutionCount: number;
    executedAmount: number;
    reversedAmount: number;
  };
  moneyPosture: {
    cashCollectedToday: number;
    cardAppCollectedToday: number;
    appPayoutEligible: number;
    grossTotalToday: number;
    paidAppointmentsCount: number;
    cashSalesCount: number;
    cardPosSalesCount: number;
    pendingPaymentRequestsCount: number;
    releasedPayoutAmount: number;
  };
  transactions: Array<{
    id: string;
    transactionType: "appointment" | "pos_cash" | "pos_card" | "pos_request";
    sourceId: string;
    appointmentId: string | null;
    posSaleId: string | null;
    paymentId: string | null;
    requestId: string | null;
    messageThreadId: string | null;
    clientId: string | null;
    clientProfileId: string | null;
    customerName: string;
    customerPhone: string | null;
    customerEmail: string | null;
    serviceLabel: string;
    note: string | null;
    occurredAt: string;
    paymentMethodLabel: string;
    grossAmount: number;
    platformFeeAmount: number;
    barberPayoutAmount: number | null;
    status: string;
    statusLabel: string;
    postureLabel: string;
    canMessage: boolean;
  }>;
  salesTrend: {
    today: SalesTrendPoint[];
    week: SalesTrendPoint[];
    month: SalesTrendPoint[];
    year: SalesTrendPoint[];
  };
  recentExecutions: PayoutExecutionView[];
};

export type SalesTrendPoint = {
  label: string;
  cashCents: number;
  cardAppCents: number;
  grossCents: number;
};

export type ExecuteFintechPayoutsResult = {
  summary: {
    executed: number;
    blocked: number;
    failed: number;
    skipped: number;
    reversed: number;
  };
  recentExecutions: PayoutExecutionView[];
};

export type StripeConnectSessionResult = {
  account: ConnectedAccountReadinessView;
  url: string;
};

export type StripeWebhookSyncResult = {
  received: boolean;
  duplicate: boolean;
  status: "processed" | "ignored";
};

export class FintechServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const CONNECTED_ACCOUNT_SELECT = "id, subject_type, barber_id, shop_id, provider, provider_account_id, onboarding_status, payout_readiness_status, legal_readiness_status, tax_readiness_status, requirements_currently_due, requirements_eventually_due, requirements_past_due, disabled_reason, charges_enabled, payouts_enabled, last_checked_at, onboarding_started_at, onboarding_completed_at, processor_last_synced_at, processor_last_event_id, processor_last_event_type, dashboard_last_accessed_at, created_by, created_at, updated_at";
const PAYMENT_SELECT = "id, appointment_id, pos_sale_id, client_id, shop_id, barber_id, provider, provider_payment_intent_id, amount, currency, status, payment_status, payment_type, paid_at, created_at, updated_at";
const PAYMENT_ROUTING_SELECT = "id, payment_id, appointment_id, pos_sale_id, membership_id, routing_model, payout_recipient_type, provider_gross_amount, refunded_amount, provider_fee_amount, provider_net_amount, platform_fee_amount, barber_payout_amount, shop_split_amount, currency, payout_readiness_status, money_routing_status, blocked_reason, eligible_at, held_at, released_at, reversed_at, processor_charge_id, processor_balance_transaction_id, reconciliation_status, metadata, created_at, updated_at";
const PAYOUT_EXECUTION_SELECT = "id, routing_record_id, payment_id, appointment_id, membership_id, target_subject_type, execution_type, target_connected_account_id, target_provider_account_id, amount, currency, execution_status, blocked_reason, failure_reason, processor_transfer_id, processor_reversal_id, idempotency_key, source_execution_id, source_refund_id, payout_reference, payout_speed, instant_payout_fee_amount, net_transfer_amount, processor_payout_id, reconciliation_status, metadata, initiated_by, attempt_count, last_attempted_at, executed_at, failed_at, reversed_at, created_at, updated_at";
const POS_SALE_SELECT = "id, barber_id, shop_id, client_id, customer_name, customer_phone, customer_email, source, status, payment_method, payment_status, subtotal_cents, discount_cents, tip_cents, platform_fee_cents, client_fee_cents, total_cents, amount_cents, total_amount_cents, payment_id, note, cash_recorded_at, completed_at, created_at, updated_at";
const POS_PAYMENT_REQUEST_SELECT = "id, pos_sale_id, barber_id, client_id, amount_cents, status, requested_at, approved_at, declined_at, expires_at, payment_id, message_thread_id, created_at, updated_at";

function numeric(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function routingAllowedValues(evidence: PaymentRoutingConstraintEvidence, column: keyof PaymentRoutingConstraintEvidence["allowedValues"]) {
  return new Set(evidence.allowedValues[column].map((value) => value.toLowerCase()));
}

function readinessDbValueForStatus(
  evidence: PaymentRoutingConstraintEvidence,
  status: FintechPayoutReadinessStatus
): FintechPayoutReadinessStatus {
  const allowed = routingAllowedValues(evidence, "payout_readiness_status");
  const normalized = String(status ?? "").toLowerCase();
  if (allowed.has(normalized)) {
    return normalized as FintechPayoutReadinessStatus;
  }

  if (normalized === "eligible" || normalized === "ready") {
    return readinessDbValueForBusinessMeaning(evidence, "eligible") as FintechPayoutReadinessStatus;
  }

  if (normalized === "blocked" || normalized === "needs_attention") {
    return readinessDbValueForBusinessMeaning(evidence, "blocked") as FintechPayoutReadinessStatus;
  }

  return readinessDbValueForBusinessMeaning(evidence, "pending") as FintechPayoutReadinessStatus;
}

function moneyRoutingDbValueForStatus(
  evidence: PaymentRoutingConstraintEvidence,
  status: MoneyRoutingStatus
): MoneyRoutingStatus {
  const allowed = routingAllowedValues(evidence, "money_routing_status");
  const normalized = String(status ?? "").toLowerCase();
  if (allowed.has(normalized)) {
    return normalized as MoneyRoutingStatus;
  }

  if (normalized === "refunded" && allowed.has("manual_review")) {
    return "manual_review";
  }

  if (normalized === "blocked" && allowed.has("blocked")) {
    return "blocked";
  }

  return moneyRoutingDbValueForPending(evidence) as MoneyRoutingStatus;
}

function reconciliationDbValueForStatus(
  evidence: PaymentRoutingConstraintEvidence,
  status: PayoutExecutionReconciliationStatus | string
): PayoutExecutionReconciliationStatus {
  const allowed = routingAllowedValues(evidence, "reconciliation_status");
  const normalized = String(status ?? "").toLowerCase();
  if (allowed.has(normalized)) {
    return normalized as PayoutExecutionReconciliationStatus;
  }

  return reconciliationDbValueForOpen(evidence) as PayoutExecutionReconciliationStatus;
}

const COMPLETION_PAYMENT_SUCCESS_STATUSES = new Set(["captured", "succeeded", "paid", "completed"]);

function getPaymentStatusForCompletion(payment: Pick<PaymentRow, "payment_status" | "status"> | null | undefined) {
  return String(payment?.payment_status ?? payment?.status ?? "").toLowerCase();
}

function isCompletionPaymentSuccessful(payment: Pick<PaymentRow, "payment_status" | "status"> | null | undefined) {
  const paymentStatus = String(payment?.payment_status ?? "").toLowerCase();
  const legacyStatus = String(payment?.status ?? "").toLowerCase();
  return COMPLETION_PAYMENT_SUCCESS_STATUSES.has(paymentStatus) || COMPLETION_PAYMENT_SUCCESS_STATUSES.has(legacyStatus);
}

function normalizePaymentStatusForRouting(payment: PaymentRow): InternalPaymentStatus {
  if (isCompletionPaymentSuccessful(payment)) {
    return "captured";
  }

  const paymentStatus = String(payment.payment_status ?? payment.status ?? "").toLowerCase();
  if (paymentStatus === "refunded" || paymentStatus === "partially_refunded" || paymentStatus === "failed" || paymentStatus === "voided" || paymentStatus === "authorized" || paymentStatus === "pending") {
    return paymentStatus;
  }

  return "pending";
}

function getWebhookEventTimestamp(event: Stripe.Event) {
  return new Date(event.created * 1000).toISOString();
}

function getPaymentPlatformEventType(status: InternalPaymentStatus) {
  if (status === "captured" || status === "partially_refunded") {
    return "payment_succeeded" as const;
  }

  if (status === "failed") {
    return "payment_failed" as const;
  }

  return null;
}

function getSupabaseOrThrow() {
  if (!isSupabaseEnabled()) {
    throw new FintechServiceError("Fintech readiness is only available when Supabase is configured.", 503);
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new FintechServiceError("Fintech readiness is only available when Supabase is configured.", 503);
  }

  return supabase;
}

async function resolveStripeWebhookPayment(
  supabase: SupabaseClient,
  input: {
    paymentIntentId?: string | null;
    chargeId?: string | null;
  }
) {
  if (input.paymentIntentId?.trim()) {
    const paymentResult = await supabase
      .from("payments")
      .select(PAYMENT_SELECT)
      .eq("provider", "stripe")
      .eq("provider_payment_intent_id", input.paymentIntentId)
      .maybeSingle();

    if (paymentResult.error) {
      throw new FintechServiceError("Unable to map the Stripe payment intent into canonical payment state.", 500);
    }

    if (paymentResult.data) {
      return paymentResult.data as PaymentRow;
    }
  }

  if (input.chargeId?.trim()) {
    const routingResult = await supabase
      .from("payment_routing_records")
      .select(PAYMENT_ROUTING_SELECT)
      .eq("processor_charge_id", input.chargeId)
      .maybeSingle();

    if (routingResult.error) {
      throw new FintechServiceError("Unable to map the Stripe charge into canonical payment state.", 500);
    }

    const routing = (routingResult.data as PaymentRoutingRow | null) ?? null;
    if (!routing?.payment_id) {
      return null;
    }

    const paymentResult = await supabase
      .from("payments")
      .select(PAYMENT_SELECT)
      .eq("id", routing.payment_id)
      .maybeSingle();

    if (paymentResult.error) {
      throw new FintechServiceError("Unable to load the payment linked to the Stripe charge.", 500);
    }

    return (paymentResult.data as PaymentRow | null) ?? null;
  }

  return null;
}

export async function syncStripeWebhookPaymentStatus(
  supabase: SupabaseClient,
  payment: PaymentRow,
  nextStatus: Extract<InternalPaymentStatus, "captured" | "failed">,
  input: {
    event: Stripe.Event;
    processorChargeId?: string | null;
    skipRoutingSync?: boolean;
  }
) {
  const currentStatus = normalizePaymentStatusForRouting(payment);
  if (currentStatus === nextStatus || !canTransitionPaymentStatus(currentStatus, nextStatus)) {
    return payment;
  }

  const occurredAt = getWebhookEventTimestamp(input.event);
  const updateResult = await supabase
    .from("payments")
    .update({
      payment_status: nextStatus,
      status: nextStatus,
      paid_at: nextStatus === "captured" ? payment.paid_at ?? occurredAt : payment.paid_at,
      updated_at: occurredAt
    })
    .eq("id", payment.id)
    .select(PAYMENT_SELECT)
    .single();

  if (updateResult.error) {
    throw new FintechServiceError("Unable to persist the Stripe webhook payment status.", 500);
  }

  const updatedPayment = updateResult.data as PaymentRow;
  if (!input.skipRoutingSync) {
    await syncPaymentRoutingRecord(supabase, updatedPayment.id, {
      processorChargeId: input.processorChargeId ?? undefined
    });
  }

  const eventType = getPaymentPlatformEventType(normalizePaymentStatusForRouting(updatedPayment));
  if (eventType) {
    await recordRequiredPlatformEvent(supabase, {
      eventType,
      entityType: "payment",
      entityId: updatedPayment.id,
      actorId: updatedPayment.client_id ?? updatedPayment.barber_id ?? updatedPayment.shop_id ?? null,
      source: "webhook",
      relatedIds: {
        paymentId: updatedPayment.id,
        appointmentId: updatedPayment.appointment_id,
        clientId: updatedPayment.client_id,
        barberId: updatedPayment.barber_id,
        shopId: updatedPayment.shop_id,
        providerPaymentIntentId: updatedPayment.provider_payment_intent_id,
        processorChargeId: input.processorChargeId ?? null
      },
      payload: {
        paymentStatus: updatedPayment.payment_status,
        paymentType: updatedPayment.payment_type,
        provider: updatedPayment.provider,
        amount: numeric(updatedPayment.amount),
        currency: updatedPayment.currency,
        paidAt: updatedPayment.paid_at,
        webhookEventId: input.event.id,
        webhookEventType: input.event.type
      },
      idempotencyKey: buildPlatformEventIdempotencyKey(["payment", updatedPayment.id, input.event.id, eventType]),
      occurredAt
    });
  }

  return updatedPayment;
}

async function recordDisputeLifecyclePlatformEvent(
  supabase: SupabaseClient,
  input: {
    eventType: "dispute_created" | "dispute_resolved";
    disputeId: string;
    payment: PaymentRow | null;
    appointmentReference: string | null;
    locationReference: string | null;
    disputeType: string | null;
    disputeStatus: string;
    summary: string;
    occurredAt: string;
  }
) {
  await recordRequiredPlatformEvent(supabase, {
    eventType: input.eventType,
    entityType: "dispute",
    entityId: input.disputeId,
    actorId: input.payment?.client_id ?? input.payment?.barber_id ?? input.payment?.shop_id ?? null,
    source: "webhook",
    relatedIds: {
      disputeId: input.disputeId,
      paymentId: input.payment?.id ?? null,
      appointmentId: input.appointmentReference,
      locationId: input.locationReference,
      barberId: input.payment?.barber_id ?? null,
      shopId: input.payment?.shop_id ?? null
    },
    payload: {
      disputeType: input.disputeType,
      disputeStatus: input.disputeStatus,
      summary: input.summary
    },
    idempotencyKey: buildPlatformEventIdempotencyKey(["dispute", input.disputeId, input.eventType]),
    occurredAt: input.occurredAt
  });
}

async function readTrustStateSafe() {
  try {
    const trustProvider = await getTrustProvider();
    return await trustProvider.readState();
  } catch (error) {
    console.error("[fintech-service] verification trust state unavailable", {
      message: error instanceof Error ? error.message : String(error)
    });
    return undefined;
  }
}

function isManagementRole(role: UserAccount["role"]) {
  return isShopOwnerRole(role) || role === "manager";
}

function formatShopLabel(location: Pick<LocationRow, "name" | "neighborhood" | "city" | "state">) {
  const area = [location.neighborhood, location.city].filter(Boolean).join(" / ");
  return area ? `${location.name} / ${area}` : [location.name, location.state].filter(Boolean).join(" / ");
}

function mapAgreementView(row: LegalAcceptanceRow): LegalAcceptanceView {
  return {
    agreementType: row.agreement_type,
    agreementVersion: row.agreement_version,
    acceptedAt: row.accepted_at
  };
}

async function resolveActor(user: UserAccount, supabase: SupabaseClient): Promise<FintechActorContext> {
  const profileResult = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("email", user.email)
    .maybeSingle();

  if (profileResult.error) {
    throw new FintechServiceError("Unable to resolve the fintech profile.", 500);
  }

  if (!profileResult.data) {
    throw new FintechServiceError("No fintech profile is available for this account.", 404);
  }

  let barber: BarberRow | null = null;
  if (isBarberAccountRole(user.role)) {
    const barberResult = await supabase
      .from("barbers")
      .select("id, reference_code, profile_id, compensation_model, commission_rate, booth_rent_amount, booth_rent_frequency")
      .eq("profile_id", profileResult.data.id)
      .maybeSingle();

    if (barberResult.error) {
      throw new FintechServiceError("Unable to resolve the barber payout profile.", 500);
    }

    if (!barberResult.data) {
      throw new FintechServiceError("No barber payout profile is available for this account.", 404);
    }

    barber = barberResult.data as BarberRow;
  }

  return {
    profile: profileResult.data as ProfileRow,
    role: user.role,
    locationIds: user.locationIds,
    barber
  };
}

function assertManagementActor(actor: FintechActorContext) {
  if (!isManagementRole(actor.role)) {
    throw new FintechServiceError("Only owner and manager roles can manage payout readiness.", 403);
  }
}

function assertBarberActor(actor: FintechActorContext) {
  if (!isBarberAccountRole(actor.role) || !actor.barber) {
    throw new FintechServiceError("Only barbers can access payout readiness.", 403);
  }
}

function isLocationReadableByActor(actor: FintechActorContext, locationId: string) {
  return isShopOwnerRole(actor.role) || actor.locationIds.length === 0 || actor.locationIds.includes(locationId);
}

type StripeConnectSubjectResolution = {
  subjectType: FintechSubjectType;
  barberId: string | null;
  shopId: string | null;
  barber: BarberRow | null;
  location: LocationRow | null;
  displayName: string;
  email: string;
  createdBy: string;
};

function toFintechServiceError(error: unknown, fallbackMessage: string, status = 502) {
  if (error instanceof FintechServiceError) {
    return error;
  }

  if (error instanceof StripeConnectError) {
    return new FintechServiceError(error.message, error.status);
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return new FintechServiceError(message || fallbackMessage, status);
}

async function resolveStripeConnectSubject(
  actor: FintechActorContext,
  supabase: SupabaseClient,
  input?: {
    subjectType?: FintechSubjectType;
    shopId?: string | null;
  }
): Promise<StripeConnectSubjectResolution> {
  if (isBarberAccountRole(actor.role)) {
    assertBarberActor(actor);

    if (input?.subjectType && input.subjectType !== "barber") {
      throw new FintechServiceError("Barbers can only manage their own connected account.", 403);
    }

    return {
      subjectType: "barber",
      barberId: actor.barber!.id,
      shopId: null,
      barber: actor.barber!,
      location: null,
      displayName: actor.profile.full_name ?? actor.profile.email,
      email: actor.profile.email,
      createdBy: actor.profile.id
    };
  }

  assertManagementActor(actor);
  const shopId = input?.shopId?.trim() || null;
  if (!shopId) {
    throw new FintechServiceError("A shop is required for Stripe Connect management actions.", 400);
  }

  if (!isLocationReadableByActor(actor, shopId)) {
    throw new FintechServiceError("This shop is outside the viewer's scope.", 403);
  }

  const locationResult = await supabase
    .from("locations")
    .select("id, reference_code, name, neighborhood, city, state")
    .eq("id", shopId)
    .maybeSingle();

  if (locationResult.error) {
    throw new FintechServiceError("Unable to load the shop for Stripe Connect.", 500);
  }

  if (!locationResult.data) {
    throw new FintechServiceError("Shop not found for Stripe Connect.", 404);
  }

  return {
    subjectType: "shop",
    barberId: null,
    shopId,
    barber: null,
    location: locationResult.data as LocationRow,
    displayName: (locationResult.data as LocationRow).name,
    email: actor.profile.email,
    createdBy: actor.profile.id
  };
}

async function loadLocationsInScope(actor: FintechActorContext, supabase: SupabaseClient) {
  const query = isShopOwnerRole(actor.role) || actor.locationIds.length === 0
    ? supabase.from("locations").select("id, reference_code, name, neighborhood, city, state").order("name")
    : supabase.from("locations").select("id, reference_code, name, neighborhood, city, state").in("id", actor.locationIds).order("name");

  const result = await query;
  if (result.error) {
    throw new FintechServiceError("Unable to load the payout-ready shop scope.", 500);
  }

  return (result.data ?? []) as LocationRow[];
}

async function loadMembershipsForLocations(locationIds: string[], supabase: SupabaseClient) {
  if (!locationIds.length) {
    return [] as StaffMembershipRow[];
  }

  const result = await supabase
    .from("staff_locations")
    .select("id, profile_id, location_id, routing_model, commission_rate, booth_rent_amount, booth_rent_frequency, payout_block_reason, updated_at, fintech_updated_at")
    .in("location_id", locationIds)
    .order("updated_at", { ascending: false });

  if (result.error) {
    throw new FintechServiceError("Unable to load shop compensation assignments.", 500);
  }

  return (result.data ?? []) as StaffMembershipRow[];
}

async function loadMembershipsForBarber(profileId: string, supabase: SupabaseClient) {
  const result = await supabase
    .from("staff_locations")
    .select("id, profile_id, location_id, routing_model, commission_rate, booth_rent_amount, booth_rent_frequency, payout_block_reason, updated_at, fintech_updated_at")
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false });

  if (result.error) {
    throw new FintechServiceError("Unable to load the barber compensation assignments.", 500);
  }

  return (result.data ?? []) as StaffMembershipRow[];
}

async function loadBarbersByProfileIds(profileIds: string[], supabase: SupabaseClient) {
  if (!profileIds.length) {
    return [] as BarberRow[];
  }

  const result = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id, compensation_model, commission_rate, booth_rent_amount, booth_rent_frequency")
    .in("profile_id", profileIds);

  if (result.error) {
    throw new FintechServiceError("Unable to load barbers for payout readiness.", 500);
  }

  return (result.data ?? []) as BarberRow[];
}

async function loadBarbersByIds(barberIds: string[], supabase: SupabaseClient) {
  if (!barberIds.length) {
    return [] as BarberRow[];
  }

  const result = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id, compensation_model, commission_rate, booth_rent_amount, booth_rent_frequency")
    .in("id", barberIds);

  if (result.error) {
    throw new FintechServiceError("Unable to load barbers for payout execution.", 500);
  }

  return (result.data ?? []) as BarberRow[];
}

async function loadProfiles(profileIds: string[], supabase: SupabaseClient) {
  if (!profileIds.length) {
    return [] as ProfileRow[];
  }

  const result = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .in("id", profileIds);

  if (result.error) {
    throw new FintechServiceError("Unable to load the fintech actor directory.", 500);
  }

  return (result.data ?? []) as ProfileRow[];
}

async function ensureConnectedAccounts(
  supabase: SupabaseClient,
  input: {
    barberIds?: string[];
    shopIds?: string[];
    createdBy?: string | null;
  }
) {
  const barberIds = [...new Set((input.barberIds ?? []).filter(Boolean))];
  const shopIds = [...new Set((input.shopIds ?? []).filter(Boolean))];
  const existingRows: ConnectedAccountRow[] = [];

  if (barberIds.length) {
    const result = await supabase
      .from("connected_accounts")
      .select(CONNECTED_ACCOUNT_SELECT)
      .in("barber_id", barberIds);
    if (result.error) {
      throw new FintechServiceError("Unable to inspect barber connected accounts.", 500);
    }
    existingRows.push(...((result.data ?? []) as ConnectedAccountRow[]));
  }

  if (shopIds.length) {
    const result = await supabase
      .from("connected_accounts")
      .select(CONNECTED_ACCOUNT_SELECT)
      .in("shop_id", shopIds);
    if (result.error) {
      throw new FintechServiceError("Unable to inspect shop connected accounts.", 500);
    }
    existingRows.push(...((result.data ?? []) as ConnectedAccountRow[]));
  }

  const existingBarberIds = new Set(existingRows.map((row) => row.barber_id).filter(Boolean) as string[]);
  const existingShopIds = new Set(existingRows.map((row) => row.shop_id).filter(Boolean) as string[]);
  const inserts: Array<Record<string, unknown>> = [];

  for (const barberId of barberIds) {
    if (!existingBarberIds.has(barberId)) {
      inserts.push({
        subject_type: "barber",
        barber_id: barberId,
        provider: "stripe_connect",
        created_by: input.createdBy ?? null,
        updated_at: new Date().toISOString()
      });
    }
  }

  for (const shopId of shopIds) {
    if (!existingShopIds.has(shopId)) {
      inserts.push({
        subject_type: "shop",
        shop_id: shopId,
        provider: "stripe_connect",
        created_by: input.createdBy ?? null,
        updated_at: new Date().toISOString()
      });
    }
  }

  if (inserts.length) {
    const insertResult = await supabase.from("connected_accounts").insert(inserts);
    if (insertResult.error) {
      throw new FintechServiceError("Unable to seed the payout-readiness records.", 500);
    }
  }
}

async function loadConnectedAccountsForScope(
  supabase: SupabaseClient,
  input: {
    barberIds?: string[];
    shopIds?: string[];
  }
) {
  const barberIds = [...new Set((input.barberIds ?? []).filter(Boolean))];
  const shopIds = [...new Set((input.shopIds ?? []).filter(Boolean))];
  const rows: ConnectedAccountRow[] = [];

  if (barberIds.length) {
    const result = await supabase
      .from("connected_accounts")
      .select(CONNECTED_ACCOUNT_SELECT)
      .in("barber_id", barberIds);
    if (result.error) {
      throw new FintechServiceError("Unable to load barber connected accounts.", 500);
    }
    rows.push(...((result.data ?? []) as ConnectedAccountRow[]));
  }

  if (shopIds.length) {
    const result = await supabase
      .from("connected_accounts")
      .select(CONNECTED_ACCOUNT_SELECT)
      .in("shop_id", shopIds);
    if (result.error) {
      throw new FintechServiceError("Unable to load shop connected accounts.", 500);
    }
    rows.push(...((result.data ?? []) as ConnectedAccountRow[]));
  }

  return rows;
}

async function loadLegalAcceptancesForScope(
  supabase: SupabaseClient,
  input: {
    barberIds?: string[];
    shopIds?: string[];
  }
) {
  const barberIds = [...new Set((input.barberIds ?? []).filter(Boolean))];
  const shopIds = [...new Set((input.shopIds ?? []).filter(Boolean))];
  const rows: LegalAcceptanceRow[] = [];

  if (barberIds.length) {
    const result = await supabase
      .from("legal_acceptances")
      .select("id, agreement_type, agreement_version, actor_profile_id, actor_role, barber_id, shop_id, accepted_at, metadata, created_at")
      .in("barber_id", barberIds)
      .order("accepted_at", { ascending: false });
    if (result.error) {
      throw new FintechServiceError("Unable to load barber legal acceptances.", 500);
    }
    rows.push(...((result.data ?? []) as LegalAcceptanceRow[]));
  }

  if (shopIds.length) {
    const result = await supabase
      .from("legal_acceptances")
      .select("id, agreement_type, agreement_version, actor_profile_id, actor_role, barber_id, shop_id, accepted_at, metadata, created_at")
      .in("shop_id", shopIds)
      .order("accepted_at", { ascending: false });
    if (result.error) {
      throw new FintechServiceError("Unable to load shop legal acceptances.", 500);
    }
    rows.push(...((result.data ?? []) as LegalAcceptanceRow[]));
  }

  return rows;
}

function acceptanceKey(subjectType: FintechSubjectType, subjectId: string, agreementType: AgreementType) {
  return `${subjectType}:${subjectId}:${agreementType}`;
}

function latestAcceptancesForSubject(
  subjectType: FintechSubjectType,
  subjectId: string,
  rows: LegalAcceptanceRow[]
) {
  const latest = new Map<string, LegalAcceptanceRow>();

  for (const row of rows) {
    const rowSubjectId = subjectType === "barber" ? row.barber_id : row.shop_id;
    if (rowSubjectId !== subjectId) {
      continue;
    }

    const key = acceptanceKey(subjectType, subjectId, row.agreement_type);
    if (!latest.has(key)) {
      latest.set(key, row);
    }
  }

  return [...latest.values()].sort((left, right) => right.accepted_at.localeCompare(left.accepted_at));
}

async function syncConnectedAccountState(
  supabase: SupabaseClient,
  account: ConnectedAccountRow,
  acceptances: LegalAcceptanceRow[]
) {
  const subjectId = account.subject_type === "barber" ? account.barber_id : account.shop_id;
  if (!subjectId) {
    throw new FintechServiceError("Connected account subject is incomplete.", 500);
  }

  const latestAcceptances = latestAcceptancesForSubject(account.subject_type, subjectId, acceptances);
  const acceptedVersions = latestAcceptances.reduce((record, row) => {
    record[row.agreement_type] = row.agreement_version;
    return record;
  }, {} as Partial<Record<AgreementType, string>>);
  const legalState = evaluateLegalAgreementState(account.subject_type, acceptedVersions);
  const requirementsCurrentlyDue = normalizeRequirementList(account.requirements_currently_due as string[] | string | null);
  const requirementsPastDue = normalizeRequirementList(account.requirements_past_due as string[] | string | null);
  const payoutReadinessStatus = determinePayoutReadiness({
    onboardingStatus: account.onboarding_status,
    legalReadinessStatus: legalState.legalReadinessStatus,
    taxReadinessStatus: account.tax_readiness_status,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    requirementsCurrentlyDue,
    requirementsPastDue,
    disabledReason: account.disabled_reason
  });

  const updatedAt = new Date().toISOString();
  if (
    account.legal_readiness_status !== legalState.legalReadinessStatus
    || account.payout_readiness_status !== payoutReadinessStatus
  ) {
    const updateResult = await supabase
      .from("connected_accounts")
      .update({
        legal_readiness_status: legalState.legalReadinessStatus,
        payout_readiness_status: payoutReadinessStatus,
        updated_at: updatedAt
      })
      .eq("id", account.id);

    if (updateResult.error) {
      throw new FintechServiceError("Unable to sync the payout-readiness state.", 500);
    }

    account = {
      ...account,
      legal_readiness_status: legalState.legalReadinessStatus,
      payout_readiness_status: payoutReadinessStatus,
      updated_at: updatedAt
    };
  }

  const missingSteps = [
    ...legalState.missingAgreements.map((agreementType) => `Legal acceptance missing: ${agreementType.replaceAll("_", " ")}`),
    ...legalState.outdatedAgreements.map((agreementType) => `Agreement update required: ${agreementType.replaceAll("_", " ")}`),
    ...requirementsPastDue.map((entry) => `Past due requirement: ${entry}`),
    ...requirementsCurrentlyDue.map((entry) => `Current requirement: ${entry}`)
  ];

  if (account.provider === "stripe_connect" && !account.provider_account_id) {
    missingSteps.unshift("Stripe onboarding has not started.");
  }

  if (account.provider === "stripe_connect" && account.provider_account_id && !account.charges_enabled && !account.payouts_enabled) {
    missingSteps.push("Stripe account verification is still pending.");
  }

  if (account.disabled_reason) {
    missingSteps.push(account.disabled_reason);
  }

  return {
    row: account,
    missingAgreements: legalState.missingAgreements,
    outdatedAgreements: legalState.outdatedAgreements,
    missingSteps
  } satisfies ConnectedAccountState;
}

function mapConnectedAccountView(state: ConnectedAccountState): ConnectedAccountReadinessView {
  const requirementsCurrentlyDue = normalizeRequirementList(state.row.requirements_currently_due as string[] | string | null);
  const requirementsEventuallyDue = normalizeRequirementList(state.row.requirements_eventually_due as string[] | string | null);
  const requirementsPastDue = normalizeRequirementList(state.row.requirements_past_due as string[] | string | null);

  return {
    id: state.row.id,
    subjectType: state.row.subject_type,
    provider: state.row.provider,
    operationalStatus: deriveOperationalFintechStatus({
      onboardingStatus: state.row.onboarding_status,
      payoutReadinessStatus: state.row.payout_readiness_status,
      requirementsCurrentlyDue,
      requirementsPastDue,
      disabledReason: state.row.disabled_reason
    }),
    providerAccountId: state.row.provider_account_id,
    onboardingStatus: state.row.onboarding_status,
    payoutReadinessStatus: state.row.payout_readiness_status,
    legalReadinessStatus: state.row.legal_readiness_status,
    taxReadinessStatus: state.row.tax_readiness_status,
    chargesEnabled: state.row.charges_enabled,
    payoutsEnabled: state.row.payouts_enabled,
    requirementsCurrentlyDue,
    requirementsEventuallyDue,
    requirementsPastDue,
    missingAgreements: state.missingAgreements,
    outdatedAgreements: state.outdatedAgreements,
    missingSteps: state.missingSteps,
    disabledReason: state.row.disabled_reason,
    lastCheckedAt: state.row.last_checked_at,
    onboardingStartedAt: state.row.onboarding_started_at,
    onboardingCompletedAt: state.row.onboarding_completed_at,
    processorLastSyncedAt: state.row.processor_last_synced_at,
    processorLastEventId: state.row.processor_last_event_id,
    processorLastEventType: state.row.processor_last_event_type,
    dashboardLastAccessedAt: state.row.dashboard_last_accessed_at,
    createdAt: state.row.created_at,
    updatedAt: state.row.updated_at
  };
}

function getVerificationConnectProviderStatus(account: ConnectedAccountReadinessView) {
  if (account.payoutsEnabled && account.chargesEnabled && !account.requirementsCurrentlyDue.length && !account.requirementsPastDue.length && !account.disabledReason) {
    return "payouts_enabled";
  }

  if (account.disabledReason || account.requirementsPastDue.length) {
    return "restricted";
  }

  if (account.requirementsCurrentlyDue.length) {
    return "requirements_due";
  }

  if (account.onboardingStatus === "submitted" || account.operationalStatus === "pending_verification") {
    return "submitted";
  }

  if (account.onboardingStatus === "invited" || account.onboardingStatus === "pending") {
    return "in_progress";
  }

  return "not_started";
}

async function syncVerificationLaneFromConnectedAccount(
  row: ConnectedAccountRow,
  account: ConnectedAccountReadinessView,
  userId?: string
) {
  const role = row.subject_type === "barber" ? "barber" : "shop_owner";
  await syncStripeConnectVerificationLane({
    role,
    userId,
    barberId: row.barber_id,
    shopId: row.shop_id,
    providerAccountId: row.provider_account_id ?? account.providerAccountId ?? "",
    providerStatus: getVerificationConnectProviderStatus(account),
    onboardingStatus: account.onboardingStatus,
    operationalStatus: account.operationalStatus,
    payoutReadinessStatus: account.payoutReadinessStatus,
    legalReadinessStatus: account.legalReadinessStatus,
    taxReadinessStatus: account.taxReadinessStatus,
    chargesEnabled: account.chargesEnabled,
    payoutsEnabled: account.payoutsEnabled,
    detailsSubmitted: account.onboardingStatus === "submitted" || account.onboardingStatus === "verified" || account.chargesEnabled || account.payoutsEnabled,
    requirementsCurrentlyDue: account.requirementsCurrentlyDue,
    requirementsEventuallyDue: account.requirementsEventuallyDue,
    requirementsPastDue: account.requirementsPastDue,
    missingAgreements: account.missingAgreements,
    outdatedAgreements: account.outdatedAgreements,
    missingSteps: account.missingSteps,
    disabledReason: account.disabledReason,
    processorLastEventId: account.processorLastEventId,
    processorLastEventType: account.processorLastEventType,
    lastCheckedAt: account.lastCheckedAt
  });
}

function scopeForConnectedAccount(account: ConnectedAccountRow) {
  return {
    barberIds: account.barber_id ? [account.barber_id] : [],
    shopIds: account.shop_id ? [account.shop_id] : []
  };
}

async function ensureConnectedAccountForSubject(
  supabase: SupabaseClient,
  subject: StripeConnectSubjectResolution
) {
  await ensureConnectedAccounts(supabase, {
    barberIds: subject.barberId ? [subject.barberId] : [],
    shopIds: subject.shopId ? [subject.shopId] : [],
    createdBy: subject.createdBy
  });

  const accounts = await loadConnectedAccountsForScope(supabase, {
    barberIds: subject.barberId ? [subject.barberId] : [],
    shopIds: subject.shopId ? [subject.shopId] : []
  });
  const account = accounts.find((row) =>
    subject.subjectType === "barber"
      ? row.barber_id === subject.barberId
      : row.shop_id === subject.shopId
  );

  if (!account) {
    throw new FintechServiceError("Unable to resolve the connected account subject.", 500);
  }

  return account;
}

function buildStripeMetadata(subject: StripeConnectSubjectResolution) {
  return {
    platform: "bvrb3r",
    subject_type: subject.subjectType,
    barber_id: subject.barberId ?? "",
    shop_id: subject.shopId ?? "",
    created_by: subject.createdBy
  };
}

async function syncConnectedAccountFromStripe(
  supabase: SupabaseClient,
  account: ConnectedAccountRow,
  stripeAccount: Stripe.Account,
  options?: {
    eventId?: string | null;
    eventType?: string | null;
    markOnboardingStarted?: boolean;
    markDashboardAccessed?: boolean;
  }
) {
  const now = new Date().toISOString();
  const requirementsCurrentlyDue = normalizeRequirementList((stripeAccount.requirements?.currently_due ?? []) as string[]);
  const requirementsEventuallyDue = normalizeRequirementList(
    ((stripeAccount.future_requirements?.eventually_due ?? stripeAccount.requirements?.eventually_due ?? []) as string[])
  );
  const requirementsPastDue = normalizeRequirementList((stripeAccount.requirements?.past_due ?? []) as string[]);
  const disabledReason = stripeAccount.requirements?.disabled_reason?.trim() || null;
  const inferredStatuses = inferStripeProcessorStatuses({
    currentOnboardingStatus: account.onboarding_status,
    detailsSubmitted: Boolean(stripeAccount.details_submitted),
    chargesEnabled: Boolean(stripeAccount.charges_enabled),
    payoutsEnabled: Boolean(stripeAccount.payouts_enabled),
    requirementsCurrentlyDue,
    requirementsPastDue,
    requirementsEventuallyDue,
    disabledReason
  });

  let onboardingStatus = inferredStatuses.onboardingStatus;
  if (options?.markOnboardingStarted && onboardingStatus === "not_started") {
    onboardingStatus = account.onboarding_status === "pending" ? "pending" : "invited";
  }

  const updateResult = await supabase
    .from("connected_accounts")
    .update({
      provider: "stripe_connect",
      provider_account_id: stripeAccount.id,
      onboarding_status: onboardingStatus,
      tax_readiness_status: inferredStatuses.taxReadinessStatus,
      charges_enabled: Boolean(stripeAccount.charges_enabled),
      payouts_enabled: Boolean(stripeAccount.payouts_enabled),
      requirements_currently_due: requirementsCurrentlyDue,
      requirements_eventually_due: requirementsEventuallyDue,
      requirements_past_due: requirementsPastDue,
      disabled_reason: disabledReason,
      last_checked_at: now,
      onboarding_started_at: options?.markOnboardingStarted ? (account.onboarding_started_at ?? now) : account.onboarding_started_at,
      onboarding_completed_at: onboardingStatus === "verified" ? (account.onboarding_completed_at ?? now) : account.onboarding_completed_at,
      processor_last_synced_at: now,
      processor_last_event_id: options?.eventId ?? account.processor_last_event_id,
      processor_last_event_type: options?.eventType ?? account.processor_last_event_type,
      dashboard_last_accessed_at: options?.markDashboardAccessed ? now : account.dashboard_last_accessed_at,
      updated_at: now
    })
    .eq("id", account.id)
    .select(CONNECTED_ACCOUNT_SELECT)
    .single();

  if (updateResult.error) {
    throw new FintechServiceError("Unable to sync the Stripe connected account.", 500);
  }

  const refreshed = updateResult.data as ConnectedAccountRow;
  const acceptances = await loadLegalAcceptancesForScope(supabase, scopeForConnectedAccount(refreshed));
  const state = await syncConnectedAccountState(supabase, refreshed, acceptances);
  return state;
}

async function provisionStripeConnectedAccountForSubject(
  supabase: SupabaseClient,
  subject: StripeConnectSubjectResolution
) {
  const account = await ensureConnectedAccountForSubject(supabase, subject);

  try {
    if (account.provider_account_id) {
      const stripeAccount = await retrieveStripeConnectedAccount(account.provider_account_id);
      return syncConnectedAccountFromStripe(supabase, account, stripeAccount);
    }

    const stripeAccount = await createStripeConnectedAccount({
      subjectType: subject.subjectType,
      email: subject.email,
      displayName: subject.displayName,
      metadata: buildStripeMetadata(subject)
    });

    return syncConnectedAccountFromStripe(supabase, account, stripeAccount);
  } catch (error) {
    throw toFintechServiceError(error, "Unable to provision the Stripe connected account.");
  }
}

function createStripeEventExcerpt(event: Stripe.Event) {
  const object = typeof event.data.object === "object" && event.data.object
    ? event.data.object as unknown as Record<string, unknown>
    : null;

  return {
    id: event.id,
    type: event.type,
    created: event.created,
    account: event.account ?? null,
    objectType: object?.object ?? null,
    objectId: typeof object?.id === "string" ? object.id : null
  };
}

async function beginStripeWebhookAudit(supabase: SupabaseClient, event: Stripe.Event) {
  const existingResult = await supabase
    .from("stripe_webhook_events")
    .select("id, stripe_event_id, stripe_account_id, connected_account_id, event_type, livemode, api_version, processing_status, attempt_count, payload_excerpt, error_message, received_at, processed_at, updated_at")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (existingResult.error) {
    throw new FintechServiceError("Unable to inspect Stripe webhook idempotency.", 500);
  }

  const now = new Date().toISOString();
  if (existingResult.data) {
    const existing = existingResult.data as StripeWebhookEventRow;
    if (existing.processing_status === "processed" || existing.processing_status === "ignored") {
      return { row: existing, duplicate: true };
    }

    const updateResult = await supabase
      .from("stripe_webhook_events")
      .update({
        stripe_account_id: event.account ?? existing.stripe_account_id,
        event_type: event.type,
        livemode: event.livemode,
        api_version: event.api_version ?? existing.api_version,
        processing_status: "received",
        attempt_count: existing.attempt_count + 1,
        payload_excerpt: createStripeEventExcerpt(event),
        error_message: null,
        updated_at: now
      })
      .eq("id", existing.id)
      .select("id, stripe_event_id, stripe_account_id, connected_account_id, event_type, livemode, api_version, processing_status, attempt_count, payload_excerpt, error_message, received_at, processed_at, updated_at")
      .single();

    if (updateResult.error) {
      throw new FintechServiceError("Unable to update Stripe webhook audit state.", 500);
    }

    return { row: updateResult.data as StripeWebhookEventRow, duplicate: false };
  }

  const insertResult = await supabase
    .from("stripe_webhook_events")
    .insert({
      stripe_event_id: event.id,
      stripe_account_id: event.account ?? null,
      event_type: event.type,
      livemode: event.livemode,
      api_version: event.api_version ?? null,
      processing_status: "received",
      payload_excerpt: createStripeEventExcerpt(event),
      received_at: now,
      updated_at: now
    })
    .select("id, stripe_event_id, stripe_account_id, connected_account_id, event_type, livemode, api_version, processing_status, attempt_count, payload_excerpt, error_message, received_at, processed_at, updated_at")
    .single();

  if (insertResult.error) {
    throw new FintechServiceError("Unable to record the Stripe webhook audit.", 500);
  }

  return { row: insertResult.data as StripeWebhookEventRow, duplicate: false };
}

async function completeStripeWebhookAudit(
  supabase: SupabaseClient,
  rowId: string,
  input: {
    processingStatus: "processed" | "ignored" | "failed";
    connectedAccountId?: string | null;
    errorMessage?: string | null;
  }
) {
  const now = new Date().toISOString();
  const updateResult = await supabase
    .from("stripe_webhook_events")
    .update({
      processing_status: input.processingStatus,
      connected_account_id: input.connectedAccountId ?? null,
      error_message: input.errorMessage ?? null,
      processed_at: input.processingStatus === "failed" ? null : now,
      updated_at: now
    })
    .eq("id", rowId);

  if (updateResult.error) {
    throw new FintechServiceError("Unable to finalize the Stripe webhook audit.", 500);
  }
}

async function loadPaymentAndContext(supabase: SupabaseClient, paymentId: string) {
  const paymentResult = await supabase
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentResult.error) {
    throw new FintechServiceError("Unable to load the payment for routing.", 500);
  }

  if (!paymentResult.data) {
    throw new FintechServiceError("Payment not found for routing.", 404);
  }

  const payment = paymentResult.data as PaymentRow;
  const appointment = payment.appointment_id
    ? await supabase
      .from("appointments")
      .select("id, reference_code, status, membership_id, barber_id, shop_id, location_id, client_id")
      .eq("id", payment.appointment_id)
      .maybeSingle()
    : { data: null, error: null };

  if (appointment.error) {
    throw new FintechServiceError("Unable to load the payment appointment context.", 500);
  }

  const posSale = payment.pos_sale_id
    ? await supabase
      .from("pos_sales")
      .select("id, status, barber_id, shop_id, client_id, payment_id, total_cents, created_at, updated_at")
      .eq("id", payment.pos_sale_id)
      .maybeSingle()
    : { data: null, error: null };

  if (posSale.error) {
    throw new FintechServiceError("Unable to load the POS sale payment context.", 500);
  }

  const refundsResult = await supabase
    .from("refunds")
    .select("id, amount")
    .eq("payment_id", payment.id);

  if (refundsResult.error) {
    throw new FintechServiceError("Unable to load payment refund activity.", 500);
  }

  return {
    payment,
    appointment: (appointment.data as AppointmentRow | null) ?? null,
    posSale: (posSale.data as PosSaleRow | null) ?? null,
    refundedAmount: ((refundsResult.data ?? []) as RefundRow[]).reduce((sum, row) => sum + numeric(row.amount), 0)
  };
}

async function hasActiveDisputeHold(
  supabase: SupabaseClient,
  appointmentReference?: string | null
) {
  if (!appointmentReference?.trim()) {
    return false;
  }

  const disputeResult = await supabase
    .from("disputes")
    .select("id")
    .eq("appointment_reference", appointmentReference)
    .in("dispute_status", ["open", "needs_response", "under_review", "warning_needs_response", "warning_under_review", "escalated"])
    .limit(1)
    .maybeSingle();

  if (disputeResult.error) {
    throw new FintechServiceError("Unable to inspect payout dispute holds.", 500);
  }

  return Boolean(disputeResult.data);
}

async function recordRoutingLifecycleEvents(
  supabase: SupabaseClient,
  input: {
    routing: PaymentRoutingRow;
    payment: PaymentRow;
    appointment: AppointmentRow | null;
    posSale?: PosSaleRow | null;
    existingRouting: PaymentRoutingRow | null;
    relationshipType: RoutingModel;
    disputeHold: boolean;
  }
) {
  const baseRelatedIds = {
    routingRecordId: input.routing.id,
    paymentId: input.payment.id,
    appointmentId: input.routing.appointment_id,
    posSaleId: input.routing.pos_sale_id ?? null,
    clientId: input.payment.client_id ?? input.posSale?.client_id ?? null,
    barberId: input.payment.barber_id,
    shopId: input.payment.shop_id ?? input.appointment?.shop_id ?? input.posSale?.shop_id ?? null
  };
  const basePayload = {
    relationshipType: input.relationshipType,
    routingModel: input.routing.routing_model,
    moneyRoutingStatus: input.routing.money_routing_status,
    payoutReadinessStatus: input.routing.payout_readiness_status,
    providerGrossAmount: numeric(input.routing.provider_gross_amount),
    platformFeeAmount: numeric(input.routing.platform_fee_amount),
    barberPayoutAmount: numeric(input.routing.barber_payout_amount),
    shopSplitAmount: numeric(input.routing.shop_split_amount),
    currency: input.routing.currency,
    posSaleStatus: input.posSale?.status ?? null
  };
  const events = [
    !input.existingRouting
      ? {
          eventType: "payment_routing_created" as const,
          idempotencyKey: buildPlatformEventIdempotencyKey(["payment-routing", input.routing.id, "created"])
        }
      : null,
    (isPayoutReadinessEligible(input.routing.payout_readiness_status) || input.routing.money_routing_status === "ready_for_payout")
      && !isPayoutReadinessEligible(input.existingRouting?.payout_readiness_status)
      && input.existingRouting?.money_routing_status !== "ready_for_payout"
      ? {
          eventType: "payout_eligible" as const,
          idempotencyKey: buildPlatformEventIdempotencyKey(["payment-routing", input.routing.id, "eligible"])
        }
      : null,
    input.disputeHold
      && input.routing.money_routing_status === "blocked"
      && input.existingRouting?.money_routing_status !== "blocked"
      ? {
          eventType: "payout_held" as const,
          idempotencyKey: buildPlatformEventIdempotencyKey(["payment-routing", input.routing.id, "held"])
        }
      : null
  ].filter((event): event is NonNullable<typeof event> => Boolean(event));

  for (const event of events) {
    const result = await recordPlatformEvent(supabase, {
      eventType: event.eventType,
      entityType: "payment_routing_record",
      entityId: input.routing.id,
      actorId: input.payment.barber_id ?? input.payment.client_id ?? input.payment.shop_id ?? null,
      source: "system",
      relatedIds: baseRelatedIds,
      payload: basePayload,
      idempotencyKey: event.idempotencyKey
    });
    if (!result.ok) {
      console.warn("[payment-routing] platform_event_write_failed", {
        eventType: event.eventType,
        routingRecordId: input.routing.id,
        paymentId: input.payment.id
      });
    }
  }
}

function mapRoutingView(
  row: PaymentRoutingRow,
  payment: PaymentRow | undefined,
  barberName: string | null,
  shopLabel: string | null
): FintechRoutingView {
  return {
    id: row.id,
    paymentId: row.payment_id,
    appointmentId: row.appointment_id,
    posSaleId: row.pos_sale_id ?? null,
    barberName,
    shopLabel,
    routingModel: row.routing_model,
    paymentType: payment?.payment_type ?? "booking",
    paymentStatus: payment ? normalizePaymentStatusForRouting(payment) : "pending",
    providerGrossAmount: numeric(row.provider_gross_amount),
    refundedAmount: numeric(row.refunded_amount),
    processorFeeAmount: numeric(row.provider_fee_amount),
    providerNetAmount: numeric(row.provider_net_amount),
    platformFeeAmount: numeric(row.platform_fee_amount),
    barberPayoutAmount: numeric(row.barber_payout_amount),
    shopSplitAmount: numeric(row.shop_split_amount),
    payoutReadinessStatus: row.payout_readiness_status,
    moneyRoutingStatus: row.money_routing_status,
    reconciliationStatus: row.reconciliation_status,
    blockedReason: row.blocked_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function routingWritePostgresField(error: unknown, field: "code" | "details" | "message") {
  return typeof error === "object" && error !== null && field in error
    ? String((error as Record<string, unknown>)[field] ?? "")
    : null;
}

function logAppointmentCompleteRoutingWrite(input: {
  operation: "insert" | "update";
  appointmentId: string | null;
  paymentId: string;
  payloadKeys: string[];
  providerGrossAmount: number;
  platformFeeAmount: number;
  barberPayoutAmount: number;
  shopSplitAmount: number;
  payoutReadinessStatus: string | null;
  moneyRoutingStatus: string | null;
  reconciliationStatus: string | null;
}) {
  console.info(`[appointment-complete] routing_${input.operation}`, {
    appointmentId: input.appointmentId,
    paymentId: input.paymentId,
    payloadKeys: input.payloadKeys,
    providerGrossAmount: input.providerGrossAmount,
    platformFeeAmount: input.platformFeeAmount,
    barberPayoutAmount: input.barberPayoutAmount,
    shopSplitAmount: input.shopSplitAmount,
    payoutReadinessStatus: input.payoutReadinessStatus,
    moneyRoutingStatus: input.moneyRoutingStatus,
    reconciliationStatus: input.reconciliationStatus
  });
}

function logAppointmentCompleteRoutingConstraintFailure(input: {
  stage: string;
  appointmentId: string | null;
  paymentId: string;
  error: unknown;
  payloadKeys: string[];
  payoutReadinessStatus: string | null;
  moneyRoutingStatus: string | null;
  reconciliationStatus: string | null;
}) {
  const postgresCode = routingWritePostgresField(input.error, "code");
  const postgresDetails = routingWritePostgresField(input.error, "details");
  const errorMessage = input.error instanceof Error
    ? input.error.message
    : routingWritePostgresField(input.error, "message") ?? String(input.error);
  const haystack = `${postgresCode ?? ""} ${postgresDetails ?? ""} ${errorMessage}`.toLowerCase();

  if (postgresCode === "23514" || haystack.includes("constraint") || haystack.includes("check")) {
    console.error("[appointment-complete] constraint_failure", {
      stage: input.stage,
      appointmentId: input.appointmentId,
      paymentId: input.paymentId,
      postgresCode,
      postgresDetails,
      errorMessage,
      payloadKeys: input.payloadKeys,
      payoutReadinessStatus: input.payoutReadinessStatus,
      moneyRoutingStatus: input.moneyRoutingStatus,
      reconciliationStatus: input.reconciliationStatus
    });
  }
}

async function readPlatformBillingBlockers(
  supabase: SupabaseClient,
  input: {
    barberId?: string | null;
    shopId?: string | null;
  }
) {
  const queries = [
    input.barberId
      ? supabase
        .from("billing_subscriptions")
        .select("id, subject_type, barber_id, shop_id, subscription_status, billing_state")
        .eq("barber_id", input.barberId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.shopId
      ? supabase
        .from("billing_subscriptions")
        .select("id, subject_type, barber_id, shop_id, subscription_status, billing_state")
        .eq("shop_id", input.shopId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ] as const;

  const [barberResult, shopResult] = await Promise.all(queries);
  if (barberResult.error || shopResult.error) {
    throw new FintechServiceError("Unable to load platform billing guardrails.", 500);
  }

  const rows = [barberResult.data, shopResult.data].filter(Boolean) as BillingSubscriptionGuardRow[];
  return rows.flatMap((row) => {
    const isBlocked = row.billing_state === "past_due"
      || row.subscription_status === "past_due"
      || row.subscription_status === "cancelled";
    if (!isBlocked) {
      return [];
    }

    return [
      row.subject_type === "barber"
        ? "Barber subscription billing is past due and payout is blocked until billing is recovered."
        : "Shop subscription billing is past due and payout is blocked until billing is recovered."
    ];
  });
}

export async function syncPaymentRoutingRecord(
  supabase: SupabaseClient,
  paymentId: string,
  options?: {
    providerFeeAmount?: number | null;
    platformFeeAmount?: number | null;
    processorChargeId?: string | null;
    processorBalanceTransactionId?: string | null;
    reconciliationStatus?: PayoutExecutionReconciliationStatus | null;
    lastReconciledAt?: string | null;
    forceCompletionEligibility?: boolean;
    repairReason?: string | null;
    source?: string | null;
  }
) {
  const { payment, appointment, posSale, refundedAmount } = await loadPaymentAndContext(supabase, paymentId);
  const shopId = payment.shop_id ?? appointment?.shop_id ?? posSale?.shop_id ?? null;
  const barberId = payment.barber_id ?? appointment?.barber_id ?? posSale?.barber_id ?? null;

  if (!barberId && !shopId) {
    return null;
  }

  const barberResult = barberId
    ? await supabase
      .from("barbers")
      .select("id, reference_code, profile_id, compensation_model, commission_rate, booth_rent_amount, booth_rent_frequency")
      .eq("id", barberId)
      .maybeSingle()
    : { data: null, error: null };

  if (barberResult.error) {
    throw new FintechServiceError("Unable to load the routing barber context.", 500);
  }

  const barber = (barberResult.data as BarberRow | null) ?? null;
  const barberReference = barber?.reference_code ?? barber?.id ?? null;
  const locationResult = shopId
    ? await supabase
      .from("locations")
      .select("id, reference_code, name, neighborhood, city, state")
      .eq("id", shopId)
      .maybeSingle()
    : { data: null, error: null };

  if (locationResult.error) {
    throw new FintechServiceError("Unable to load the routing shop context.", 500);
  }

  const shopLocation = (locationResult.data as LocationRow | null) ?? null;
  const shopVerificationScopeId = shopLocation?.reference_code ?? shopId ?? null;
  let membership: StaffMembershipRow | null = null;
  if (appointment?.membership_id) {
    const membershipResult = await supabase
      .from("staff_locations")
      .select("id, profile_id, location_id, routing_model, commission_rate, booth_rent_amount, booth_rent_frequency, payout_block_reason, updated_at, fintech_updated_at")
      .eq("id", appointment.membership_id)
      .maybeSingle();

    if (membershipResult.error) {
      throw new FintechServiceError("Unable to load the captured compensation assignment.", 500);
    }

    membership = (membershipResult.data as StaffMembershipRow | null) ?? null;
  }

  if (!membership && barber?.profile_id && shopId) {
    const membershipResult = await supabase
      .from("staff_locations")
      .select("id, profile_id, location_id, routing_model, commission_rate, booth_rent_amount, booth_rent_frequency, payout_block_reason, updated_at, fintech_updated_at")
      .eq("profile_id", barber.profile_id)
      .eq("location_id", shopId)
      .maybeSingle();

    if (membershipResult.error) {
      throw new FintechServiceError("Unable to resolve the routing membership assignment.", 500);
    }

    membership = (membershipResult.data as StaffMembershipRow | null) ?? null;
  }

  const routingModel = membership?.routing_model
    ? normalizeRoutingModel(membership.routing_model)
    : !shopId
      ? "freelance"
      : normalizeRoutingModel(barber?.compensation_model, "commission");
  const commissionRate = membership?.commission_rate === null || membership?.commission_rate === undefined
    ? barber?.commission_rate === null || barber?.commission_rate === undefined
      ? null
      : numeric(barber.commission_rate)
    : numeric(membership.commission_rate);

  const posSalePaidSuccessful = Boolean(payment.payment_type === "pos_sale" && posSale?.status === "paid" && isCompletionPaymentSuccessful(payment));
  const bypassPayoutSetupForFreelanceCompletion = Boolean((options?.forceCompletionEligibility || posSalePaidSuccessful) && !shopId);
  let syncedStates: ConnectedAccountState[] = [];

  if (!bypassPayoutSetupForFreelanceCompletion) {
    await ensureConnectedAccounts(supabase, {
      barberIds: barberId ? [barberId] : [],
      shopIds: shopId ? [shopId] : [],
      createdBy: barber?.profile_id ?? null
    });

    const [accounts, acceptances] = await Promise.all([
      loadConnectedAccountsForScope(supabase, {
        barberIds: barberId ? [barberId] : [],
        shopIds: shopId ? [shopId] : []
      }),
      loadLegalAcceptancesForScope(supabase, {
        barberIds: barberId ? [barberId] : [],
        shopIds: shopId ? [shopId] : []
      })
    ]);
    syncedStates = await Promise.all(accounts.map((account) => syncConnectedAccountState(supabase, account, acceptances)));
  }
  const barberAccountState = syncedStates.find((state) => state.row.subject_type === "barber" && state.row.barber_id === barberId) ?? null;
  const shopAccountState = syncedStates.find((state) => state.row.subject_type === "shop" && state.row.shop_id === shopId) ?? null;
  const existingRoutingResult = await supabase
    .from("payment_routing_records")
    .select(PAYMENT_ROUTING_SELECT)
    .eq("payment_id", payment.id)
    .maybeSingle();

  if (existingRoutingResult.error) {
    throw new FintechServiceError("Unable to inspect the existing payment routing ledger.", 500);
  }

  let existingRouting = (existingRoutingResult.data as PaymentRoutingRow | null) ?? null;
  if (!existingRouting && payment.appointment_id) {
    const existingByAppointmentResult = await supabase
      .from("payment_routing_records")
      .select(PAYMENT_ROUTING_SELECT)
      .eq("appointment_id", payment.appointment_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingByAppointmentResult.error) {
      throw new FintechServiceError("Unable to inspect the appointment payment routing ledger.", 500);
    }
    existingRouting = (existingByAppointmentResult.data as PaymentRoutingRow | null) ?? null;
  }
  if (!existingRouting && payment.pos_sale_id) {
    const existingByPosSaleResult = await supabase
      .from("payment_routing_records")
      .select(PAYMENT_ROUTING_SELECT)
      .eq("pos_sale_id", payment.pos_sale_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingByPosSaleResult.error) {
      throw new FintechServiceError("Unable to inspect the POS sale payment routing ledger.", 500);
    }
    existingRouting = (existingByPosSaleResult.data as PaymentRoutingRow | null) ?? null;
  }
  if (options?.forceCompletionEligibility) {
    console.info("[barber-appointment] complete_routing_lookup_result", {
      appointmentId: payment.appointment_id,
      routingFound: Boolean(existingRouting)
    });
  }
  const providerFeeAmount = options?.providerFeeAmount ?? (existingRouting ? numeric(existingRouting.provider_fee_amount) : 0);
  const disputeHold = await hasActiveDisputeHold(supabase, appointment?.reference_code ?? null);
  const posSaleEligibilityForced = Boolean(posSalePaidSuccessful && !disputeHold);
  const completionEligibilityForced = Boolean(
    (
      (options?.forceCompletionEligibility && appointment?.status === "completed")
      || posSaleEligibilityForced
    ) && isCompletionPaymentSuccessful(payment) && !disputeHold
  );
  const trustState = await readTrustStateSafe();
  const barberPayoutGate = trustState && barberReference
    ? getVerificationGateDecision(
      buildPublicTrustSignal(trustState, barberReference, shopVerificationScopeId ?? undefined).verificationDecision,
      "payout"
    )
    : null;
  const shopPayoutGate = trustState && shopVerificationScopeId
    ? getVerificationGateDecision(computeShopVerificationDecision(trustState, shopVerificationScopeId), "payout")
    : null;

  const paymentStatusForRouting = normalizePaymentStatusForRouting(payment);
  const calculated = calculatePaymentRouting({
    paymentType: payment.payment_type,
    paymentStatus: paymentStatusForRouting,
    grossAmount: numeric(payment.amount),
    refundedAmount,
    providerFeeAmount,
    platformFeeAmount: options?.platformFeeAmount ?? undefined,
    routingModel,
    commissionRate,
    barberReady: barberAccountState?.row.payout_readiness_status === "ready",
    shopReady: shopAccountState?.row.payout_readiness_status === "ready",
    barberVerificationAllowed: barberPayoutGate?.allowed,
    barberVerificationReason: barberPayoutGate?.reasons[0] ?? null,
    shopVerificationAllowed: shopPayoutGate?.allowed,
    shopVerificationReason: shopPayoutGate?.reasons[0] ?? null,
    appointmentCompleted: appointment?.status === "completed" || appointment?.status === "refunded" || posSaleEligibilityForced,
    disputeHold
  });
  const subscriptionBlockedReasons = await readPlatformBillingBlockers(supabase, {
    barberId,
    shopId
  });

  const membershipBlockedReason = shopId && !membership && payment.payment_type !== "tip"
    ? "No shop compensation assignment is stored for this payment."
    : null;
  const blockedReason =
    membership?.payout_block_reason?.trim()
    || membershipBlockedReason
    || subscriptionBlockedReasons[0]
    || calculated.blockedReason;
  const payoutReadinessStatus: FintechPayoutReadinessStatus = completionEligibilityForced
    ? "eligible"
    : blockedReason
      ? "blocked"
      : calculated.payoutReadinessStatus;
  const moneyRoutingStatus: MoneyRoutingStatus =
    paymentStatusForRouting === "refunded"
      ? "refunded"
      : completionEligibilityForced
        ? "pending"
        : calculated.moneyRoutingStatus;
  const constraintEvidence = await loadPaymentRoutingConstraintEvidence(supabase);
  const payoutReadinessDbStatus = readinessDbValueForStatus(constraintEvidence, payoutReadinessStatus);
  const moneyRoutingDbStatus = moneyRoutingDbValueForStatus(constraintEvidence, moneyRoutingStatus);
  const now = new Date().toISOString();
  const reconciliationStatus = reconciliationDbValueForStatus(
    constraintEvidence,
    options?.reconciliationStatus
      ?? existingRouting?.reconciliation_status
      ?? "open"
  );
  const nextEligibleAt = completionEligibilityForced || moneyRoutingDbStatus === "ready_for_payout"
    ? existingRouting?.eligible_at ?? now
    : existingRouting?.eligible_at ?? null;
  const nextHeldAt = disputeHold && moneyRoutingDbStatus === "blocked"
    ? existingRouting?.held_at ?? now
    : existingRouting?.held_at ?? null;
  const nextReleasedAt = moneyRoutingDbStatus === "paid_out"
    ? existingRouting?.released_at ?? now
    : existingRouting?.released_at ?? null;
  const nextReversedAt = moneyRoutingDbStatus === "refunded"
    ? existingRouting?.reversed_at ?? now
    : existingRouting?.reversed_at ?? null;

  const routingPayload = {
    payment_id: payment.id,
    appointment_id: payment.appointment_id,
    pos_sale_id: payment.pos_sale_id ?? null,
    membership_id: membership?.id ?? appointment?.membership_id ?? null,
    routing_model: routingModel,
    payout_recipient_type: calculated.payoutRecipientType,
    provider_gross_amount: calculated.providerGrossAmount,
    refunded_amount: calculated.refundedAmount,
    provider_fee_amount: calculated.providerFeeAmount,
    provider_net_amount: calculated.providerNetAmount,
    platform_fee_amount: calculated.platformFeeAmount,
    barber_payout_amount: calculated.barberPayoutAmount,
    shop_split_amount: calculated.shopSplitAmount,
    currency: payment.currency.toLowerCase(),
    payout_readiness_status: payoutReadinessDbStatus,
    money_routing_status: moneyRoutingDbStatus,
    blocked_reason: completionEligibilityForced ? null : blockedReason,
    eligible_at: nextEligibleAt,
    held_at: nextHeldAt,
    released_at: nextReleasedAt,
    reversed_at: nextReversedAt,
    processor_charge_id: options?.processorChargeId ?? existingRouting?.processor_charge_id ?? payment.provider_payment_intent_id ?? null,
    processor_balance_transaction_id: options?.processorBalanceTransactionId ?? existingRouting?.processor_balance_transaction_id ?? null,
    reconciliation_status: reconciliationStatus,
    metadata: {
      paymentType: payment.payment_type,
      paymentStatus: payment.payment_status,
      status: payment.status ?? null,
      provider: payment.provider,
      providerPaymentIntentId: payment.provider_payment_intent_id,
      shopId,
      barberId,
      barberReference,
      shopVerificationScopeId,
      appointmentStatus: appointment?.status ?? null,
      posSaleId: payment.pos_sale_id ?? null,
      posSaleStatus: posSale?.status ?? null,
      disputeHold,
      subscriptionBlockedReasons,
      barberPayoutGate,
      shopPayoutGate,
      repairReason: options?.repairReason ?? null,
      source: options?.source ?? null,
      relationshipType: routingModel,
      readinessMeaning: payoutReadinessMeaning(payoutReadinessDbStatus),
      payoutReadinessDbValue: payoutReadinessDbStatus,
      moneyRoutingDbValue: moneyRoutingDbStatus,
      constraintSource: constraintEvidence.source,
      appointmentId: payment.appointment_id,
      paymentId: payment.id,
      clientId: payment.client_id ?? appointment?.client_id ?? posSale?.client_id ?? null
    },
    created_at: existingRouting?.created_at ?? now,
    updated_at: now
  };
  const routingPayloadKeys = Object.keys(routingPayload);
  const isCompletionRoutingWrite = completionEligibilityForced
    || options?.source === "barber_complete_service"
    || options?.repairReason === "missing_routing_record_on_completion";

  if (completionEligibilityForced && !existingRouting) {
    console.info("[barber-appointment] complete_routing_repair_started", {
      appointmentId: payment.appointment_id,
      paymentId: payment.id,
      payloadKeys: routingPayloadKeys,
      providerGrossAmount: routingPayload.provider_gross_amount,
      platformFeeAmount: routingPayload.platform_fee_amount,
      barberPayoutAmount: routingPayload.barber_payout_amount,
      shopSplitAmount: routingPayload.shop_split_amount
    });
  }
  if (isCompletionRoutingWrite) {
    logAppointmentCompleteRoutingWrite({
      operation: existingRouting ? "update" : "insert",
      appointmentId: payment.appointment_id,
      paymentId: payment.id,
      payloadKeys: routingPayloadKeys,
      providerGrossAmount: routingPayload.provider_gross_amount,
      platformFeeAmount: routingPayload.platform_fee_amount,
      barberPayoutAmount: routingPayload.barber_payout_amount,
      shopSplitAmount: routingPayload.shop_split_amount,
      payoutReadinessStatus: routingPayload.payout_readiness_status,
      moneyRoutingStatus: routingPayload.money_routing_status,
      reconciliationStatus: routingPayload.reconciliation_status
    });
  }

  const writeResult = existingRouting
    ? await supabase
      .from("payment_routing_records")
      .update(routingPayload)
      .eq("id", existingRouting.id)
      .select(PAYMENT_ROUTING_SELECT)
      .single()
    : await supabase
      .from("payment_routing_records")
      .insert(routingPayload)
      .select(PAYMENT_ROUTING_SELECT)
      .single();

  if (writeResult.error) {
    if (isCompletionRoutingWrite) {
      logAppointmentCompleteRoutingConstraintFailure({
        stage: existingRouting ? "routing_update" : "routing_insert",
        appointmentId: payment.appointment_id,
        paymentId: payment.id,
        error: writeResult.error,
        payloadKeys: routingPayloadKeys,
        payoutReadinessStatus: routingPayload.payout_readiness_status,
        moneyRoutingStatus: routingPayload.money_routing_status,
        reconciliationStatus: routingPayload.reconciliation_status
      });
    }
    if (completionEligibilityForced) {
      console.error("[barber-appointment] complete_routing_repair_failed", {
        appointmentId: payment.appointment_id,
        postgresCode: "code" in writeResult.error ? writeResult.error.code : null,
        postgresDetails: "details" in writeResult.error ? writeResult.error.details : null,
        errorMessage: "message" in writeResult.error ? writeResult.error.message : String(writeResult.error),
        payloadKeys: routingPayloadKeys
      });
    }
    throw new FintechServiceError("Unable to write the payment routing ledger.", 500);
  }

  const routingRow = writeResult.data as PaymentRoutingRow;
  if (completionEligibilityForced && !existingRouting) {
    console.info("[barber-appointment] complete_routing_repair_succeeded", {
      appointmentId: routingRow.appointment_id,
      routingId: routingRow.id,
      payoutReadinessStatus: routingRow.payout_readiness_status,
      eligibleAtPresent: Boolean(routingRow.eligible_at)
    });
  }
  await recordRoutingLifecycleEvents(supabase, {
    routing: routingRow,
    payment,
    appointment,
    posSale,
    existingRouting,
    relationshipType: routingModel,
    disputeHold
  });
  await syncWalletBalancesForPayment(supabase, payment.id);
  return routingRow;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function mapRoutingLifecycleStatus(routing: PaymentRoutingRow | null) {
  if (!routing) {
    return "repair_required" as const;
  }

  if (isPayoutReadinessEligible(routing.payout_readiness_status) || routing.money_routing_status === "ready_for_payout") {
    return "eligible" as const;
  }

  if (routing.money_routing_status === "blocked" && routing.blocked_reason?.toLowerCase().includes("dispute")) {
    return "held" as const;
  }

  if (routing.money_routing_status === "paid_out") {
    return "released" as const;
  }

  if (routing.money_routing_status === "refunded") {
    return "reversed" as const;
  }

  return "pending" as const;
}

async function repairCompletedFreelanceAppointmentRoutingRecord(
  supabase: SupabaseClient,
  appointment: AppointmentRow,
  payment: PaymentRow
) {
  const existingRoutingResult = await supabase
    .from("payment_routing_records")
    .select(PAYMENT_ROUTING_SELECT)
    .eq("appointment_id", appointment.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingRoutingResult.error) {
    throw new FintechServiceError("Unable to inspect the existing payment routing ledger.", 500);
  }

  const existingRouting = (existingRoutingResult.data as PaymentRoutingRow | null) ?? null;
  console.info("[barber-appointment] complete_routing_lookup_result", {
    appointmentId: appointment.id,
    routingFound: Boolean(existingRouting)
  });

  const now = new Date().toISOString();
  const disputeHold = await hasActiveDisputeHold(supabase, appointment.reference_code ?? null);
  const paymentSucceeded = isCompletionPaymentSuccessful(payment);
  const providerGrossAmount = roundCurrency(numeric(payment.amount));
  const refundedAmount = 0;
  const providerFeeAmount = 0;
  const providerNetAmount = providerGrossAmount;
  const platformFeeAmount = roundCurrency(providerGrossAmount * PLATFORM_FEE_RATE);
  const barberPayoutAmount = roundCurrency(Math.max(providerGrossAmount - platformFeeAmount, 0));
  const shopSplitAmount = 0;
  const blockedReason = !paymentSucceeded
    ? "Payment was not captured successfully."
    : disputeHold
      ? "An active dispute or chargeback is blocking payout."
      : null;
  const constraintEvidence = await loadPaymentRoutingConstraintEvidence(supabase);
  const payoutReadinessStatus = blockedReason
    ? readinessDbValueForBusinessMeaning(constraintEvidence, "blocked") as FintechPayoutReadinessStatus
    : readinessDbValueForBusinessMeaning(constraintEvidence, "eligible") as FintechPayoutReadinessStatus;
  const moneyRoutingStatus = blockedReason
    ? moneyRoutingDbValueForStatus(constraintEvidence, "blocked")
    : moneyRoutingDbValueForPending(constraintEvidence) as MoneyRoutingStatus;
  const reconciliationStatus = reconciliationDbValueForStatus(
    constraintEvidence,
    existingRouting?.reconciliation_status ?? "open"
  );
  const eligibleAt = paymentSucceeded && !disputeHold ? existingRouting?.eligible_at ?? now : existingRouting?.eligible_at ?? null;
  const heldAt = disputeHold ? existingRouting?.held_at ?? now : existingRouting?.held_at ?? null;
  const routingPayload = {
    payment_id: payment.id,
    appointment_id: appointment.id,
    membership_id: appointment.membership_id ?? null,
    routing_model: "freelance" as RoutingModel,
    payout_recipient_type: "barber" as const,
    provider_gross_amount: providerGrossAmount,
    refunded_amount: refundedAmount,
    provider_fee_amount: providerFeeAmount,
    provider_net_amount: providerNetAmount,
    platform_fee_amount: platformFeeAmount,
    barber_payout_amount: barberPayoutAmount,
    shop_split_amount: shopSplitAmount,
    currency: (payment.currency || "usd").toLowerCase(),
    payout_readiness_status: payoutReadinessStatus,
    money_routing_status: moneyRoutingStatus,
    blocked_reason: blockedReason,
    eligible_at: eligibleAt,
    held_at: heldAt,
    released_at: existingRouting?.released_at ?? null,
    reversed_at: existingRouting?.reversed_at ?? null,
    processor_charge_id: existingRouting?.processor_charge_id ?? payment.provider_payment_intent_id ?? null,
    processor_balance_transaction_id: existingRouting?.processor_balance_transaction_id ?? null,
    reconciliation_status: reconciliationStatus,
    metadata: {
      ...(existingRouting?.metadata && typeof existingRouting.metadata === "object" ? existingRouting.metadata : {}),
      repairReason: "missing_routing_record_on_completion",
      source: "barber_complete_service",
      relationshipType: "freelance",
      readinessMeaning: payoutReadinessMeaning(payoutReadinessStatus),
      payoutReadinessDbValue: payoutReadinessStatus,
      moneyRoutingDbValue: moneyRoutingStatus,
      constraintSource: constraintEvidence.source,
      appointmentId: appointment.id,
      paymentId: payment.id,
      barberId: appointment.barber_id,
      clientId: appointment.client_id
    },
    created_at: existingRouting?.created_at ?? now,
    updated_at: now
  };
  const payloadKeys = Object.keys(routingPayload);

  if (!existingRouting) {
    console.info("[barber-appointment] complete_routing_repair_started", {
      appointmentId: appointment.id,
      paymentId: payment.id,
      payloadKeys,
      providerGrossAmount,
      platformFeeAmount,
      barberPayoutAmount,
      shopSplitAmount
    });
  }
  logAppointmentCompleteRoutingWrite({
    operation: existingRouting ? "update" : "insert",
    appointmentId: appointment.id,
    paymentId: payment.id,
    payloadKeys,
    providerGrossAmount,
    platformFeeAmount,
    barberPayoutAmount,
    shopSplitAmount,
    payoutReadinessStatus: routingPayload.payout_readiness_status,
    moneyRoutingStatus: routingPayload.money_routing_status,
    reconciliationStatus: routingPayload.reconciliation_status
  });

  const writeResult = existingRouting
    ? await supabase
      .from("payment_routing_records")
      .update(routingPayload)
      .eq("id", existingRouting.id)
      .select(PAYMENT_ROUTING_SELECT)
      .single()
    : await supabase
      .from("payment_routing_records")
      .insert(routingPayload)
      .select(PAYMENT_ROUTING_SELECT)
      .single();

  if (writeResult.error) {
    logAppointmentCompleteRoutingConstraintFailure({
      stage: existingRouting ? "routing_update" : "routing_insert",
      appointmentId: appointment.id,
      paymentId: payment.id,
      error: writeResult.error,
      payloadKeys,
      payoutReadinessStatus: routingPayload.payout_readiness_status,
      moneyRoutingStatus: routingPayload.money_routing_status,
      reconciliationStatus: routingPayload.reconciliation_status
    });
    console.error("[barber-appointment] complete_routing_repair_failed", {
      appointmentId: appointment.id,
      postgresCode: "code" in writeResult.error ? writeResult.error.code : null,
      postgresDetails: "details" in writeResult.error ? writeResult.error.details : null,
      errorMessage: "message" in writeResult.error ? writeResult.error.message : String(writeResult.error),
      payloadKeys
    });
    throw new FintechServiceError("Unable to write the payment routing ledger.", 500);
  }

  const routing = writeResult.data as PaymentRoutingRow;
  if (!existingRouting) {
    console.info("[barber-appointment] complete_routing_repair_succeeded", {
      appointmentId: routing.appointment_id,
      routingId: routing.id,
      payoutReadinessStatus: routing.payout_readiness_status,
      eligibleAtPresent: Boolean(routing.eligible_at)
    });
  }

  await recordRoutingLifecycleEvents(supabase, {
    routing,
    payment,
    appointment,
    existingRouting,
    relationshipType: "freelance",
    disputeHold
  });
  await syncWalletBalancesForPayment(supabase, payment.id);
  return routing;
}

async function loadAppointmentForPayoutEligibility(supabase: SupabaseClient, appointmentIdentifier: string) {
  const trimmed = appointmentIdentifier.trim();
  const primary = UUID_PATTERN.test(trimmed)
    ? await supabase
      .from("appointments")
      .select("id, reference_code, status, membership_id, barber_id, shop_id, location_id, client_id")
      .eq("id", trimmed)
      .maybeSingle()
    : await supabase
      .from("appointments")
      .select("id, reference_code, status, membership_id, barber_id, shop_id, location_id, client_id")
      .eq("reference_code", trimmed)
      .maybeSingle();

  if (primary.error) {
    throw new FintechServiceError("Unable to load the appointment for payout eligibility.", 500);
  }

  if (primary.data) {
    return primary.data as AppointmentRow;
  }

  if (!UUID_PATTERN.test(trimmed)) {
    const canonicalResult = await supabase
      .from("appointments")
      .select("id, reference_code, status, membership_id, barber_id, shop_id, location_id, client_id")
      .eq("id", canonicalAppointmentUuid(trimmed))
      .maybeSingle();

    if (canonicalResult.error) {
      throw new FintechServiceError("Unable to load the canonical appointment for payout eligibility.", 500);
    }

    if (canonicalResult.data) {
      return canonicalResult.data as AppointmentRow;
    }
  }

  throw new FintechServiceError("Appointment not found for payout eligibility.", 404);
}

export async function evaluatePayoutEligibilityForAppointment(
  supabase: SupabaseClient,
  appointmentIdentifier: string
) {
  const appointment = await loadAppointmentForPayoutEligibility(supabase, appointmentIdentifier);
  console.log("[payout] eligibility_evaluation_started", {
    appointmentId: appointment.id,
    appointmentStatus: appointment.status
  });

  const paymentResult = await supabase
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("appointment_id", appointment.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (paymentResult.error) {
    throw new FintechServiceError("Unable to load the appointment payment for payout eligibility.", 500);
  }

  const payments = ((paymentResult.data ?? []) as PaymentRow[]);
  const payment = payments.find(isCompletionPaymentSuccessful) ?? payments[0] ?? null;
  console.info("[barber-appointment] complete_payment_lookup_result", {
    appointmentId: appointment.id,
    paymentFound: Boolean(payment),
    paymentId: payment?.id ?? null,
    paymentStatus: getPaymentStatusForCompletion(payment),
    status: payment?.status ?? null,
    paymentStatusColumn: payment?.payment_status ?? null,
    amount: payment?.amount ?? null,
    currency: payment?.currency ?? null
  });
  if (!payment) {
    await recordPlatformEvent(supabase, {
      eventType: "routing_repair_required",
      entityType: "appointment",
      entityId: appointment.id,
      actorId: appointment.barber_id,
      source: "system",
      relatedIds: {
        appointmentId: appointment.id,
        barberId: appointment.barber_id,
        clientId: appointment.client_id
      },
      payload: {
        reason: "missing_payment",
        appointmentStatus: appointment.status
      },
      idempotencyKey: buildPlatformEventIdempotencyKey(["appointment", appointment.id, "routing-repair", "missing-payment"])
    });
    console.warn("[payout] eligibility_evaluation_result", {
      appointmentId: appointment.id,
      routingStatus: "repair_required",
      eligible: false,
      held: false,
      holdReason: "missing_payment"
    });
    return {
      appointmentId: appointment.id,
      paymentId: null,
      routingRecordId: null,
      relationshipType: "freelance" as RoutingModel,
      status: "repair_required" as const,
      barberAmountCents: 0,
      shopAmountCents: 0,
      platformAmountCents: 0
    };
  }

  const shouldRepairCompletedFreelanceRouting = appointment.status === "completed" && !appointment.shop_id;
  const routing = shouldRepairCompletedFreelanceRouting
    ? await repairCompletedFreelanceAppointmentRoutingRecord(supabase, appointment, payment)
    : await syncPaymentRoutingRecord(supabase, payment.id, {
      forceCompletionEligibility: appointment.status === "completed" && isCompletionPaymentSuccessful(payment),
      repairReason: "missing_routing_record_on_completion",
      source: "barber_complete_service"
    });
  const status = mapRoutingLifecycleStatus(routing);
  console.log("[payout] eligibility_evaluation_result", {
    appointmentId: appointment.id,
    paymentStatus: payment.payment_status,
    routingStatus: routing?.money_routing_status ?? "missing",
    eligible: status === "eligible",
    held: status === "held",
    holdReason: routing?.blocked_reason ?? null
  });

  return {
    appointmentId: appointment.id,
    paymentId: payment.id,
    routingRecordId: routing?.id ?? null,
    relationshipType: routing?.routing_model ?? "freelance",
    status,
    payoutReadinessStatus: routing?.payout_readiness_status ?? null,
    moneyRoutingStatus: routing?.money_routing_status ?? null,
    eligibleAt: routing?.eligible_at ?? null,
    releasedAt: routing?.released_at ?? null,
    barberAmountCents: Math.round(numeric(routing?.barber_payout_amount) * 100),
    shopAmountCents: Math.round(numeric(routing?.shop_split_amount) * 100),
    platformAmountCents: Math.round(numeric(routing?.platform_fee_amount) * 100)
  };
}

type RoutingExecutionTarget = {
  targetSubjectType: "barber" | "shop";
  amount: number;
  connectedAccount: ConnectedAccountRow | null;
};

function buildRoutingExecutionTargets(
  routing: PaymentRoutingRow,
  payment: PaymentRow,
  accountByBarberId: Map<string, ConnectedAccountRow>,
  accountByShopId: Map<string, ConnectedAccountRow>
) {
  const targets: RoutingExecutionTarget[] = [];

  if ((routing.payout_recipient_type === "barber" || routing.payout_recipient_type === "split") && numeric(routing.barber_payout_amount) > 0) {
    targets.push({
      targetSubjectType: "barber",
      amount: roundCurrency(numeric(routing.barber_payout_amount)),
      connectedAccount: payment.barber_id ? accountByBarberId.get(payment.barber_id) ?? null : null
    });
  }

  if ((routing.payout_recipient_type === "shop" || routing.payout_recipient_type === "split") && numeric(routing.shop_split_amount) > 0) {
    targets.push({
      targetSubjectType: "shop",
      amount: roundCurrency(numeric(routing.shop_split_amount)),
      connectedAccount: payment.shop_id ? accountByShopId.get(payment.shop_id) ?? null : null
    });
  }

  return targets;
}

function evaluateRoutingExecutionReadiness(
  routing: PaymentRoutingRow,
  payment: PaymentRow,
  accountByBarberId: Map<string, ConnectedAccountRow>,
  accountByShopId: Map<string, ConnectedAccountRow>
) {
  const targets = buildRoutingExecutionTargets(routing, payment, accountByBarberId, accountByShopId);
  const blockedReasons = targets
    .map((target) => determinePayoutExecutionBlockReason({
      paymentProvider: payment.provider,
      paymentStatus: normalizePaymentStatusForRouting(payment),
      moneyRoutingStatus: routing.money_routing_status,
      payoutReadinessStatus: target.connectedAccount?.payout_readiness_status ?? "not_ready",
      targetAmount: target.amount,
      processorChargeId: routing.processor_charge_id,
      targetProviderAccountId: target.connectedAccount?.provider_account_id ?? null,
      blockedReason: routing.blocked_reason
    }))
    .filter(Boolean) as string[];

  return {
    targets,
    executable: routing.money_routing_status === "ready_for_payout" && targets.length > 0 && blockedReasons.length === 0,
    blockedReasons,
    totalAmount: roundCurrency(targets.reduce((sum, target) => sum + target.amount, 0))
  };
}

function isAppointmentPayoutEligible(appointment: Pick<AppointmentRow, "status" | "completed_at"> | null | undefined) {
  if (!appointment) {
    return false;
  }

  return appointment.status === "completed" || Boolean(appointment.completed_at);
}

function isPosSalePayoutEligible(posSale: Pick<PosSaleRow, "status"> | null | undefined) {
  return posSale?.status === "paid";
}

function isRoutingEligibleForAvailablePayout(
  routing: PaymentRoutingRow,
  payment: PaymentRow | undefined,
  appointment: Pick<AppointmentRow, "status" | "completed_at"> | null | undefined,
  posSale?: Pick<PosSaleRow, "status"> | null | undefined
) {
  if (!payment || !isCompletionPaymentSuccessful(payment) || !(isAppointmentPayoutEligible(appointment) || isPosSalePayoutEligible(posSale))) {
    return false;
  }

  if (!isPayoutReadinessEligible(routing.payout_readiness_status)) {
    return false;
  }

  if (routing.released_at || routing.reversed_at) {
    return false;
  }

  if (routing.blocked_reason?.trim()) {
    return false;
  }

  if (routing.money_routing_status === "blocked" || routing.money_routing_status === "manual_review" || routing.money_routing_status === "refunded" || routing.money_routing_status === "paid_out") {
    return false;
  }

  return numeric(routing.barber_payout_amount) > 0 || numeric(routing.shop_split_amount) > 0;
}

async function loadPayoutExecutionsForPaymentIds(supabase: SupabaseClient, paymentIds: string[]) {
  if (!paymentIds.length) {
    return [] as PayoutExecutionRow[];
  }

  const result = await supabase
    .from("payout_executions")
    .select(PAYOUT_EXECUTION_SELECT)
    .in("payment_id", paymentIds)
    .order("updated_at", { ascending: false });

  if (result.error) {
    throw new FintechServiceError("Unable to load payout execution records.", 500);
  }

  return (result.data ?? []) as PayoutExecutionRow[];
}

async function loadPayoutExecutionsForRoutingId(supabase: SupabaseClient, routingId: string) {
  const result = await supabase
    .from("payout_executions")
    .select(PAYOUT_EXECUTION_SELECT)
    .eq("routing_record_id", routingId)
    .order("created_at", { ascending: true });

  if (result.error) {
    throw new FintechServiceError("Unable to load payout executions for reconciliation.", 500);
  }

  return (result.data ?? []) as PayoutExecutionRow[];
}

async function persistPayoutExecutionRow(
  supabase: SupabaseClient,
  existingId: string | null,
  values: Record<string, unknown>
) {
  if (existingId) {
    const result = await supabase
      .from("payout_executions")
      .update(values)
      .eq("id", existingId)
      .select(PAYOUT_EXECUTION_SELECT)
      .single();

    if (result.error) {
      throw new FintechServiceError("Unable to update the payout execution record.", 500);
    }

    return result.data as PayoutExecutionRow;
  }

  const result = await supabase
    .from("payout_executions")
    .insert(values)
    .select(PAYOUT_EXECUTION_SELECT)
    .single();

  if (result.error) {
    throw new FintechServiceError("Unable to create the payout execution record.", 500);
  }

  return result.data as PayoutExecutionRow;
}

function buildPayoutExecutionIdempotencyKey(
  routingId: string,
  targetSubjectType: "barber" | "shop",
  executionType: PayoutExecutionType,
  suffix?: string | null
) {
  return createPayoutExecutionIdempotencyKey(routingId, targetSubjectType, executionType, suffix);
}

async function syncRoutingExecutionState(supabase: SupabaseClient, routingId: string) {
  const routingResult = await supabase
    .from("payment_routing_records")
    .select(PAYMENT_ROUTING_SELECT)
    .eq("id", routingId)
    .maybeSingle();

  if (routingResult.error) {
    throw new FintechServiceError("Unable to reload the payment routing record for reconciliation.", 500);
  }

  if (!routingResult.data) {
    throw new FintechServiceError("Payment routing record not found for reconciliation.", 404);
  }

  const routing = routingResult.data as PaymentRoutingRow;
  const executions = await loadPayoutExecutionsForRoutingId(supabase, routing.id);
  const transferExecutions = executions.filter((row) => row.execution_type === "transfer");
  const reversalExecutions = executions.filter((row) => row.execution_type === "reversal");

  for (const transferExecution of transferExecutions) {
    const relatedReversals = reversalExecutions.filter((row) => row.source_execution_id === transferExecution.id);
    const executedAmount = transferExecution.execution_status === "executed"
      ? numeric(transferExecution.amount)
      : 0;
    const reversedAmount = relatedReversals
      .filter((row) => row.execution_status === "reversed")
      .reduce((sum, row) => sum + numeric(row.amount), 0);
    const targetAmount = transferExecution.target_subject_type === "barber"
      ? numeric(routing.barber_payout_amount)
      : numeric(routing.shop_split_amount);
    const reconciliationStatus = derivePayoutExecutionReconciliationStatus({
      targetAmount,
      executedAmount,
      reversedAmount,
      hasFailures: transferExecution.execution_status === "failed" || relatedReversals.some((row) => row.execution_status === "failed"),
      hasBlockedExecutions: transferExecution.execution_status === "blocked" || relatedReversals.some((row) => row.execution_status === "blocked"),
      routingStatus: routing.money_routing_status
    });

    if (transferExecution.reconciliation_status !== reconciliationStatus) {
      await persistPayoutExecutionRow(supabase, transferExecution.id, {
        reconciliation_status: reconciliationStatus,
        updated_at: new Date().toISOString()
      });
    }
  }

  for (const reversalExecution of reversalExecutions) {
    const nextReconciliationStatus =
      reversalExecution.execution_status === "reversed"
        ? "reversed"
        : reversalExecution.execution_status === "failed" || reversalExecution.execution_status === "blocked"
          ? "manual_review"
          : reversalExecution.reconciliation_status;

    if (reversalExecution.reconciliation_status !== nextReconciliationStatus) {
      await persistPayoutExecutionRow(supabase, reversalExecution.id, {
        reconciliation_status: nextReconciliationStatus,
        updated_at: new Date().toISOString()
      });
    }
  }

  const totalExecutedAmount = transferExecutions
    .filter((row) => row.execution_status === "executed")
    .reduce((sum, row) => sum + numeric(row.amount), 0);
  const totalReversedAmount = reversalExecutions
    .filter((row) => row.execution_status === "reversed")
    .reduce((sum, row) => sum + numeric(row.amount), 0);
  const targetAmount = roundCurrency(numeric(routing.barber_payout_amount) + numeric(routing.shop_split_amount));
  const netExecutedAmount = roundCurrency(Math.max(totalExecutedAmount - totalReversedAmount, 0));
  const reconciliationStatus = derivePayoutExecutionReconciliationStatus({
    targetAmount,
    executedAmount: totalExecutedAmount,
    reversedAmount: totalReversedAmount,
    hasFailures: executions.some((row) => row.execution_status === "failed"),
    hasBlockedExecutions: executions.some((row) => row.execution_status === "blocked"),
    routingStatus: routing.money_routing_status
  });
  const nextMoneyRoutingStatus: MoneyRoutingStatus =
    routing.money_routing_status === "refunded"
      ? "refunded"
      : (targetAmount > 0 && netExecutedAmount === targetAmount && reconciliationStatus !== "manual_review")
        ? "paid_out"
        : routing.money_routing_status;

  if (
    routing.reconciliation_status !== reconciliationStatus
    || routing.money_routing_status !== nextMoneyRoutingStatus
  ) {
    const updateResult = await supabase
      .from("payment_routing_records")
      .update({
        reconciliation_status: reconciliationStatus,
        money_routing_status: nextMoneyRoutingStatus,
        last_reconciled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", routing.id)
      .select(PAYMENT_ROUTING_SELECT)
      .single();

    if (updateResult.error) {
      throw new FintechServiceError("Unable to update payout reconciliation state.", 500);
    }

    await syncWalletBalancesForPayment(supabase, routing.payment_id);
    return updateResult.data as PaymentRoutingRow;
  }

  await syncWalletBalancesForPayment(supabase, routing.payment_id);
  return routing;
}

function mapPayoutExecutionView(
  execution: PayoutExecutionRow,
  routing: PaymentRoutingRow | undefined,
  payment: PaymentRow | undefined,
  barberName: string | null,
  shopLabel: string | null
): PayoutExecutionView {
  const targetDisplayName = execution.target_subject_type === "barber" ? barberName : shopLabel;

  return {
    id: execution.id,
    routingRecordId: execution.routing_record_id,
    paymentId: execution.payment_id,
    appointmentId: execution.appointment_id,
    targetSubjectType: execution.target_subject_type,
    targetDisplayName,
    barberName,
    shopLabel,
    routingModel: routing?.routing_model ?? "commission",
    executionType: execution.execution_type,
    executionStatus: execution.execution_status,
    reconciliationStatus: execution.reconciliation_status,
    amount: numeric(execution.amount),
    payoutReference: execution.payout_reference,
    payoutSpeed: execution.payout_speed,
    instantPayoutFeeAmount: numeric(execution.instant_payout_fee_amount),
    netTransferAmount: numeric(execution.net_transfer_amount),
    currency: execution.currency,
    blockedReason: execution.blocked_reason,
    failureReason: execution.failure_reason,
    processorTransferId: execution.processor_transfer_id,
    processorPayoutId: execution.processor_payout_id,
    processorReversalId: execution.processor_reversal_id,
    providerFeeAmount: routing ? numeric(routing.provider_fee_amount) : 0,
    platformFeeAmount: routing ? numeric(routing.platform_fee_amount) : 0,
    createdAt: execution.created_at,
    executedAt: execution.executed_at,
    failedAt: execution.failed_at,
    reversedAt: execution.reversed_at
  };
}

function summarizeExecutionViews(
  executions: PayoutExecutionView[],
  readyRouting: FintechRoutingView[],
  eligibleRouting: FintechRoutingView[] = readyRouting,
  options: { includeShopSplit?: boolean } = {}
) {
  const includeShopSplit = options.includeShopSplit !== false;
  const routedAmount = (row: FintechRoutingView) => row.barberPayoutAmount + (includeShopSplit ? row.shopSplitAmount : 0);

  return {
    executableRoutingRecords: readyRouting.length,
    eligibleRoutingRecords: eligibleRouting.length,
    readyForPayoutAmount: roundCurrency(
      readyRouting.reduce((sum, row) => sum + routedAmount(row), 0)
    ),
    eligiblePayoutAmount: roundCurrency(
      eligibleRouting.reduce((sum, row) => sum + routedAmount(row), 0)
    ),
    blockedExecutionRecords: executions.filter((row) => row.executionStatus === "blocked").length,
    failedExecutionRecords: executions.filter((row) => row.executionStatus === "failed").length,
    executedTransferCount: executions.filter((row) => row.executionType === "transfer" && row.executionStatus === "executed").length,
    reversedExecutionCount: executions.filter((row) => row.executionType === "reversal" && row.executionStatus === "reversed").length,
    executedAmount: roundCurrency(
      executions
        .filter((row) => row.executionType === "transfer" && row.executionStatus === "executed")
        .reduce((sum, row) => sum + row.amount, 0)
    ),
    reversedAmount: roundCurrency(
      executions
        .filter((row) => row.executionType === "reversal" && row.executionStatus === "reversed")
        .reduce((sum, row) => sum + row.amount, 0)
    ),
    processorFeeTracked: roundCurrency(
      readyRouting.reduce((sum, row) => sum + row.processorFeeAmount, 0)
    )
  };
}

function centsToAmount(value: number | string | null | undefined) {
  return roundCurrency(numeric(value) / 100);
}

function isIsoOnBusinessDate(value: string | null | undefined, businessDate: string) {
  return Boolean(value && value.slice(0, 10) === businessDate);
}

type SalesTrendRange = "today" | "week" | "month" | "year";

type SalesTrendBucket = SalesTrendPoint & {
  startMs: number;
  endMs: number;
};

const SALES_TREND_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SALES_TREND_MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setUTCHours(next.getUTCHours() + hours);
  return next;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function formatHourBucketLabel(hour: number) {
  if (hour === 0) {
    return "12 AM";
  }
  if (hour < 12) {
    return `${hour} AM`;
  }
  if (hour === 12) {
    return "12 PM";
  }
  return `${hour - 12} PM`;
}

function createSalesTrendBuckets(range: SalesTrendRange, now = new Date()): SalesTrendBucket[] {
  // Sales Pulse uses server UTC boundaries until barber/shop timezone is available in this payload.
  const todayStart = startOfUtcDay(now);
  if (range === "today") {
    return Array.from({ length: 24 }, (_, hour) => {
      const start = addUtcHours(todayStart, hour);
      return {
        label: formatHourBucketLabel(hour),
        cashCents: 0,
        cardAppCents: 0,
        grossCents: 0,
        startMs: start.getTime(),
        endMs: addUtcHours(start, 1).getTime()
      };
    });
  }

  if (range === "week") {
    const weekStart = addUtcDays(todayStart, -todayStart.getUTCDay());
    return Array.from({ length: 7 }, (_, day) => {
      const start = addUtcDays(weekStart, day);
      return {
        label: SALES_TREND_WEEKDAY_LABELS[day],
        cashCents: 0,
        cardAppCents: 0,
        grossCents: 0,
        startMs: start.getTime(),
        endMs: addUtcDays(start, 1).getTime()
      };
    });
  }

  if (range === "month") {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = addUtcMonths(monthStart, 1);
    return Array.from({ length: 5 }, (_, week) => {
      const start = addUtcDays(monthStart, week * 7);
      const end = week === 4 ? nextMonthStart : addUtcDays(monthStart, (week + 1) * 7);
      return {
        label: `Week ${week + 1}`,
        cashCents: 0,
        cardAppCents: 0,
        grossCents: 0,
        startMs: start.getTime(),
        endMs: end.getTime()
      };
    });
  }

  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return Array.from({ length: 12 }, (_, month) => {
    const start = addUtcMonths(yearStart, month);
    return {
      label: SALES_TREND_MONTH_LABELS[month],
      cashCents: 0,
      cardAppCents: 0,
      grossCents: 0,
      startMs: start.getTime(),
      endMs: addUtcMonths(start, 1).getTime()
    };
  });
}

function timestampMs(value: string | null | undefined) {
  const ms = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
}

function addToSalesTrendBuckets(
  buckets: SalesTrendBucket[],
  timestamp: string | null | undefined,
  key: "cashCents" | "cardAppCents",
  cents: number
) {
  const occurredAt = timestampMs(timestamp);
  if (!occurredAt || cents <= 0) {
    return;
  }

  const bucket = buckets.find((entry) => occurredAt >= entry.startMs && occurredAt < entry.endMs);
  if (!bucket) {
    return;
  }

  bucket[key] += cents;
  bucket.grossCents = bucket.cashCents + bucket.cardAppCents;
}

function stripSalesTrendBucketMeta(buckets: SalesTrendBucket[]): SalesTrendPoint[] {
  return buckets.map(({ label, cashCents, cardAppCents, grossCents }) => ({
    label,
    cashCents,
    cardAppCents,
    grossCents
  }));
}

function buildSalesTrend(input: {
  posSales: PosSaleRow[];
  payments: PaymentRow[];
  now?: Date;
}): BarberPayoutsPayload["salesTrend"] {
  const now = input.now ?? new Date();
  const buckets = {
    today: createSalesTrendBuckets("today", now),
    week: createSalesTrendBuckets("week", now),
    month: createSalesTrendBuckets("month", now),
    year: createSalesTrendBuckets("year", now)
  };

  const addCashSale = (timestamp: string | null | undefined, cents: number) => {
    for (const rangeBuckets of Object.values(buckets)) {
      addToSalesTrendBuckets(rangeBuckets, timestamp, "cashCents", cents);
    }
  };
  const addCardAppSale = (timestamp: string | null | undefined, cents: number) => {
    for (const rangeBuckets of Object.values(buckets)) {
      addToSalesTrendBuckets(rangeBuckets, timestamp, "cardAppCents", cents);
    }
  };

  for (const sale of input.posSales) {
    if (!isCashPosSale(sale) || !isPaidPosSale(sale)) {
      continue;
    }
    addCashSale(
      sale.cash_recorded_at ?? sale.completed_at ?? sale.updated_at ?? sale.created_at,
      Math.round(posSaleTotalCents(sale))
    );
  }

  for (const payment of input.payments) {
    if (!isCompletionPaymentSuccessful(payment) || !Boolean(payment.appointment_id || payment.pos_sale_id)) {
      continue;
    }
    addCardAppSale(payment.paid_at ?? payment.created_at, Math.round(numeric(payment.amount) * 100));
  }

  return {
    today: stripSalesTrendBucketMeta(buckets.today),
    week: stripSalesTrendBucketMeta(buckets.week),
    month: stripSalesTrendBucketMeta(buckets.month),
    year: stripSalesTrendBucketMeta(buckets.year)
  };
}

function posSaleTotalCents(sale: PosSaleRow) {
  return numeric(sale.total_cents ?? sale.total_amount_cents ?? sale.amount_cents ?? sale.subtotal_cents);
}

function isCashPosSale(sale: PosSaleRow) {
  return String(sale.payment_method ?? "").toLowerCase() === "cash";
}

function isPaidPosSale(sale: PosSaleRow) {
  return String(sale.status ?? "").toLowerCase() === "paid";
}

function isPendingPaymentRequest(request: PosPaymentRequestRow) {
  return ACTIVE_POS_PAYMENT_REQUEST_STATUSES.has(String(request.status ?? "").toLowerCase());
}

function profileDisplayName(profile: ProfileRow | null | undefined) {
  return profile?.full_name?.trim() || profile?.email || null;
}

async function loadBarberMoneyReporting(input: {
  supabase: SupabaseClient;
  barberId: string;
  payments: PaymentRow[];
  routingRows: PaymentRoutingRow[];
  eligiblePayoutAmount: number;
  executedAmount: number;
}) {
  const { supabase, barberId, payments, routingRows, eligiblePayoutAmount, executedAmount } = input;
  const today = new Date().toISOString().slice(0, 10);
  const posSalesResult = await supabase
    .from("pos_sales")
    .select(POS_SALE_SELECT)
    .eq("barber_id", barberId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (posSalesResult.error) {
    throw new FintechServiceError("Unable to load barber POS transactions.", 500);
  }

  const posSales = (posSalesResult.data ?? []) as PosSaleRow[];
  const posSaleIds = posSales.map((sale) => sale.id);
  const posRequestsResult = posSaleIds.length
    ? await supabase
      .from("pos_payment_requests")
      .select(POS_PAYMENT_REQUEST_SELECT)
      .in("pos_sale_id", posSaleIds)
      .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (posRequestsResult.error) {
    throw new FintechServiceError("Unable to load barber POS payment requests.", 500);
  }

  const posRequests = (posRequestsResult.data ?? []) as PosPaymentRequestRow[];
  const requestBySaleId = new Map<string, PosPaymentRequestRow>();
  for (const request of posRequests) {
    if (!requestBySaleId.has(request.pos_sale_id)) {
      requestBySaleId.set(request.pos_sale_id, request);
    }
  }

  const appointmentIds = [...new Set(payments.map((payment) => payment.appointment_id).filter(Boolean) as string[])];
  const appointmentsResult = appointmentIds.length
    ? await supabase
      .from("appointments")
      .select("id, reference_code, status, completed_at, starts_at, service_id, client_id, barber_id, shop_id, location_id")
      .in("id", appointmentIds)
    : { data: [], error: null };

  if (appointmentsResult.error) {
    throw new FintechServiceError("Unable to load barber paid appointment transactions.", 500);
  }

  const appointments = (appointmentsResult.data ?? []) as BarberTransactionAppointmentRow[];
  const appointmentById = new Map(appointments.map((appointment) => [appointment.id, appointment]));
  const serviceIds = [...new Set(appointments.map((appointment) => appointment.service_id).filter(Boolean) as string[])];
  const servicesResult = serviceIds.length
    ? await supabase
      .from("services")
      .select("id, name")
      .in("id", serviceIds)
    : { data: [], error: null };

  if (servicesResult.error) {
    throw new FintechServiceError("Unable to load barber transaction services.", 500);
  }

  const serviceNameById = new Map(
    ((servicesResult.data ?? []) as ServiceDirectoryRow[]).map((service) => [service.id, service.name ?? "Service"])
  );
  const clientIds = [...new Set([
    ...payments.map((payment) => payment.client_id),
    ...appointments.map((appointment) => appointment.client_id),
    ...posSales.map((sale) => sale.client_id),
    ...posRequests.map((request) => request.client_id)
  ].filter(Boolean) as string[])];
  const clientsResult = clientIds.length
    ? await supabase
      .from("clients")
      .select("id, profile_id, reference_code")
      .in("id", clientIds)
    : { data: [], error: null };

  if (clientsResult.error) {
    throw new FintechServiceError("Unable to load barber transaction clients.", 500);
  }

  const clients = (clientsResult.data ?? []) as ClientDirectoryRow[];
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const profileIds = [...new Set(clients.map((client) => client.profile_id).filter(Boolean) as string[])];
  const profilesResult = profileIds.length
    ? await supabase
      .from("profiles")
      .select("id, email, full_name, phone, role")
      .in("id", profileIds)
    : { data: [], error: null };

  if (profilesResult.error) {
    throw new FintechServiceError("Unable to load barber transaction profile details.", 500);
  }

  const profileById = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
  const profileForClient = (clientId: string | null | undefined) => {
    const client = clientId ? clientById.get(clientId) : null;
    return client?.profile_id ? profileById.get(client.profile_id) ?? null : null;
  };
  const routingByPaymentId = new Map(routingRows.map((routing) => [routing.payment_id, routing]));
  const routingByPosSaleId = new Map(
    routingRows
      .filter((routing) => routing.pos_sale_id)
      .map((routing) => [routing.pos_sale_id as string, routing])
  );
  const paymentByPosSaleId = new Map(
    payments
      .filter((payment) => payment.pos_sale_id)
      .map((payment) => [payment.pos_sale_id as string, payment])
  );

  const cashSalesToday = posSales.filter((sale) =>
    isCashPosSale(sale)
    && isPaidPosSale(sale)
    && isIsoOnBusinessDate(sale.cash_recorded_at ?? sale.completed_at ?? sale.updated_at ?? sale.created_at, today)
  );
  const paidPlatformPaymentsToday = payments.filter((payment) =>
    isCompletionPaymentSuccessful(payment)
    && isIsoOnBusinessDate(payment.paid_at ?? payment.created_at, today)
    && Boolean(payment.appointment_id || payment.pos_sale_id)
  );
  const paidCardPosSalesToday = posSales.filter((sale) =>
    !isCashPosSale(sale)
    && isPaidPosSale(sale)
    && isIsoOnBusinessDate(sale.updated_at ?? sale.created_at, today)
  );

  const transactions: BarberPayoutsPayload["transactions"] = [];
  for (const payment of payments.filter((row) => row.appointment_id && isCompletionPaymentSuccessful(row))) {
    const appointment = payment.appointment_id ? appointmentById.get(payment.appointment_id) : null;
    const profile = profileForClient(appointment?.client_id ?? payment.client_id);
    const routing = routingByPaymentId.get(payment.id);
    transactions.push({
      id: `appointment:${payment.id}`,
      transactionType: "appointment",
      sourceId: payment.id,
      appointmentId: payment.appointment_id,
      posSaleId: null,
      paymentId: payment.id,
      requestId: null,
      messageThreadId: null,
      clientId: appointment?.client_id ?? payment.client_id,
      clientProfileId: profile?.id ?? null,
      customerName: profileDisplayName(profile) ?? "Client",
      customerPhone: profile?.phone ?? null,
      customerEmail: profile?.email ?? null,
      serviceLabel: appointment?.service_id ? serviceNameById.get(appointment.service_id) ?? "Service" : "Service",
      note: null,
      occurredAt: payment.paid_at ?? appointment?.completed_at ?? appointment?.starts_at ?? payment.created_at,
      paymentMethodLabel: "Card/App",
      grossAmount: roundCurrency(numeric(payment.amount)),
      platformFeeAmount: roundCurrency(numeric(routing?.platform_fee_amount)),
      barberPayoutAmount: routing ? roundCurrency(numeric(routing.barber_payout_amount)) : null,
      status: appointment?.status ?? payment.payment_status,
      statusLabel: appointment?.status === "completed" ? "Completed / Paid" : "Paid",
      postureLabel: "Collected through BVRB3R. Eligible after routing.",
      canMessage: Boolean(profile?.id)
    });
  }

  for (const sale of posSales) {
    const request = requestBySaleId.get(sale.id) ?? null;
    const payment = sale.payment_id ? payments.find((row) => row.id === sale.payment_id) ?? null : paymentByPosSaleId.get(sale.id) ?? null;
    const routing = routingByPosSaleId.get(sale.id) ?? (payment ? routingByPaymentId.get(payment.id) : undefined);
    const profile = profileForClient(sale.client_id ?? request?.client_id);
    const isCash = isCashPosSale(sale);
    const requestStatus = String(request?.status ?? "").toLowerCase();
    const isClosedDuplicateRequest = CLOSED_DUPLICATE_POS_PAYMENT_REQUEST_STATUSES.has(requestStatus);
    const isNoPaymentRequest = NO_PAYMENT_POS_PAYMENT_REQUEST_STATUSES.has(requestStatus) || sale.status === "voided";
    const isPlatformCollected = !isCash && (isPaidPosSale(sale) || requestStatus === "paid" || requestStatus === "approved");
    const statusLabel = isCash
      ? "Cash recorded"
      : request && isPendingPaymentRequest(request)
        ? "Pending approval"
        : requestStatus === "declined"
          ? "Declined"
          : isClosedDuplicateRequest
            ? "Closed duplicate"
          : requestStatus === "canceled" || requestStatus === "voided" || sale.status === "voided"
            ? "Canceled"
          : requestStatus === "expired"
            ? "Expired"
          : requestStatus === "failed"
            ? "Failed"
            : isPlatformCollected
              ? "Paid"
              : "Pending approval";

    transactions.push({
      id: `pos:${sale.id}`,
      transactionType: isCash ? "pos_cash" : request && !isPaidPosSale(sale) ? "pos_request" : "pos_card",
      sourceId: sale.id,
      appointmentId: null,
      posSaleId: sale.id,
      paymentId: payment?.id ?? sale.payment_id ?? null,
      requestId: request?.id ?? null,
      messageThreadId: request?.message_thread_id ?? null,
      clientId: sale.client_id ?? request?.client_id ?? null,
      clientProfileId: profile?.id ?? null,
      customerName: (profileDisplayName(profile) ?? sale.customer_name?.trim() ?? "") || "Walk-in customer",
      customerPhone: profile?.phone ?? sale.customer_phone ?? null,
      customerEmail: profile?.email ?? sale.customer_email ?? null,
      serviceLabel: sale.note?.trim() || "Custom Amount",
      note: sale.note ?? null,
      occurredAt: isCash ? sale.cash_recorded_at ?? sale.created_at : request?.requested_at ?? payment?.paid_at ?? sale.updated_at ?? sale.created_at,
      paymentMethodLabel: isCash ? "Cash" : "Card on File",
      grossAmount: centsToAmount(posSaleTotalCents(sale) || request?.amount_cents),
      platformFeeAmount: isCash ? 0 : roundCurrency(numeric(routing?.platform_fee_amount ?? sale.platform_fee_cents) / (routing ? 1 : 100)),
      barberPayoutAmount: isCash ? null : routing ? roundCurrency(numeric(routing.barber_payout_amount)) : null,
      status: sale.status,
      statusLabel,
      postureLabel: isCash
        ? "Cash collected directly. No platform payout."
        : isPlatformCollected
          ? "Collected through BVRB3R. Eligible after routing."
          : isNoPaymentRequest
            ? "No payment collected."
            : "Awaiting client approval.",
      canMessage: Boolean(profile?.id) && !isClosedDuplicateRequest
    });
  }

  transactions.sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());

  const cashCollectedToday = roundCurrency(cashSalesToday.reduce((sum, sale) => sum + centsToAmount(posSaleTotalCents(sale)), 0));
  const cardAppCollectedToday = roundCurrency(paidPlatformPaymentsToday.reduce((sum, payment) => sum + numeric(payment.amount), 0));
  const salesTrend = buildSalesTrend({ posSales, payments });

  return {
    moneyPosture: {
      cashCollectedToday,
      cardAppCollectedToday,
      appPayoutEligible: eligiblePayoutAmount,
      grossTotalToday: roundCurrency(cashCollectedToday + cardAppCollectedToday),
      paidAppointmentsCount: paidPlatformPaymentsToday.filter((payment) => Boolean(payment.appointment_id)).length,
      cashSalesCount: cashSalesToday.length,
      cardPosSalesCount: paidCardPosSalesToday.length,
      pendingPaymentRequestsCount: posRequests.filter(isPendingPaymentRequest).length,
      releasedPayoutAmount: executedAmount
    },
    transactions: transactions.slice(0, 30),
    salesTrend
  };
}

export async function syncStripeSettlementForPayment(
  supabase: SupabaseClient,
  paymentId: string,
  options?: { throwOnError?: boolean }
) {
  const { payment } = await loadPaymentAndContext(supabase, paymentId);
  if (payment.provider !== "stripe" || !payment.provider_payment_intent_id?.trim()) {
    return null;
  }

  try {
    const paymentIntent = await retrieveStripePaymentIntentSettlement(payment.provider_payment_intent_id);
    const latestCharge = typeof paymentIntent.latest_charge === "string" ? null : paymentIntent.latest_charge;
    const balanceTransaction =
      latestCharge
      && latestCharge.balance_transaction
      && typeof latestCharge.balance_transaction !== "string"
        ? latestCharge.balance_transaction
        : null;

    const routing = await syncPaymentRoutingRecord(supabase, payment.id, {
      providerFeeAmount: balanceTransaction ? roundCurrency(balanceTransaction.fee / 100) : 0,
      processorChargeId: latestCharge?.id ?? null,
      processorBalanceTransactionId: balanceTransaction?.id ?? null,
      lastReconciledAt: new Date().toISOString()
    });

    if (routing) {
      await syncRoutingExecutionState(supabase, routing.id);
    }

    return routing;
  } catch (error) {
    if (options?.throwOnError) {
      throw toFintechServiceError(error, "Unable to sync processor settlement for the payment.");
    }
    return null;
  }
}

async function executeTransferForRoutingTarget(
  supabase: SupabaseClient,
  routing: PaymentRoutingRow,
  payment: PaymentRow,
  target: RoutingExecutionTarget,
  initiatedBy: string,
  speed: "standard" | "instant" = "standard"
) {
  const existingResult = await supabase
    .from("payout_executions")
    .select(PAYOUT_EXECUTION_SELECT)
    .eq("routing_record_id", routing.id)
    .eq("target_subject_type", target.targetSubjectType)
    .eq("execution_type", "transfer")
    .maybeSingle();

  if (existingResult.error) {
    throw new FintechServiceError("Unable to inspect existing payout transfer executions.", 500);
  }

  const existing = (existingResult.data as PayoutExecutionRow | null) ?? null;
  if (existing?.execution_status === "executed" && existing.processor_transfer_id) {
    return existing;
  }

  const blockedReason = determinePayoutExecutionBlockReason({
    paymentProvider: payment.provider,
    paymentStatus: normalizePaymentStatusForRouting(payment),
    moneyRoutingStatus: routing.money_routing_status,
    payoutReadinessStatus: target.connectedAccount?.payout_readiness_status ?? "not_ready",
    targetAmount: target.amount,
    processorChargeId: routing.processor_charge_id,
    targetProviderAccountId: target.connectedAccount?.provider_account_id ?? null,
    blockedReason: routing.blocked_reason
  });
  const now = new Date().toISOString();
  const payoutMath = calculateInstantPayoutAmounts({
    grossAmount: target.amount,
    speed
  });
  const payoutReference = existing?.payout_reference ?? `payout:${routing.id}:${target.targetSubjectType}`;

  const plannedExecution = await persistPayoutExecutionRow(supabase, existing?.id ?? null, {
    routing_record_id: routing.id,
    payment_id: routing.payment_id,
    appointment_id: routing.appointment_id,
    membership_id: routing.membership_id,
    target_subject_type: target.targetSubjectType,
    execution_type: "transfer",
    target_connected_account_id: target.connectedAccount?.id ?? null,
    target_provider_account_id: target.connectedAccount?.provider_account_id ?? null,
    amount: payoutMath.grossAmount,
    currency: routing.currency.toLowerCase(),
    execution_status: blockedReason ? "blocked" : "pending",
    blocked_reason: blockedReason,
    failure_reason: null,
    processor_transfer_id: existing?.processor_transfer_id ?? null,
    processor_reversal_id: existing?.processor_reversal_id ?? null,
    idempotency_key: existing?.idempotency_key ?? buildPayoutExecutionIdempotencyKey(routing.id, target.targetSubjectType, "transfer"),
    source_execution_id: null,
    source_refund_id: null,
    payout_reference: payoutReference,
    payout_speed: payoutMath.speed,
    instant_payout_fee_amount: payoutMath.instantFeeAmount,
    net_transfer_amount: payoutMath.netTransferAmount,
    processor_payout_id: existing?.processor_payout_id ?? null,
    reconciliation_status: blockedReason ? "manual_review" : "open",
    metadata: {
      routingModel: routing.routing_model,
      payoutRecipientType: routing.payout_recipient_type,
      paymentStatus: payment.payment_status,
      paymentType: payment.payment_type,
      payoutSpeed: payoutMath.speed,
      instantPayoutFeeAmount: payoutMath.instantFeeAmount,
      netTransferAmount: payoutMath.netTransferAmount
    },
    initiated_by: existing?.initiated_by ?? initiatedBy,
    last_attempted_at: blockedReason ? existing?.last_attempted_at ?? null : now,
    attempt_count: blockedReason ? existing?.attempt_count ?? 0 : (existing?.attempt_count ?? 0) + 1,
    created_at: existing?.created_at ?? now,
    updated_at: now
  });

  if (blockedReason) {
    return plannedExecution;
  }

  try {
    const transfer = await createStripeTransfer({
      amount: payoutMath.netTransferAmount,
      currency: routing.currency,
      destinationAccountId: target.connectedAccount!.provider_account_id!,
      transferGroup: `bvrb3r:payment:${routing.payment_id}`,
      metadata: {
        routing_record_id: routing.id,
        payment_id: routing.payment_id,
        appointment_id: routing.appointment_id ?? "",
        execution_id: plannedExecution.id,
        target_subject_type: target.targetSubjectType,
        payout_reference: payoutReference,
        payout_speed: payoutMath.speed
      },
      idempotencyKey: plannedExecution.idempotency_key
    });

    const executedExecution = await persistPayoutExecutionRow(supabase, plannedExecution.id, {
      execution_status: "executed",
      blocked_reason: null,
      failure_reason: null,
      processor_transfer_id: transfer.id,
      payout_reference: payoutReference,
      payout_speed: payoutMath.speed,
      instant_payout_fee_amount: payoutMath.instantFeeAmount,
      net_transfer_amount: payoutMath.netTransferAmount,
      reconciliation_status: "settled",
      executed_at: now,
      last_attempted_at: now,
      updated_at: now
    });

    await recordRequiredPlatformEvent(supabase, {
      eventType: "payout_released",
      entityType: "payout_execution",
      entityId: executedExecution.id,
      actorId: initiatedBy,
      source: "api",
      relatedIds: {
        payoutExecutionId: executedExecution.id,
        routingRecordId: routing.id,
        paymentId: routing.payment_id,
        appointmentId: routing.appointment_id,
        membershipId: routing.membership_id,
        targetConnectedAccountId: target.connectedAccount?.id,
        targetSubjectType: target.targetSubjectType,
        processorTransferId: transfer.id
      },
      payload: {
        amount: payoutMath.grossAmount,
        netTransferAmount: payoutMath.netTransferAmount,
        instantPayoutFeeAmount: payoutMath.instantFeeAmount,
        currency: routing.currency.toLowerCase(),
        payoutSpeed: payoutMath.speed,
        routingModel: routing.routing_model,
        payoutRecipientType: routing.payout_recipient_type
      },
      idempotencyKey: buildPlatformEventIdempotencyKey(["payout", executedExecution.id, "released"])
    });

    return executedExecution;
  } catch (error) {
    return persistPayoutExecutionRow(supabase, plannedExecution.id, {
      execution_status: "failed",
      failure_reason: error instanceof Error ? error.message : "Transfer execution failed.",
      blocked_reason: null,
      payout_reference: payoutReference,
      payout_speed: payoutMath.speed,
      instant_payout_fee_amount: payoutMath.instantFeeAmount,
      net_transfer_amount: payoutMath.netTransferAmount,
      reconciliation_status: "manual_review",
      failed_at: now,
      last_attempted_at: now,
      updated_at: now
    });
  }
}

export async function reconcilePaymentPayoutExecutions(
  supabase: SupabaseClient,
  paymentId: string,
  input?: {
    refundId?: string | null;
    initiatedBy?: string | null;
  }
) {
  const routingResult = await supabase
    .from("payment_routing_records")
    .select(PAYMENT_ROUTING_SELECT)
    .eq("payment_id", paymentId)
    .maybeSingle();

  if (routingResult.error) {
    throw new FintechServiceError("Unable to load the payment routing record for payout reconciliation.", 500);
  }

  if (!routingResult.data) {
    return null;
  }

  const routing = routingResult.data as PaymentRoutingRow;
  const { payment } = await loadPaymentAndContext(supabase, paymentId);
  const transferExecutions = (await loadPayoutExecutionsForRoutingId(supabase, routing.id))
    .filter((row) => row.execution_type === "transfer" && row.execution_status === "executed" && row.processor_transfer_id);

  for (const transferExecution of transferExecutions) {
    const targetAmount = transferExecution.target_subject_type === "barber"
      ? numeric(routing.barber_payout_amount)
      : numeric(routing.shop_split_amount);
    const reversedAmountResult = await supabase
      .from("payout_executions")
      .select(PAYOUT_EXECUTION_SELECT)
      .eq("source_execution_id", transferExecution.id)
      .eq("execution_type", "reversal");

    if (reversedAmountResult.error) {
      throw new FintechServiceError("Unable to inspect payout reversal history.", 500);
    }

    const existingReversals = (reversedAmountResult.data ?? []) as PayoutExecutionRow[];
    const reversedAmount = existingReversals
      .filter((row) => row.execution_status === "reversed")
      .reduce((sum, row) => sum + numeric(row.amount), 0);
    const currentlyTransferredAmount = roundCurrency(Math.max(numeric(transferExecution.amount) - reversedAmount, 0));
    const reversalNeeded = roundCurrency(Math.max(currentlyTransferredAmount - targetAmount, 0));

    if (reversalNeeded <= 0) {
      continue;
    }

    const existingForRefund = input?.refundId
      ? existingReversals.find((row) => row.source_refund_id === input.refundId)
      : null;
    if (existingForRefund && existingForRefund.execution_status === "reversed") {
      continue;
    }

    const blockedReason =
      !transferExecution.processor_transfer_id
        ? "No Stripe transfer exists to reverse for this payout."
        : payment.provider !== "stripe"
          ? "Only Stripe-backed payments can execute processor reversals."
          : null;
    const now = new Date().toISOString();
    const plannedReversal = await persistPayoutExecutionRow(supabase, existingForRefund?.id ?? null, {
      routing_record_id: routing.id,
      payment_id: routing.payment_id,
      appointment_id: routing.appointment_id,
      membership_id: routing.membership_id,
      target_subject_type: transferExecution.target_subject_type,
      execution_type: "reversal",
      target_connected_account_id: transferExecution.target_connected_account_id,
      target_provider_account_id: transferExecution.target_provider_account_id,
      amount: reversalNeeded,
      currency: routing.currency,
      execution_status: blockedReason ? "blocked" : "pending",
      blocked_reason: blockedReason,
      failure_reason: null,
      processor_transfer_id: transferExecution.processor_transfer_id,
      processor_reversal_id: existingForRefund?.processor_reversal_id ?? null,
      idempotency_key: existingForRefund?.idempotency_key ?? buildPayoutExecutionIdempotencyKey(routing.id, transferExecution.target_subject_type, "reversal", input?.refundId ?? transferExecution.id),
      source_execution_id: transferExecution.id,
      source_refund_id: input?.refundId ?? null,
      payout_reference: transferExecution.payout_reference,
      payout_speed: transferExecution.payout_speed,
      instant_payout_fee_amount: 0,
      net_transfer_amount: reversalNeeded,
      processor_payout_id: transferExecution.processor_payout_id,
      reconciliation_status: blockedReason ? "manual_review" : "open",
      metadata: {
        sourceTransferId: transferExecution.processor_transfer_id,
        refundId: input?.refundId ?? null,
        sourcePayoutReference: transferExecution.payout_reference
      },
      initiated_by: existingForRefund?.initiated_by ?? input?.initiatedBy ?? null,
      last_attempted_at: blockedReason ? existingForRefund?.last_attempted_at ?? null : now,
      attempt_count: blockedReason ? existingForRefund?.attempt_count ?? 0 : (existingForRefund?.attempt_count ?? 0) + 1,
      created_at: existingForRefund?.created_at ?? now,
      updated_at: now
    });

    if (blockedReason) {
      continue;
    }

    try {
      const reversal = await createStripeTransferReversal({
        transferId: transferExecution.processor_transfer_id!,
        amount: reversalNeeded,
        metadata: {
          routing_record_id: routing.id,
          payment_id: routing.payment_id,
          source_execution_id: transferExecution.id,
          reversal_execution_id: plannedReversal.id
        },
        idempotencyKey: plannedReversal.idempotency_key
      });

      await persistPayoutExecutionRow(supabase, plannedReversal.id, {
        execution_status: "reversed",
        blocked_reason: null,
        failure_reason: null,
        processor_reversal_id: reversal.id,
        payout_reference: transferExecution.payout_reference,
        payout_speed: transferExecution.payout_speed,
        net_transfer_amount: reversalNeeded,
        reconciliation_status: "reversed",
        reversed_at: now,
        last_attempted_at: now,
        updated_at: now
      });
    } catch (error) {
      await persistPayoutExecutionRow(supabase, plannedReversal.id, {
        execution_status: "failed",
        failure_reason: error instanceof Error ? error.message : "Transfer reversal failed.",
        blocked_reason: null,
        payout_reference: transferExecution.payout_reference,
        payout_speed: transferExecution.payout_speed,
        net_transfer_amount: reversalNeeded,
        reconciliation_status: "manual_review",
        failed_at: now,
        last_attempted_at: now,
        updated_at: now
      });
    }
  }

  return syncRoutingExecutionState(supabase, routing.id);
}

async function buildPayoutExecutionScope(
  supabase: SupabaseClient,
  payments: PaymentRow[],
  locations: LocationRow[]
) {
  const paymentIds = payments.map((payment) => payment.id);
  const routingRows = paymentIds.length
    ? await supabase
      .from("payment_routing_records")
      .select(PAYMENT_ROUTING_SELECT)
      .in("payment_id", paymentIds)
      .order("updated_at", { ascending: false })
    : { data: [], error: null };

  if (routingRows.error) {
    throw new FintechServiceError("Unable to load payout routing records for the requested scope.", 500);
  }

  const routingData = (routingRows.data ?? []) as PaymentRoutingRow[];
  const appointmentIds = [...new Set(routingData.map((row) => row.appointment_id).filter(Boolean) as string[])];
  const posSaleIds = [...new Set(routingData.map((row) => row.pos_sale_id).filter(Boolean) as string[])];
  const appointmentsResult = appointmentIds.length
    ? await supabase
      .from("appointments")
      .select("id, status, completed_at")
      .in("id", appointmentIds)
    : { data: [], error: null };
  const posSalesResult = posSaleIds.length
    ? await supabase
      .from("pos_sales")
      .select("id, status")
      .in("id", posSaleIds)
    : { data: [], error: null };

  if (appointmentsResult.error) {
    throw new FintechServiceError("Unable to load payout appointment state.", 500);
  }

  if (posSalesResult.error) {
    throw new FintechServiceError("Unable to load payout POS sale state.", 500);
  }

  const appointmentById = new Map(
    ((appointmentsResult.data ?? []) as Array<Pick<AppointmentRow, "id" | "status" | "completed_at">>)
      .map((appointment) => [appointment.id, appointment])
  );
  const posSaleById = new Map(
    ((posSalesResult.data ?? []) as Array<Pick<PosSaleRow, "id" | "status">>)
      .map((sale) => [sale.id, sale])
  );
  const payoutExecutions = await loadPayoutExecutionsForPaymentIds(supabase, paymentIds);
  const barbers = await loadBarbersByIds(
    [...new Set(payments.map((payment) => payment.barber_id).filter(Boolean) as string[])],
    supabase
  );
  const profiles = await loadProfiles(barbers.map((barber) => barber.profile_id), supabase);
  const accountStates = await loadConnectedAccountsForScope(supabase, {
    barberIds: barbers.map((barber) => barber.id),
    shopIds: [...new Set(locations.map((location) => location.id))]
  });
  const accountByBarberId = new Map(
    accountStates
      .filter((row) => row.barber_id)
      .map((row) => [row.barber_id as string, row])
  );
  const accountByShopId = new Map(
    accountStates
      .filter((row) => row.shop_id)
      .map((row) => [row.shop_id as string, row])
  );
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const routingById = new Map(routingData.map((row) => [row.id, row]));
  const barberById = new Map(barbers.map((barber) => [barber.id, barber]));
  const profileNameById = new Map(profiles.map((profile) => [profile.id, profile.full_name ?? profile.email]));

  const readyRouting = routingData
    .filter((row) => {
      const payment = paymentById.get(row.payment_id);
      if (!payment) {
        return false;
      }
      return evaluateRoutingExecutionReadiness(row, payment, accountByBarberId, accountByShopId).executable;
    })
    .slice(0, 12)
    .map((row) => {
      const payment = paymentById.get(row.payment_id);
      const barber = payment?.barber_id ? barberById.get(payment.barber_id) : undefined;
      const shop = payment?.shop_id ? locationById.get(payment.shop_id) : undefined;
      return mapRoutingView(
        row,
        payment,
        barber ? profileNameById.get(barber.profile_id) ?? barber.reference_code ?? barber.id : null,
        shop ? formatShopLabel(shop) : null
      );
    });

  const eligibleRouting = routingData
    .filter((row) => {
      const payment = paymentById.get(row.payment_id);
      const appointment = row.appointment_id ? appointmentById.get(row.appointment_id) : null;
      const posSale = row.pos_sale_id ? posSaleById.get(row.pos_sale_id) : null;
      return isRoutingEligibleForAvailablePayout(row, payment, appointment, posSale);
    })
    .slice(0, 12)
    .map((row) => {
      const payment = paymentById.get(row.payment_id);
      const barber = payment?.barber_id ? barberById.get(payment.barber_id) : undefined;
      const shop = payment?.shop_id ? locationById.get(payment.shop_id) : undefined;
      return mapRoutingView(
        row,
        payment,
        barber ? profileNameById.get(barber.profile_id) ?? barber.reference_code ?? barber.id : null,
        shop ? formatShopLabel(shop) : null
      );
    });

  const allExecutions = payoutExecutions
    .map((execution) => {
      const routing = routingById.get(execution.routing_record_id);
      const payment = paymentById.get(execution.payment_id);
      const barber = payment?.barber_id ? barberById.get(payment.barber_id) : undefined;
      const shop = payment?.shop_id ? locationById.get(payment.shop_id) : undefined;
      return mapPayoutExecutionView(
        execution,
        routing,
        payment,
        barber ? profileNameById.get(barber.profile_id) ?? barber.reference_code ?? barber.id : null,
        shop ? formatShopLabel(shop) : null
      );
    });
  const recentExecutions = allExecutions.slice(0, 16);

  return {
    routingRows: routingData,
    payoutExecutions,
    allExecutions,
    readyRouting,
    eligibleRouting,
    recentExecutions,
    paymentById,
    accountByBarberId,
    accountByShopId
  };
}

export async function listFintechPayouts(user: UserAccount): Promise<FintechPayoutsPayload> {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  assertManagementActor(actor);

  const locations = await loadLocationsInScope(actor, supabase);
  const paymentsResult = locations.length
    ? await supabase
      .from("payments")
      .select(PAYMENT_SELECT)
      .in("shop_id", locations.map((location) => location.id))
      .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (paymentsResult.error) {
    throw new FintechServiceError("Unable to load payout execution payments for the current scope.", 500);
  }

  const payments = (paymentsResult.data ?? []) as PaymentRow[];
  const scope = await buildPayoutExecutionScope(supabase, payments, locations);

  return {
    summary: summarizeExecutionViews(scope.allExecutions, scope.readyRouting, scope.eligibleRouting),
    readyRouting: scope.readyRouting,
    recentExecutions: scope.recentExecutions
  };
}

export async function getBarberPayouts(user: UserAccount): Promise<BarberPayoutsPayload> {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  assertBarberActor(actor);

  const paymentsResult = await supabase
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("barber_id", actor.barber!.id)
    .order("created_at", { ascending: false });

  if (paymentsResult.error) {
    throw new FintechServiceError("Unable to load barber payout execution payments.", 500);
  }

  const payments = (paymentsResult.data ?? []) as PaymentRow[];
  const shopIds = [...new Set(payments.map((payment) => payment.shop_id).filter(Boolean) as string[])];
  const locationsResult = shopIds.length
    ? await supabase
      .from("locations")
      .select("id, reference_code, name, neighborhood, city, state")
      .in("id", shopIds)
    : { data: [], error: null };

  if (locationsResult.error) {
    throw new FintechServiceError("Unable to load barber payout shop labels.", 500);
  }

  const scope = await buildPayoutExecutionScope(supabase, payments, (locationsResult.data ?? []) as LocationRow[]);
  const summary = summarizeExecutionViews(scope.allExecutions, scope.readyRouting, scope.eligibleRouting, { includeShopSplit: false });
  const moneyReporting = await loadBarberMoneyReporting({
    supabase,
    barberId: actor.barber!.id,
    payments,
    routingRows: scope.routingRows,
    eligiblePayoutAmount: summary.eligiblePayoutAmount,
    executedAmount: summary.executedAmount
  });

  return {
    summary: {
      executableRoutingRecords: summary.executableRoutingRecords,
      eligibleRoutingRecords: summary.eligibleRoutingRecords,
      readyForPayoutAmount: summary.readyForPayoutAmount,
      eligiblePayoutAmount: summary.eligiblePayoutAmount,
      blockedExecutionRecords: summary.blockedExecutionRecords,
      failedExecutionRecords: summary.failedExecutionRecords,
      executedTransferCount: summary.executedTransferCount,
      reversedExecutionCount: summary.reversedExecutionCount,
      executedAmount: summary.executedAmount,
      reversedAmount: summary.reversedAmount
    },
    moneyPosture: moneyReporting.moneyPosture,
    transactions: moneyReporting.transactions,
    salesTrend: moneyReporting.salesTrend,
    recentExecutions: scope.recentExecutions
  };
}

export async function executeFintechPayouts(
  user: UserAccount,
  input?: {
    mode?: "ready" | "retry_failed";
    speed?: "standard" | "instant";
  }
): Promise<ExecuteFintechPayoutsResult> {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  assertManagementActor(actor);

  const locations = await loadLocationsInScope(actor, supabase);
  const paymentsResult = locations.length
    ? await supabase
      .from("payments")
      .select(PAYMENT_SELECT)
      .in("shop_id", locations.map((location) => location.id))
      .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (paymentsResult.error) {
    throw new FintechServiceError("Unable to load payments for payout execution.", 500);
  }

  const payments = (paymentsResult.data ?? []) as PaymentRow[];
  const scope = await buildPayoutExecutionScope(supabase, payments, locations);
  const mode = input?.mode ?? "ready";
  const speed = input?.speed ?? "standard";
  let executed = 0;
  let blocked = 0;
  let failed = 0;
  let skipped = 0;

  for (const routing of scope.routingRows) {
    const payment = scope.paymentById.get(routing.payment_id);
    if (!payment) {
      continue;
    }
    await syncStripeSettlementForPayment(supabase, payment.id);
    const refreshedRoutingResult = await supabase
      .from("payment_routing_records")
      .select(PAYMENT_ROUTING_SELECT)
      .eq("id", routing.id)
      .maybeSingle();

    if (refreshedRoutingResult.error) {
      throw new FintechServiceError("Unable to refresh payout routing before execution.", 500);
    }

    const currentRouting = (refreshedRoutingResult.data as PaymentRoutingRow | null) ?? routing;

    const existingTransferExecutions = scope.payoutExecutions.filter((row) =>
      row.routing_record_id === currentRouting.id
      && row.execution_type === "transfer"
    );
    if (mode === "retry_failed" && !existingTransferExecutions.some((row) => row.execution_status === "failed")) {
      continue;
    }
    if (mode === "ready" && currentRouting.money_routing_status !== "ready_for_payout") {
      continue;
    }

    const targets = buildRoutingExecutionTargets(currentRouting, payment, scope.accountByBarberId, scope.accountByShopId);
    if (!targets.length) {
      skipped += 1;
      continue;
    }

    for (const target of targets) {
      const existingForTarget = existingTransferExecutions.find((row) => row.target_subject_type === target.targetSubjectType);
      if (mode === "retry_failed" && existingForTarget?.execution_status !== "failed") {
        continue;
      }
      if (mode === "ready" && existingForTarget?.execution_status === "executed" && existingForTarget.processor_transfer_id) {
        skipped += 1;
        continue;
      }

      const execution = await executeTransferForRoutingTarget(supabase, currentRouting, payment, target, actor.profile.id, speed);
      if (execution.execution_status === "executed") {
        executed += 1;
      } else if (execution.execution_status === "blocked") {
        blocked += 1;
      } else if (execution.execution_status === "failed") {
        failed += 1;
      } else {
        skipped += 1;
      }
    }

    await syncRoutingExecutionState(supabase, currentRouting.id);
  }

  const refreshed = await listFintechPayouts(user);
  return {
    summary: {
      executed,
      blocked,
      failed,
      skipped,
      reversed: refreshed.summary.reversedExecutionCount
    },
    recentExecutions: refreshed.recentExecutions
  };
}

export async function getBarberFintechReadiness(user: UserAccount): Promise<BarberFintechReadinessPayload> {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  assertBarberActor(actor);

  const barber = actor.barber!;
  const memberships = await loadMembershipsForBarber(barber.profile_id, supabase);
  const shopIds = [...new Set(memberships.map((membership) => membership.location_id))];
  const locationsResult = shopIds.length
    ? await supabase
      .from("locations")
      .select("id, reference_code, name, neighborhood, city, state")
      .in("id", shopIds)
    : { data: [], error: null };

  if (locationsResult.error) {
    throw new FintechServiceError("Unable to load the barber shop labels.", 500);
  }

  const locations = (locationsResult.data ?? []) as LocationRow[];
  await ensureConnectedAccounts(supabase, {
    barberIds: [barber.id],
    shopIds,
    createdBy: actor.profile.id
  });

  const [accounts, acceptances] = await Promise.all([
    loadConnectedAccountsForScope(supabase, { barberIds: [barber.id], shopIds }),
    loadLegalAcceptancesForScope(supabase, { barberIds: [barber.id], shopIds })
  ]);
  const syncedStates = await Promise.all(accounts.map((account) => syncConnectedAccountState(supabase, account, acceptances)));
  const connectedAccountState = syncedStates.find((state) => state.row.subject_type === "barber" && state.row.barber_id === barber.id);
  if (!connectedAccountState) {
    throw new FintechServiceError("No barber connected account is available.", 404);
  }

  const paymentsResult = await supabase
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("barber_id", barber.id)
    .order("created_at", { ascending: false });

  if (paymentsResult.error) {
    throw new FintechServiceError("Unable to load the barber routing activity.", 500);
  }

  const payments = (paymentsResult.data ?? []) as PaymentRow[];
  const paymentIds = payments.map((payment) => payment.id);
  const routingResult = paymentIds.length
    ? await supabase
      .from("payment_routing_records")
      .select(PAYMENT_ROUTING_SELECT)
      .in("payment_id", paymentIds)
      .order("updated_at", { ascending: false })
    : { data: [], error: null };

  if (routingResult.error) {
    throw new FintechServiceError("Unable to load the barber payout routing records.", 500);
  }

  const routingRows = (routingResult.data ?? []) as PaymentRoutingRow[];
  const appointmentIds = [...new Set(routingRows.map((row) => row.appointment_id).filter(Boolean) as string[])];
  const posSaleIds = [...new Set(routingRows.map((row) => row.pos_sale_id).filter(Boolean) as string[])];
  const appointmentsResult = appointmentIds.length
    ? await supabase
      .from("appointments")
      .select("id, status, completed_at")
      .in("id", appointmentIds)
    : { data: [], error: null };
  const posSalesResult = posSaleIds.length
    ? await supabase
      .from("pos_sales")
      .select("id, status")
      .in("id", posSaleIds)
    : { data: [], error: null };

  if (appointmentsResult.error) {
    throw new FintechServiceError("Unable to load the barber payout appointment state.", 500);
  }

  if (posSalesResult.error) {
    throw new FintechServiceError("Unable to load the barber payout POS sale state.", 500);
  }

  const appointmentById = new Map(
    ((appointmentsResult.data ?? []) as Array<Pick<AppointmentRow, "id" | "status" | "completed_at">>)
      .map((appointment) => [appointment.id, appointment])
  );
  const posSaleById = new Map(
    ((posSalesResult.data ?? []) as Array<Pick<PosSaleRow, "id" | "status">>)
      .map((sale) => [sale.id, sale])
  );
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const shopStateById = new Map(
    syncedStates
      .filter((state) => state.row.subject_type === "shop" && state.row.shop_id)
      .map((state) => [state.row.shop_id as string, state])
  );
  const membershipsView = memberships.map((membership) => {
    const location = locationById.get(membership.location_id);
    return {
      id: membership.id,
      barberId: barber.id,
      barberName: actor.profile.full_name ?? actor.profile.email,
      shopId: membership.location_id,
      shopLabel: location ? formatShopLabel(location) : membership.location_id,
      routingModel: normalizeRoutingModel(membership.routing_model, barber.compensation_model === "booth_rent" ? "booth_rent" : "commission"),
      commissionRate: membership.commission_rate === null ? null : numeric(membership.commission_rate),
      boothRentAmount: membership.booth_rent_amount === null ? null : numeric(membership.booth_rent_amount),
      boothRentFrequency: membership.booth_rent_frequency,
      payoutBlockReason: membership.payout_block_reason,
      updatedAt: membership.updated_at,
      shopAccount: shopStateById.get(membership.location_id) ? mapConnectedAccountView(shopStateById.get(membership.location_id)!) : null
    } satisfies BarberFintechMembershipView;
  });
  const latestBarberAcceptances = latestAcceptancesForSubject("barber", barber.id, acceptances).map(mapAgreementView);
  const blockedRoutingRows = routingRows
    .filter((row) => row.money_routing_status === "blocked" || row.money_routing_status === "manual_review")
    .slice(0, 8)
    .map((row) => {
      const payment = paymentById.get(row.payment_id);
      const shop = payment?.shop_id ? locationById.get(payment.shop_id) : undefined;
      return mapRoutingView(
        row,
        payment,
        actor.profile.full_name ?? actor.profile.email,
        shop ? formatShopLabel(shop) : null
      );
    });
  const eligibleRoutingRows = routingRows
    .filter((row) => {
      const payment = paymentById.get(row.payment_id);
      const appointment = row.appointment_id ? appointmentById.get(row.appointment_id) : null;
      const posSale = row.pos_sale_id ? posSaleById.get(row.pos_sale_id) : null;
      return isRoutingEligibleForAvailablePayout(row, payment, appointment, posSale);
    });
  const readyForPayoutAmount = eligibleRoutingRows
    .reduce((sum, row) => sum + numeric(row.barber_payout_amount), 0);

  return {
    barberId: barber.id,
    barberName: actor.profile.full_name ?? actor.profile.email,
    connectedAccount: mapConnectedAccountView(connectedAccountState),
    stripeEnvironment: getStripeConnectEnvironment(),
    agreements: latestBarberAcceptances,
    memberships: membershipsView,
    routingSummary: {
      blockedPaymentsCount: routingRows.filter((row) => row.money_routing_status === "blocked" || row.money_routing_status === "manual_review").length,
      pendingPaymentsCount: routingRows.filter((row) => row.money_routing_status === "pending").length,
      readyForPayoutAmount: roundCurrency(readyForPayoutAmount),
      blockedReasons: [...new Set(routingRows.map((row) => row.blocked_reason).filter(Boolean) as string[])].slice(0, 5)
    },
    blockedPayments: blockedRoutingRows
  };
}

export async function listFintechManagementPayload(user: UserAccount): Promise<FintechManagementPayload> {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  assertManagementActor(actor);

  const locations = await loadLocationsInScope(actor, supabase);
  const memberships = await loadMembershipsForLocations(locations.map((location) => location.id), supabase);
  const barbers = await loadBarbersByProfileIds([...new Set(memberships.map((membership) => membership.profile_id))], supabase);
  const profiles = await loadProfiles(barbers.map((barber) => barber.profile_id), supabase);
  const profileNameById = new Map(profiles.map((profile) => [profile.id, profile.full_name ?? profile.email]));
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const barberByProfileId = new Map(barbers.map((barber) => [barber.profile_id, barber]));

  await ensureConnectedAccounts(supabase, {
    barberIds: barbers.map((barber) => barber.id),
    shopIds: locations.map((location) => location.id),
    createdBy: actor.profile.id
  });

  const [accounts, acceptances, paymentsResult] = await Promise.all([
    loadConnectedAccountsForScope(supabase, {
      barberIds: barbers.map((barber) => barber.id),
      shopIds: locations.map((location) => location.id)
    }),
    loadLegalAcceptancesForScope(supabase, {
      barberIds: barbers.map((barber) => barber.id),
      shopIds: locations.map((location) => location.id)
    }),
    locations.length
      ? supabase
        .from("payments")
        .select(PAYMENT_SELECT)
        .in("shop_id", locations.map((location) => location.id))
        .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ]);

  if (paymentsResult.error) {
    throw new FintechServiceError("Unable to load the payment routing scope.", 500);
  }

  const syncedStates = await Promise.all(accounts.map((account) => syncConnectedAccountState(supabase, account, acceptances)));
  const accountByBarberId = new Map(
    syncedStates
      .filter((state) => state.row.subject_type === "barber" && state.row.barber_id)
      .map((state) => [state.row.barber_id as string, state])
  );
  const accountByShopId = new Map(
    syncedStates
      .filter((state) => state.row.subject_type === "shop" && state.row.shop_id)
      .map((state) => [state.row.shop_id as string, state])
  );

  const payments = (paymentsResult.data ?? []) as PaymentRow[];
  const paymentIds = payments.map((payment) => payment.id);
  const routingResult = paymentIds.length
    ? await supabase
      .from("payment_routing_records")
      .select(PAYMENT_ROUTING_SELECT)
      .in("payment_id", paymentIds)
      .order("updated_at", { ascending: false })
    : { data: [], error: null };

  if (routingResult.error) {
    throw new FintechServiceError("Unable to load payment routing readiness.", 500);
  }

  const routingRows = (routingResult.data ?? []) as PaymentRoutingRow[];
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const appointmentIds = [...new Set(routingRows.map((row) => row.appointment_id).filter(Boolean) as string[])];
  const posSaleIds = [...new Set(routingRows.map((row) => row.pos_sale_id).filter(Boolean) as string[])];
  const appointmentsResult = appointmentIds.length
    ? await supabase
      .from("appointments")
      .select("id, status, completed_at")
      .in("id", appointmentIds)
    : { data: [], error: null };
  const posSalesResult = posSaleIds.length
    ? await supabase
      .from("pos_sales")
      .select("id, status")
      .in("id", posSaleIds)
    : { data: [], error: null };

  if (appointmentsResult.error) {
    throw new FintechServiceError("Unable to load payment routing appointment state.", 500);
  }

  if (posSalesResult.error) {
    throw new FintechServiceError("Unable to load payment routing POS sale state.", 500);
  }

  const appointmentById = new Map(
    ((appointmentsResult.data ?? []) as Array<Pick<AppointmentRow, "id" | "status" | "completed_at">>)
      .map((appointment) => [appointment.id, appointment])
  );
  const posSaleById = new Map(
    ((posSalesResult.data ?? []) as Array<Pick<PosSaleRow, "id" | "status">>)
      .map((sale) => [sale.id, sale])
  );

  const membershipsView = memberships.flatMap((membership) => {
    const barber = barberByProfileId.get(membership.profile_id);
    const location = locationById.get(membership.location_id);
    if (!barber || !location) {
      return [];
    }

    return [{
      id: membership.id,
      barberId: barber.id,
      barberName: profileNameById.get(barber.profile_id) ?? barber.reference_code ?? barber.id,
      shopId: location.id,
      shopLabel: formatShopLabel(location),
      routingModel: normalizeRoutingModel(membership.routing_model, barber.compensation_model === "booth_rent" ? "booth_rent" : "commission"),
      commissionRate: membership.commission_rate === null ? null : numeric(membership.commission_rate),
      boothRentAmount: membership.booth_rent_amount === null ? null : numeric(membership.booth_rent_amount),
      boothRentFrequency: membership.booth_rent_frequency,
      payoutBlockReason: membership.payout_block_reason,
      updatedAt: membership.updated_at
    } satisfies MembershipCompensationView];
  });

  const shopViews = locations.map((location) => {
    const state = accountByShopId.get(location.id);
    if (!state) {
      return null;
    }

    return {
      ...mapConnectedAccountView(state),
      displayName: location.name,
      shopId: location.id,
      shopLabel: formatShopLabel(location),
      barberId: null,
      barberName: null
    } satisfies FintechManagementAccountView;
  }).filter(Boolean) as FintechManagementAccountView[];

  const barberViews = barbers.map((barber) => {
    const state = accountByBarberId.get(barber.id);
    if (!state) {
      return null;
    }

    const primaryMembership = memberships.find((membership) => membership.profile_id === barber.profile_id);
    const primaryLocation = primaryMembership ? locationById.get(primaryMembership.location_id) : null;

    return {
      ...mapConnectedAccountView(state),
      displayName: profileNameById.get(barber.profile_id) ?? barber.reference_code ?? barber.id,
      shopId: primaryMembership?.location_id ?? null,
      shopLabel: primaryLocation ? formatShopLabel(primaryLocation) : null,
      barberId: barber.id,
      barberName: profileNameById.get(barber.profile_id) ?? barber.reference_code ?? barber.id
    } satisfies FintechManagementAccountView;
  }).filter(Boolean) as FintechManagementAccountView[];

  const blockedPayments = routingRows
    .filter((row) => row.money_routing_status === "blocked" || row.money_routing_status === "manual_review")
    .slice(0, 12)
    .map((row) => {
      const payment = paymentById.get(row.payment_id);
      const barber = payment?.barber_id ? barbers.find((entry) => entry.id === payment.barber_id) : undefined;
      const shop = payment?.shop_id ? locationById.get(payment.shop_id) : undefined;
      return mapRoutingView(
        row,
        payment,
        barber ? profileNameById.get(barber.profile_id) ?? barber.reference_code ?? barber.id : null,
        shop ? formatShopLabel(shop) : null
      );
    });

  return {
    summary: {
      totalAccounts: syncedStates.length,
      readyAccounts: syncedStates.filter((state) => state.row.payout_readiness_status === "ready").length,
      blockedAccounts: syncedStates.filter((state) => state.row.payout_readiness_status === "blocked").length,
      needsAttentionAccounts: syncedStates.filter((state) => state.row.payout_readiness_status === "needs_attention").length,
      notReadyAccounts: syncedStates.filter((state) => state.row.payout_readiness_status === "not_ready").length,
      blockedRoutingRecords: routingRows.filter((row) => row.money_routing_status === "blocked" || row.money_routing_status === "manual_review").length,
      readyForPayoutAmount: roundCurrency(
        routingRows
          .filter((row) => {
            const payment = paymentById.get(row.payment_id);
            const appointment = row.appointment_id ? appointmentById.get(row.appointment_id) : null;
            const posSale = row.pos_sale_id ? posSaleById.get(row.pos_sale_id) : null;
            return isRoutingEligibleForAvailablePayout(row, payment, appointment, posSale);
          })
          .reduce((sum, row) => sum + numeric(row.barber_payout_amount) + numeric(row.shop_split_amount), 0)
      )
    },
    shops: shopViews,
    barbers: barberViews,
    memberships: membershipsView,
    blockedPayments
  };
}

function getStripeReturnPath(subject: StripeConnectSubjectResolution) {
  return getStripeConnectOnboardingPath(subject.subjectType, "return");
}

function getStripeRefreshPath(subject: StripeConnectSubjectResolution) {
  return getStripeConnectOnboardingPath(subject.subjectType, "refresh");
}

export async function ensureStripeConnectSubjectAccount(
  user: UserAccount,
  input?: {
    subjectType?: FintechSubjectType;
    shopId?: string | null;
  }
) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  const subject = await resolveStripeConnectSubject(actor, supabase, input);
  const state = await provisionStripeConnectedAccountForSubject(supabase, subject);
  const account = mapConnectedAccountView(state);
  await syncVerificationLaneFromConnectedAccount(state.row, account, user.id);

  return {
    account
  };
}

export async function createStripeConnectOnboardingSession(
  user: UserAccount,
  input?: {
    subjectType?: FintechSubjectType;
    shopId?: string | null;
  }
): Promise<StripeConnectSessionResult> {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  const subject = await resolveStripeConnectSubject(actor, supabase, input);
  const provisionedState = await provisionStripeConnectedAccountForSubject(supabase, subject);
  const providerAccountId = provisionedState.row.provider_account_id;

  if (!providerAccountId) {
    throw new FintechServiceError("Stripe onboarding could not be started for this account.", 500);
  }

  try {
    const link = await createStripeOnboardingLink({
      accountId: providerAccountId,
      refreshUrl: buildStripeReturnUrl(getStripeRefreshPath(subject)),
      returnUrl: buildStripeReturnUrl(getStripeReturnPath(subject))
    });
    const stripeAccount = await retrieveStripeConnectedAccount(providerAccountId);
    const syncedState = await syncConnectedAccountFromStripe(supabase, provisionedState.row, stripeAccount, {
      markOnboardingStarted: true
    });
    const account = mapConnectedAccountView(syncedState);
    await syncVerificationLaneFromConnectedAccount(syncedState.row, account, user.id);

    return {
      account,
      url: link.url
    };
  } catch (error) {
    throw toFintechServiceError(error, "Unable to create the Stripe onboarding link.");
  }
}

export async function createStripeConnectDashboardSession(
  user: UserAccount,
  input?: {
    subjectType?: FintechSubjectType;
    shopId?: string | null;
  }
): Promise<StripeConnectSessionResult> {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  const subject = await resolveStripeConnectSubject(actor, supabase, input);
  const provisionedState = await provisionStripeConnectedAccountForSubject(supabase, subject);
  const providerAccountId = provisionedState.row.provider_account_id;

  if (!providerAccountId) {
    throw new FintechServiceError("Stripe dashboard access is not available until onboarding starts.", 409);
  }

  try {
    const loginLink = await createStripeDashboardLoginLink(providerAccountId);
    const stripeAccount = await retrieveStripeConnectedAccount(providerAccountId);
    const syncedState = await syncConnectedAccountFromStripe(supabase, provisionedState.row, stripeAccount, {
      markDashboardAccessed: true
    });

    return {
      account: mapConnectedAccountView(syncedState),
      url: loginLink.url
    };
  } catch (error) {
    throw toFintechServiceError(error, "Unable to create the Stripe dashboard link.");
  }
}

export async function refreshStripeConnectSubjectAccount(
  user: UserAccount,
  input?: {
    subjectType?: FintechSubjectType;
    shopId?: string | null;
  }
) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  const subject = await resolveStripeConnectSubject(actor, supabase, input);
  const account = await ensureConnectedAccountForSubject(supabase, subject);

  if (!account.provider_account_id) {
    throw new FintechServiceError("Stripe onboarding has not started for this account yet.", 409);
  }

  try {
    const stripeAccount = await retrieveStripeConnectedAccount(account.provider_account_id);
    const state = await syncConnectedAccountFromStripe(supabase, account, stripeAccount);
    const accountView = mapConnectedAccountView(state);
    await syncVerificationLaneFromConnectedAccount(state.row, accountView, user.id);
    return {
      account: accountView
    };
  } catch (error) {
    throw toFintechServiceError(error, "Unable to refresh the Stripe readiness state.");
  }
}

async function processStripeMoneyMovementWebhook(
  supabase: SupabaseClient,
  event: Stripe.Event
) {
  const eventObject = event.data.object as unknown as Record<string, unknown>;

  if (event.type === "charge.dispute.created" || event.type === "charge.dispute.updated" || event.type === "charge.dispute.closed") {
    const dispute = event.data.object as Stripe.Dispute;
    const paymentIntentId =
      typeof eventObject.payment_intent === "string"
        ? eventObject.payment_intent
        : null;
    const chargeId = typeof dispute.charge === "string" ? dispute.charge : null;
    const payment = await resolveStripeWebhookPayment(supabase, {
      paymentIntentId,
      chargeId
    });

    let appointmentReference: string | null = null;
    let locationReference: string | null = null;
    if (payment?.appointment_id) {
      const appointmentResult = await supabase
        .from("appointments")
        .select("id, reference_code, location_id")
        .eq("id", payment.appointment_id)
        .maybeSingle();

      if (appointmentResult.error) {
        throw new FintechServiceError("Unable to load the disputed appointment context.", 500);
      }

      const appointment = appointmentResult.data as { id: string; reference_code: string | null; location_id: string | null } | null;
      appointmentReference = appointment?.reference_code ?? appointment?.id ?? null;
      locationReference = appointment?.location_id ?? payment.shop_id ?? null;
    }

    const now = new Date().toISOString();
    const stripeDisputeStatus = String(dispute.status ?? "").trim();
    const mappedStatus =
      stripeDisputeStatus === "warning_under_review" || stripeDisputeStatus === "under_review"
        ? "under_review"
        : stripeDisputeStatus === "warning_needs_response" || stripeDisputeStatus === "needs_response"
          ? "open"
          : stripeDisputeStatus === "lost"
            ? "escalated"
            : stripeDisputeStatus === "won" || stripeDisputeStatus === "charge_refunded" || stripeDisputeStatus === "prevented" || stripeDisputeStatus === "closed" || stripeDisputeStatus === "warning_closed"
              ? "resolved"
              : "open";
    const summary = appointmentReference
      ? `Stripe dispute ${dispute.reason?.replaceAll("_", " ") ?? "payment issue"} opened for booking ${appointmentReference}.`
      : `Stripe dispute ${dispute.reason?.replaceAll("_", " ") ?? "payment issue"} was received for a card payment.`;

    const disputeUpsert = await supabase
      .from("disputes")
      .upsert({
        id: `stripe-dispute:${dispute.id}`,
        dispute_type: "payment_dispute",
        dispute_status: mappedStatus,
        submitted_by_role: "owner",
        submitted_by_reference: "stripe:webhook",
        involved_party_type: "payment",
        involved_party_reference: payment?.id ?? dispute.id,
        appointment_reference: appointmentReference,
        location_reference: locationReference,
        summary,
        resolution_notes: mappedStatus === "resolved" ? `Stripe marked this dispute as ${stripeDisputeStatus}.` : null,
        updated_at: now
      }, { onConflict: "id" });

    if (disputeUpsert.error) {
      throw new FintechServiceError("Unable to persist the canonical dispute hold.", 500);
    }

    const disputeEventUpsert = await supabase
      .from("dispute_events")
      .upsert({
        id: event.id,
        dispute_reference: `stripe-dispute:${dispute.id}`,
        actor_role: "owner",
        actor_reference: "stripe:webhook",
        action_label: event.type,
        notes: `${summary} Stripe status: ${stripeDisputeStatus}.`,
        created_at: now
      }, { onConflict: "id" });

    if (disputeEventUpsert.error) {
      throw new FintechServiceError("Unable to persist the dispute event audit trail.", 500);
    }

    if (payment) {
      await syncPaymentRoutingRecord(supabase, payment.id);
    }

    if (event.type === "charge.dispute.created") {
      await recordDisputeLifecyclePlatformEvent(supabase, {
        eventType: "dispute_created",
        disputeId: `stripe-dispute:${dispute.id}`,
        payment,
        appointmentReference,
        locationReference,
        disputeType: dispute.reason ?? "payment_dispute",
        disputeStatus: mappedStatus,
        summary,
        occurredAt: now
      });
    } else if (mappedStatus === "resolved") {
      await recordDisputeLifecyclePlatformEvent(supabase, {
        eventType: "dispute_resolved",
        disputeId: `stripe-dispute:${dispute.id}`,
        payment,
        appointmentReference,
        locationReference,
        disputeType: dispute.reason ?? "payment_dispute",
        disputeStatus: mappedStatus,
        summary,
        occurredAt: now
      });
    }

    return { handled: true, connectedAccountId: null as string | null };
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntentId = typeof eventObject.id === "string" ? eventObject.id : null;
    if (!paymentIntentId) {
      return { handled: false, connectedAccountId: null as string | null };
    }

    const payment = await resolveStripeWebhookPayment(supabase, { paymentIntentId });
    if (!payment) {
      return { handled: false, connectedAccountId: null as string | null };
    }

    await syncStripeWebhookPaymentStatus(supabase, payment, "captured", { event });
    await syncStripeSettlementForPayment(supabase, payment.id, { throwOnError: true });
    return { handled: true, connectedAccountId: null as string | null };
  }

  if (event.type === "payment_intent.payment_failed" || event.type === "charge.failed") {
    const paymentIntentId =
      event.type === "payment_intent.payment_failed"
        ? (typeof eventObject.id === "string" ? eventObject.id : null)
        : (typeof eventObject.payment_intent === "string" ? eventObject.payment_intent : null);
    const chargeId = typeof eventObject.id === "string" ? eventObject.id : null;
    const payment = await resolveStripeWebhookPayment(supabase, {
      paymentIntentId,
      chargeId
    });

    if (!payment) {
      return { handled: false, connectedAccountId: null as string | null };
    }

    await syncStripeWebhookPaymentStatus(supabase, payment, "failed", {
      event,
      processorChargeId: chargeId
    });
    return { handled: true, connectedAccountId: null as string | null };
  }

  if (event.type === "charge.succeeded" || event.type === "charge.updated") {
    const paymentIntentId = typeof eventObject.payment_intent === "string" ? eventObject.payment_intent : null;
    const chargeId = typeof eventObject.id === "string" ? eventObject.id : null;
    if (!paymentIntentId && !chargeId) {
      return { handled: false, connectedAccountId: null as string | null };
    }

    const payment = await resolveStripeWebhookPayment(supabase, {
      paymentIntentId,
      chargeId
    });
    if (!payment) {
      return { handled: false, connectedAccountId: null as string | null };
    }

    if (event.type === "charge.succeeded") {
      await syncStripeWebhookPaymentStatus(supabase, payment, "captured", {
        event,
        processorChargeId: chargeId
      });
    }
    await syncStripeSettlementForPayment(supabase, payment.id, { throwOnError: true });
    return { handled: true, connectedAccountId: null as string | null };
  }

  if (event.type === "transfer.created" || event.type === "transfer.updated" || event.type === "transfer.reversed") {
    const transferId = typeof eventObject.id === "string" ? eventObject.id : null;
    if (!transferId) {
      return { handled: false, connectedAccountId: null as string | null };
    }

    const executionResult = await supabase
      .from("payout_executions")
      .select(PAYOUT_EXECUTION_SELECT)
      .eq("processor_transfer_id", transferId)
      .eq("execution_type", "transfer")
      .maybeSingle();

    if (executionResult.error) {
      throw new FintechServiceError("Unable to map the Stripe transfer into payout execution state.", 500);
    }

    if (!executionResult.data) {
      return { handled: false, connectedAccountId: null as string | null };
    }

    const execution = executionResult.data as PayoutExecutionRow;
    const transfer = event.data.object as Stripe.Transfer;
    const now = new Date().toISOString();

    await persistPayoutExecutionRow(supabase, execution.id, {
      execution_status: "executed",
      failure_reason: null,
      blocked_reason: null,
      executed_at: execution.executed_at ?? now,
      processor_transfer_id: transfer.id,
      reconciliation_status:
        transfer.amount_reversed > 0
          ? (transfer.amount_reversed >= transfer.amount ? "reversed" : "partially_reversed")
          : execution.reconciliation_status,
      updated_at: now
    });

    await syncRoutingExecutionState(supabase, execution.routing_record_id);
    return { handled: true, connectedAccountId: execution.target_connected_account_id };
  }

  if (event.type === "payout.paid" || event.type === "payout.failed") {
    const processorAccountId = event.account || (typeof eventObject.account === "string" ? eventObject.account : null);
    if (!processorAccountId) {
      return { handled: false, connectedAccountId: null as string | null };
    }

    const accountResult = await supabase
      .from("connected_accounts")
      .select(CONNECTED_ACCOUNT_SELECT)
      .eq("provider", "stripe_connect")
      .eq("provider_account_id", processorAccountId)
      .maybeSingle();

    if (accountResult.error) {
      throw new FintechServiceError("Unable to map the Stripe payout event into connected account state.", 500);
    }

    if (!accountResult.data) {
      return { handled: false, connectedAccountId: null as string | null };
    }

    return { handled: true, connectedAccountId: (accountResult.data as ConnectedAccountRow).id };
  }

  return { handled: false, connectedAccountId: null as string | null };
}

export async function processStripeConnectWebhook(
  payload: string,
  signature: string
): Promise<StripeWebhookSyncResult> {
  const supabase = getSupabaseOrThrow();
  let event: Stripe.Event;

  try {
    event = verifyStripeWebhookEvent(payload, signature);
  } catch (error) {
    throw toFintechServiceError(error, "Unable to verify the Stripe webhook signature.", 400);
  }

  const audit = await beginStripeWebhookAudit(supabase, event);
  if (audit.duplicate) {
    return {
      received: true,
      duplicate: true,
      status: audit.row.processing_status === "ignored" ? "ignored" : "processed"
    };
  }

  try {
    const billingResult = await processStripeBillingWebhookEvent(event);
    if (billingResult.handled) {
      await completeStripeWebhookAudit(supabase, audit.row.id, {
        processingStatus: "processed"
      });
      return { received: true, duplicate: false, status: "processed" };
    }

    const eventObject = event.data.object as unknown as Record<string, unknown>;
    const processorAccountId =
      event.account
      || (eventObject.object === "account" && typeof eventObject.id === "string" ? eventObject.id : null)
      || (typeof eventObject.account === "string" ? eventObject.account : null);
    const supportedAccountEvents = new Set(["account.updated", "capability.updated", "person.updated"]);
    if (supportedAccountEvents.has(event.type) && processorAccountId) {
      const accountResult = await supabase
        .from("connected_accounts")
        .select(CONNECTED_ACCOUNT_SELECT)
        .eq("provider", "stripe_connect")
        .eq("provider_account_id", processorAccountId)
        .maybeSingle();

      if (accountResult.error) {
        throw new FintechServiceError("Unable to load the Stripe connected account record.", 500);
      }

      if (!accountResult.data) {
        await completeStripeWebhookAudit(supabase, audit.row.id, {
          processingStatus: "ignored"
        });
        return { received: true, duplicate: false, status: "ignored" };
      }

      const stripeAccount = eventObject.object === "account" && eventObject.id === processorAccountId
        ? event.data.object as Stripe.Account
        : await retrieveStripeConnectedAccount(processorAccountId);
      const state = await syncConnectedAccountFromStripe(supabase, accountResult.data as ConnectedAccountRow, stripeAccount, {
        eventId: event.id,
        eventType: event.type
      });
      await syncVerificationLaneFromConnectedAccount(state.row, mapConnectedAccountView(state));

      await completeStripeWebhookAudit(supabase, audit.row.id, {
        processingStatus: "processed",
        connectedAccountId: state.row.id
      });

      return { received: true, duplicate: false, status: "processed" };
    }

    const moneyMovementResult = await processStripeMoneyMovementWebhook(supabase, event);
    if (!moneyMovementResult.handled) {
      await completeStripeWebhookAudit(supabase, audit.row.id, {
        processingStatus: "ignored"
      });
      return { received: true, duplicate: false, status: "ignored" };
    }

    await completeStripeWebhookAudit(supabase, audit.row.id, {
      processingStatus: "processed",
      connectedAccountId: moneyMovementResult.connectedAccountId
    });

    return { received: true, duplicate: false, status: "processed" };
  } catch (error) {
    const fintechError = toFintechServiceError(error, "Unable to process the Stripe webhook event.");
    await completeStripeWebhookAudit(supabase, audit.row.id, {
      processingStatus: "failed",
      errorMessage: fintechError.message
    });
    throw fintechError;
  }
}

export async function recordLegalAcceptance(
  user: UserAccount,
  input: LegalAcceptanceInput & {
    barberId?: string | null;
    shopId?: string | null;
  }
) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  const normalized = normalizeLegalAcceptance(input);

  let barberId: string | null = null;
  let shopId: string | null = null;
  if (isBarberAccountRole(actor.role)) {
    assertBarberActor(actor);
    barberId = actor.barber!.id;
    if (!(normalized.agreementType === "platform_terms" || normalized.agreementType === "barber_agreement" || normalized.agreementType === "payout_tax_acknowledgment")) {
      throw new FintechServiceError("Barbers can only accept barber payout and platform agreements.", 403);
    }
  } else if (isManagementRole(actor.role)) {
    assertManagementActor(actor);
    shopId = input.shopId?.trim() || null;
    if (!shopId) {
      throw new FintechServiceError("A shop is required for management legal acceptance.", 400);
    }
    if (!isLocationReadableByActor(actor, shopId)) {
      throw new FintechServiceError("This legal acceptance is outside the viewer's shop scope.", 403);
    }
    if (!(normalized.agreementType === "platform_terms" || normalized.agreementType === "shop_agreement" || normalized.agreementType === "payout_tax_acknowledgment")) {
      throw new FintechServiceError("Management can only record shop legal and payout acknowledgments.", 403);
    }
  } else {
    throw new FintechServiceError("This role cannot record payout legal acceptances.", 403);
  }

  const acceptedAt = new Date().toISOString();
  const insertResult = await supabase
    .from("legal_acceptances")
    .insert({
      agreement_type: normalized.agreementType,
      agreement_version: normalized.agreementVersion,
      actor_profile_id: actor.profile.id,
      actor_role: actor.profile.role,
      barber_id: barberId,
      shop_id: shopId,
      accepted_at: acceptedAt,
      metadata: { source: "phase13_fintech" },
      created_at: acceptedAt
    })
    .select("id, agreement_type, agreement_version, actor_profile_id, actor_role, barber_id, shop_id, accepted_at, metadata, created_at")
    .single();

  if (insertResult.error) {
    throw new FintechServiceError("Unable to record the legal acceptance.", 500);
  }

  await ensureConnectedAccounts(supabase, {
    barberIds: barberId ? [barberId] : [],
    shopIds: shopId ? [shopId] : [],
    createdBy: actor.profile.id
  });

  const [accounts, acceptances] = await Promise.all([
    loadConnectedAccountsForScope(supabase, { barberIds: barberId ? [barberId] : [], shopIds: shopId ? [shopId] : [] }),
    loadLegalAcceptancesForScope(supabase, { barberIds: barberId ? [barberId] : [], shopIds: shopId ? [shopId] : [] })
  ]);
  const syncedStates = await Promise.all(accounts.map((account) => syncConnectedAccountState(supabase, account, acceptances)));

  return {
    acceptance: mapAgreementView(insertResult.data as LegalAcceptanceRow),
    accounts: syncedStates.map(mapConnectedAccountView)
  };
}

export async function updateMembershipCompensation(
  user: UserAccount,
  membershipId: string,
  input: CompensationAssignmentInput
) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  assertManagementActor(actor);

  const membershipResult = await supabase
    .from("staff_locations")
    .select("id, profile_id, location_id, routing_model, commission_rate, booth_rent_amount, booth_rent_frequency, payout_block_reason, updated_at, fintech_updated_at")
    .eq("id", membershipId)
    .maybeSingle();

  if (membershipResult.error) {
    throw new FintechServiceError("Unable to load the requested compensation assignment.", 500);
  }

  if (!membershipResult.data) {
    throw new FintechServiceError("Compensation assignment not found.", 404);
  }

  const membership = membershipResult.data as StaffMembershipRow;
  if (!isLocationReadableByActor(actor, membership.location_id)) {
    throw new FintechServiceError("This compensation assignment is outside the viewer's shop scope.", 403);
  }

  const normalized = normalizeCompensationAssignment(input);
  const updatedAt = new Date().toISOString();
  const updateResult = await supabase
    .from("staff_locations")
    .update({
      routing_model: normalized.routingModel,
      commission_rate: normalized.commissionRate,
      booth_rent_amount: normalized.boothRentAmount,
      booth_rent_frequency: normalized.boothRentFrequency,
      payout_block_reason: normalized.payoutBlockReason,
      updated_at: updatedAt,
      fintech_updated_at: updatedAt
    })
    .eq("id", membership.id);

  if (updateResult.error) {
    throw new FintechServiceError("Unable to update the compensation assignment.", 500);
  }

  const [barberResult, locationResult, profileResult] = await Promise.all([
    supabase
      .from("barbers")
      .select("id, reference_code, profile_id, compensation_model, commission_rate, booth_rent_amount, booth_rent_frequency")
      .eq("profile_id", membership.profile_id)
      .maybeSingle(),
    supabase
      .from("locations")
      .select("id, reference_code, name, neighborhood, city, state")
      .eq("id", membership.location_id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, email, full_name, role")
      .eq("id", membership.profile_id)
      .maybeSingle()
  ]);

  if (barberResult.error || locationResult.error || profileResult.error) {
    throw new FintechServiceError("Unable to rebuild the compensation response.", 500);
  }

  if (!barberResult.data || !locationResult.data || !profileResult.data) {
    throw new FintechServiceError("The compensation assignment references missing records.", 500);
  }

  return {
    membership: {
      id: membership.id,
      barberId: (barberResult.data as BarberRow).id,
      barberName: (profileResult.data as ProfileRow).full_name ?? (profileResult.data as ProfileRow).email,
      shopId: (locationResult.data as LocationRow).id,
      shopLabel: formatShopLabel(locationResult.data as LocationRow),
      routingModel: normalized.routingModel,
      commissionRate: normalized.commissionRate,
      boothRentAmount: normalized.boothRentAmount,
      boothRentFrequency: normalized.boothRentFrequency,
      payoutBlockReason: normalized.payoutBlockReason,
      updatedAt
    } satisfies MembershipCompensationView
  };
}

export async function updateConnectedAccountStatus(
  user: UserAccount,
  accountId: string,
  input: ConnectedAccountStatusInput
) {
  const supabase = getSupabaseOrThrow();
  const actor = await resolveActor(user, supabase);
  assertManagementActor(actor);

  const accountResult = await supabase
    .from("connected_accounts")
    .select(CONNECTED_ACCOUNT_SELECT)
    .eq("id", accountId)
    .maybeSingle();

  if (accountResult.error) {
    throw new FintechServiceError("Unable to load the connected account.", 500);
  }

  if (!accountResult.data) {
    throw new FintechServiceError("Connected account not found.", 404);
  }

  const account = accountResult.data as ConnectedAccountRow;
  const scopedLocationId = account.shop_id;
  if (!scopedLocationId && account.barber_id && actor.role !== "owner") {
    const barberLookup = await supabase
      .from("barbers")
      .select("profile_id")
      .eq("id", account.barber_id)
      .maybeSingle();

    if (barberLookup.error || !barberLookup.data) {
      throw new FintechServiceError("Unable to scope the connected account.", 500);
    }

    const membershipLookup = await supabase
      .from("staff_locations")
      .select("location_id")
      .eq("profile_id", (barberLookup.data as { profile_id: string }).profile_id)
      .order("location_id");

    if (membershipLookup.error) {
      throw new FintechServiceError("Unable to scope the connected account.", 500);
    }

    const membershipLocationIds = ((membershipLookup.data ?? []) as Array<{ location_id: string }>).map((row) => row.location_id);
    if (!membershipLocationIds.some((locationId) => isLocationReadableByActor(actor, locationId))) {
      throw new FintechServiceError("This connected account is outside the viewer's shop scope.", 403);
    }
  }

  if (scopedLocationId && !isLocationReadableByActor(actor, scopedLocationId)) {
    throw new FintechServiceError("This connected account is outside the viewer's shop scope.", 403);
  }

  const normalized = normalizeConnectedAccountStatus(input);
  const updatedAt = new Date().toISOString();
  const updateResult = await supabase
    .from("connected_accounts")
    .update({
      provider: normalized.provider,
      provider_account_id: normalized.providerAccountId,
      onboarding_status: normalized.onboardingStatus,
      tax_readiness_status: normalized.taxReadinessStatus,
      charges_enabled: normalized.chargesEnabled,
      payouts_enabled: normalized.payoutsEnabled,
      requirements_currently_due: normalized.requirementsCurrentlyDue,
      requirements_eventually_due: normalized.requirementsEventuallyDue,
      requirements_past_due: normalized.requirementsPastDue,
      disabled_reason: normalized.disabledReason,
      last_checked_at: updatedAt,
      updated_at: updatedAt
    })
    .eq("id", account.id);

  if (updateResult.error) {
    throw new FintechServiceError("Unable to update the connected account readiness.", 500);
  }

  const [accounts, acceptances] = await Promise.all([
    loadConnectedAccountsForScope(supabase, {
      barberIds: account.barber_id ? [account.barber_id] : [],
      shopIds: account.shop_id ? [account.shop_id] : []
    }),
    loadLegalAcceptancesForScope(supabase, {
      barberIds: account.barber_id ? [account.barber_id] : [],
      shopIds: account.shop_id ? [account.shop_id] : []
    })
  ]);
  const syncedStates = await Promise.all(accounts.map((row) => syncConnectedAccountState(supabase, row, acceptances)));
  const currentState = syncedStates.find((state) => state.row.id === account.id);

  if (!currentState) {
    throw new FintechServiceError("Unable to rebuild the connected account state.", 500);
  }

  return {
    account: mapConnectedAccountView(currentState)
  };
}
