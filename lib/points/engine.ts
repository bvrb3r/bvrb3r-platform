import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  buildPlatformEventIdempotencyKey,
  recordRequiredPlatformEvents,
  type PlatformEventInput
} from "@/lib/core/platform-events";
import {
  createInitialPointsState
} from "@/lib/data/points";
import { previewCashoutRequest, DEFAULT_CASHOUT_MIN_POINTS } from "@/lib/points/cashout";
import {
  buildPointsActivityView,
  buildPointsBalanceExplanation
} from "@/lib/points/explanations";
import {
  DEFAULT_MAX_REDEMPTION_RATE,
  POINT_CASH_VALUE,
  applyPointsPreviewToQuote,
  pointsToCashValue,
  pointsToInAppValue,
  previewPointsRedemption
} from "@/lib/points/redemption";
import { getPointsState, setPointsState } from "@/lib/points/state";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isBarberAccountRole, isClientRole, isShopOwnerRole } from "@/lib/auth/roles";
import type { AppointmentFinancialQuote } from "@/lib/appointments/domain";
import type { UserAccount } from "@/types/domain";
import type {
  CashoutRequestRecord,
  OwnerPointsAnalyticsSummary,
  PointsBalanceView,
  PointsCampaignView,
  PointsCashoutRequestView,
  PointsEventType,
  PointsHistoryView,
  PointsPointClass,
  PointsProgramRuleRecord,
  PointsRedemptionCommitView,
  PointsRole,
  PointsSourceType,
  PointsState,
  PointsTransactionRecord,
  PointsTransactionStatus,
  RewardCampaignRecord,
  RewardEligibilitySnapshotRecord,
  RewardEligibilityStatus,
  UserPointsBalanceRecord
} from "@/types/points";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type StorageContext =
  | { kind: "demo"; state: PointsState }
  | { kind: "supabase"; state: PointsState; supabase: SupabaseClient };

type SupabaseUserPointsBalanceRow = {
  user_id: string;
  role: PointsRole;
  total_points: number | string | null;
  pending_points: number | string | null;
  unlocked_points: number | string | null;
  lifetime_earned: number | string | null;
  lifetime_redeemed: number | string | null;
  updated_at: string;
};

type SupabasePointsTransactionRow = {
  id: string;
  user_id: string;
  role: PointsRole;
  point_class: PointsPointClass;
  event_type: PointsEventType;
  source_type: PointsSourceType;
  source_id: string;
  referral_id: string | null;
  points_delta: number | string | null;
  in_app_value: number | string | null;
  cash_value: number | string | null;
  status: PointsTransactionStatus;
  created_at: string;
  unlocked_at: string | null;
  expires_at: string | null;
  reversed_at: string | null;
  metadata: Record<string, unknown> | null;
};

type SupabasePointsProgramRuleRow = {
  id: string;
  role: PointsRole;
  event_type: PointsEventType;
  max_points_per_event: number | string | null;
  max_points_per_user_window: number | string | null;
  window_days: number | string | null;
  expiration_days: number | null;
  cashout_allowed: boolean;
  delay_unlock_hours: number | string | null;
  created_at: string;
};

type SupabaseRewardCampaignRow = {
  id: string;
  name: string;
  role_target: RewardCampaignRecord["roleTarget"];
  event_target: RewardCampaignRecord["eventTarget"];
  multiplier: number | string | null;
  point_class: PointsPointClass;
  budget_cap: number | string | null;
  start_at: string;
  end_at: string;
  is_active: boolean;
};

type SupabaseEligibilitySnapshotRow = {
  id: string;
  user_id: string;
  role: PointsRole;
  event_type: PointsEventType;
  eligibility_status: RewardEligibilityStatus;
  validation_flags: Record<string, unknown> | null;
  created_at: string;
};

type SupabaseCashoutRequestRow = {
  id: string;
  user_id: string;
  role: PointsRole;
  points_requested: number | string | null;
  cash_value: number | string | null;
  status: CashoutRequestRecord["status"];
  created_at: string;
  processed_at: string | null;
  metadata: Record<string, unknown> | null;
};

type RewardGuardrailInput = {
  userId: string;
  role: PointsRole;
  eventType: PointsEventType;
  sourceType: PointsSourceType;
  sourceId: string;
  referralId?: string | null;
  basePoints?: number;
  orderTotal?: number;
  platformFeeAmount?: number;
  paymentSettled?: boolean;
  serviceCompleted?: boolean;
  refundState?: "clean" | "refunded" | "chargeback";
  phoneValidated?: boolean;
  anomalyScore?: number;
  fraudFlags?: string[];
  locationId?: string;
  metadata?: Record<string, unknown>;
};

type RewardAwardResult = {
  state: PointsState;
  snapshot: RewardEligibilitySnapshotRecord;
  transaction: PointsTransactionRecord | null;
  approvedPoints: number;
  campaign: RewardCampaignRecord | null;
};

type AppointmentPointsInput = {
  appointmentId: string;
  clientId: string;
  barberId: string;
  locationId: string;
  completedAt?: string;
  orderTotal: number;
  tipAmount?: number;
  completedBookingCount?: number;
  platformFeeAmount?: number;
  paymentSettled: boolean;
  serviceCompleted: boolean;
  refundState?: "clean" | "refunded" | "chargeback";
  clientPhoneValidated?: boolean;
  referralReward?: {
    referralId: string;
    referrerClientId: string;
  } | null;
};

type RedemptionCommitInput = {
  userId: string;
  role: PointsRole;
  purpose: "booking_discount" | "subscription_credit" | "campaign_credit";
  requestedPoints: number;
  orderTotal: number;
  sourceId: string;
  locationId?: string;
  metadata?: Record<string, unknown>;
};

type CashoutRequestInput = {
  userId: string;
  role: PointsRole;
  requestedPoints: number;
  minimumThresholdPoints?: number;
  cashoutRate?: number;
  metadata?: Record<string, unknown>;
};

type PointsScope = {
  userId: string;
  role: PointsRole;
};

const DEFAULT_OWNER_LTV_UPLIFT = 6;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPoints(value: number) {
  return Math.max(0, Math.floor(value));
}

function toTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function addHours(iso: string, hours: number) {
  const date = new Date(iso);
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function addDays(iso: string, days: number) {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function sortByNewest<T extends { createdAt?: string; updatedAt?: string }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftValue = toTimestamp(left.createdAt ?? left.updatedAt ?? null) ?? 0;
    const rightValue = toTimestamp(right.createdAt ?? right.updatedAt ?? null) ?? 0;
    return rightValue - leftValue;
  });
}

function mapStateRow<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isMissingTableError(error: { code?: string | null; message?: string | null }) {
  return error.code === "42P01" || `${error.message ?? ""}`.toLowerCase().includes("does not exist");
}

function toPointsRole(role: UserAccount["role"]): PointsRole | null {
  if (isClientRole(role)) {
    return "client";
  }

  if (isBarberAccountRole(role)) {
    return "barber";
  }

  if (isShopOwnerRole(role)) {
    return "owner";
  }

  return null;
}

export function getPointsScopeForUser(user: UserAccount): PointsScope | null {
  const role = toPointsRole(user.role);
  if (!role) {
    return null;
  }

  return {
    userId: user.id,
    role
  };
}

function createEmptyLivePointsState(): PointsState {
  return {
    balances: [],
    transactions: [],
    programRules: [],
    campaigns: [],
    eligibilitySnapshots: [],
    cashoutRequests: []
  };
}

function toBalanceInsert(record: UserPointsBalanceRecord) {
  return {
    user_id: record.userId,
    role: record.role,
    total_points: record.totalPoints,
    pending_points: record.pendingPoints,
    unlocked_points: record.unlockedPoints,
    lifetime_earned: record.lifetimeEarned,
    lifetime_redeemed: record.lifetimeRedeemed,
    updated_at: record.updatedAt
  };
}

function toTransactionInsert(record: PointsTransactionRecord) {
  return {
    id: record.id,
    user_id: record.userId,
    role: record.role,
    point_class: record.pointClass,
    event_type: record.eventType,
    source_type: record.sourceType,
    source_id: record.sourceId,
    referral_id: record.referralId ?? null,
    points_delta: record.pointsDelta,
    in_app_value: record.inAppValue,
    cash_value: record.cashValue,
    status: record.status,
    created_at: record.createdAt,
    unlocked_at: record.unlockedAt ?? null,
    expires_at: record.expiresAt ?? null,
    reversed_at: record.reversedAt ?? null,
    metadata: record.metadata
  };
}

function toProgramRuleInsert(record: PointsProgramRuleRecord) {
  return {
    id: record.id,
    role: record.role,
    event_type: record.eventType,
    max_points_per_event: record.maxPointsPerEvent,
    max_points_per_user_window: record.maxPointsPerUserWindow,
    window_days: record.windowDays,
    expiration_days: record.expirationDays ?? null,
    cashout_allowed: record.cashoutAllowed,
    delay_unlock_hours: record.delayUnlockHours,
    created_at: record.createdAt
  };
}

function toCampaignInsert(record: RewardCampaignRecord) {
  return {
    id: record.id,
    name: record.name,
    role_target: record.roleTarget,
    event_target: record.eventTarget,
    multiplier: record.multiplier,
    point_class: record.pointClass,
    budget_cap: record.budgetCap,
    start_at: record.startAt,
    end_at: record.endAt,
    is_active: record.isActive
  };
}

function toEligibilityInsert(record: RewardEligibilitySnapshotRecord) {
  return {
    id: record.id,
    user_id: record.userId,
    role: record.role,
    event_type: record.eventType,
    eligibility_status: record.eligibilityStatus,
    validation_flags: record.validationFlags,
    created_at: record.createdAt
  };
}

function toCashoutRequestInsert(record: CashoutRequestRecord) {
  return {
    id: record.id,
    user_id: record.userId,
    role: record.role,
    points_requested: record.pointsRequested,
    cash_value: record.cashValue,
    status: record.status,
    created_at: record.createdAt,
    processed_at: record.processedAt ?? null,
    metadata: record.metadata
  };
}

async function readSupabaseState(supabase: SupabaseClient): Promise<PointsState> {
  try {
    const [
      balancesResult,
      transactionsResult,
      rulesResult,
      campaignsResult,
      eligibilityResult,
      cashoutRequestsResult
    ] = await Promise.all([
      supabase.from("user_points_balances").select("user_id, role, total_points, pending_points, unlocked_points, lifetime_earned, lifetime_redeemed, updated_at"),
      supabase.from("points_transactions").select("id, user_id, role, point_class, event_type, source_type, source_id, referral_id, points_delta, in_app_value, cash_value, status, created_at, unlocked_at, expires_at, reversed_at, metadata").order("created_at", { ascending: false }),
      supabase.from("points_program_rules").select("id, role, event_type, max_points_per_event, max_points_per_user_window, window_days, expiration_days, cashout_allowed, delay_unlock_hours, created_at"),
      supabase.from("reward_campaigns").select("id, name, role_target, event_target, multiplier, point_class, budget_cap, start_at, end_at, is_active, created_at").order("start_at", { ascending: false }),
      supabase.from("reward_eligibility_snapshots").select("id, user_id, role, event_type, eligibility_status, validation_flags, created_at").order("created_at", { ascending: false }),
      supabase.from("cashout_requests").select("id, user_id, role, points_requested, cash_value, status, created_at, processed_at, metadata").order("created_at", { ascending: false })
    ]);

    for (const result of [
      balancesResult,
      transactionsResult,
      rulesResult,
      campaignsResult,
      eligibilityResult,
      cashoutRequestsResult
    ]) {
      if (result.error) {
        if (isMissingTableError(result.error)) {
          return createEmptyLivePointsState();
        }
        throw result.error;
      }
    }

    return {
      balances: ((balancesResult.data ?? []) as SupabaseUserPointsBalanceRow[]).map((row) => ({
        userId: row.user_id,
        role: row.role,
        totalPoints: Number(row.total_points ?? 0),
        pendingPoints: Number(row.pending_points ?? 0),
        unlockedPoints: Number(row.unlocked_points ?? 0),
        lifetimeEarned: Number(row.lifetime_earned ?? 0),
        lifetimeRedeemed: Number(row.lifetime_redeemed ?? 0),
        updatedAt: row.updated_at
      })),
      transactions: ((transactionsResult.data ?? []) as SupabasePointsTransactionRow[]).map((row) => ({
        id: row.id,
        userId: row.user_id,
        role: row.role,
        pointClass: row.point_class,
        eventType: row.event_type,
        sourceType: row.source_type,
        sourceId: row.source_id,
        referralId: row.referral_id ?? null,
        pointsDelta: Number(row.points_delta ?? 0),
        inAppValue: Number(row.in_app_value ?? 0),
        cashValue: Number(row.cash_value ?? 0),
        status: row.status,
        createdAt: row.created_at,
        unlockedAt: row.unlocked_at ?? null,
        expiresAt: row.expires_at ?? null,
        reversedAt: row.reversed_at ?? null,
        metadata: mapStateRow(row.metadata ?? {})
      })),
      programRules: ((rulesResult.data ?? []) as SupabasePointsProgramRuleRow[]).map((row) => ({
        id: row.id,
        role: row.role,
        eventType: row.event_type,
        maxPointsPerEvent: Number(row.max_points_per_event ?? 0),
        maxPointsPerUserWindow: Number(row.max_points_per_user_window ?? 0),
        windowDays: Number(row.window_days ?? 30),
        expirationDays: row.expiration_days ?? null,
        cashoutAllowed: row.cashout_allowed,
        delayUnlockHours: Number(row.delay_unlock_hours ?? 0),
        createdAt: row.created_at
      })),
      campaigns: ((campaignsResult.data ?? []) as SupabaseRewardCampaignRow[]).map((row) => ({
        id: row.id,
        name: row.name,
        roleTarget: row.role_target,
        eventTarget: row.event_target,
        multiplier: Number(row.multiplier ?? 1),
        pointClass: row.point_class,
        budgetCap: Number(row.budget_cap ?? 0),
        startAt: row.start_at,
        endAt: row.end_at,
        isActive: Boolean(row.is_active)
      })),
      eligibilitySnapshots: ((eligibilityResult.data ?? []) as SupabaseEligibilitySnapshotRow[]).map((row) => ({
        id: row.id,
        userId: row.user_id,
        role: row.role,
        eventType: row.event_type,
        eligibilityStatus: row.eligibility_status,
        validationFlags: mapStateRow(row.validation_flags ?? {}),
        createdAt: row.created_at
      })),
      cashoutRequests: ((cashoutRequestsResult.data ?? []) as SupabaseCashoutRequestRow[]).map((row) => ({
        id: row.id,
        userId: row.user_id,
        role: row.role,
        pointsRequested: Number(row.points_requested ?? 0),
        cashValue: Number(row.cash_value ?? 0),
        status: row.status,
        createdAt: row.created_at,
        processedAt: row.processed_at ?? null,
        metadata: mapStateRow(row.metadata ?? {})
      }))
    };
  } catch (error) {
    if (typeof error === "object" && error && isMissingTableError(error as { code?: string | null; message?: string | null })) {
      return createEmptyLivePointsState();
    }

    throw error;
  }
}

export function syncPointsStateLifecycle(state: PointsState, referenceAt = new Date().toISOString()) {
  const referenceTimestamp = toTimestamp(referenceAt) ?? Date.now();
  const transactions = state.transactions.map((transaction) => {
    const unlockedTimestamp = toTimestamp(transaction.unlockedAt);
    const expiresTimestamp = toTimestamp(transaction.expiresAt);

    if (transaction.status === "pending" && unlockedTimestamp !== null && unlockedTimestamp <= referenceTimestamp) {
      return {
        ...transaction,
        status: "unlocked" as PointsTransactionStatus
      };
    }

    if (transaction.status === "unlocked" && expiresTimestamp !== null && expiresTimestamp <= referenceTimestamp) {
      return {
        ...transaction,
        status: "expired" as PointsTransactionStatus
      };
    }

    return transaction;
  });

  return synchronizeBalances({
    ...state,
    transactions: sortByNewest(transactions)
  });
}

async function readStorageContext(): Promise<StorageContext> {
  if (!isSupabaseEnabled()) {
    return { kind: "demo", state: syncPointsStateLifecycle(clone(getPointsState())) };
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return { kind: "demo", state: syncPointsStateLifecycle(clone(getPointsState())) };
  }

  return {
    kind: "supabase",
    supabase,
    state: syncPointsStateLifecycle(await readSupabaseState(supabase))
  };
}

async function persistStorageContext(context: StorageContext) {
  if (context.kind === "demo") {
    setPointsState(syncPointsStateLifecycle(context.state));
    return;
  }

  const state = syncPointsStateLifecycle(context.state);
  const [balancesResult, transactionsResult, rulesResult, campaignsResult, eligibilityResult, cashoutRequestsResult] = await Promise.all([
    context.supabase.from("user_points_balances").upsert(state.balances.map(toBalanceInsert), { onConflict: "user_id" }),
    context.supabase.from("points_transactions").upsert(state.transactions.map(toTransactionInsert), { onConflict: "id" }),
    context.supabase.from("points_program_rules").upsert(state.programRules.map(toProgramRuleInsert), { onConflict: "id" }),
    context.supabase.from("reward_campaigns").upsert(state.campaigns.map(toCampaignInsert), { onConflict: "id" }),
    context.supabase.from("reward_eligibility_snapshots").upsert(state.eligibilitySnapshots.map(toEligibilityInsert), { onConflict: "id" }),
    context.supabase.from("cashout_requests").upsert(state.cashoutRequests.map(toCashoutRequestInsert), { onConflict: "id" })
  ]);

  for (const result of [balancesResult, transactionsResult, rulesResult, campaignsResult, eligibilityResult, cashoutRequestsResult]) {
    if (result.error) {
      throw result.error;
    }
  }
}

function getActiveCampaigns(
  state: PointsState,
  role: PointsRole,
  eventType: PointsEventType,
  referenceAt = new Date().toISOString()
) {
  return state.campaigns.filter((campaign) =>
    campaign.isActive
    && (campaign.roleTarget === "all" || campaign.roleTarget === role)
    && (campaign.eventTarget === "all" || campaign.eventTarget === eventType)
    && campaign.startAt <= referenceAt
    && campaign.endAt >= referenceAt
  );
}

function getPreferredCampaign(
  state: PointsState,
  role: PointsRole,
  eventType: PointsEventType,
  referenceAt = new Date().toISOString()
) {
  return [...getActiveCampaigns(state, role, eventType, referenceAt)].sort((left, right) => {
    if (right.multiplier !== left.multiplier) {
      return right.multiplier - left.multiplier;
    }

    return left.startAt.localeCompare(right.startAt);
  })[0] ?? null;
}

function getCampaignBudgetRemaining(state: PointsState, campaignId?: string | null) {
  if (!campaignId) {
    return Number.POSITIVE_INFINITY;
  }

  const campaign = state.campaigns.find((entry) => entry.id === campaignId);
  if (!campaign) {
    return Number.POSITIVE_INFINITY;
  }

  const spentPoints = state.transactions
    .filter((transaction) =>
      transaction.pointsDelta > 0
      && transaction.status !== "expired"
      && transaction.status !== "reversed"
      && transaction.metadata.campaignId === campaignId
    )
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0);

  return Math.max(0, campaign.budgetCap - spentPoints);
}

function getProgramRule(state: PointsState, role: PointsRole, eventType: PointsEventType) {
  return state.programRules.find((rule) => rule.role === role && rule.eventType === eventType) ?? null;
}

function getWindowIssuedPoints(
  state: PointsState,
  userId: string,
  eventType: PointsEventType,
  windowDays: number,
  referenceAt = new Date().toISOString()
) {
  const windowStart = addDays(referenceAt, -windowDays);
  return state.transactions
    .filter((transaction) =>
      transaction.userId === userId
      && transaction.eventType === eventType
      && transaction.pointsDelta > 0
      && transaction.status !== "expired"
      && transaction.status !== "reversed"
      && transaction.createdAt >= windowStart
    )
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0);
}

function hasDuplicateReward(
  state: PointsState,
  input: Pick<RewardGuardrailInput, "userId" | "role" | "sourceId" | "sourceType" | "referralId" | "eventType">
) {
  return state.transactions.some((transaction) => {
    if (transaction.userId !== input.userId || transaction.role !== input.role || transaction.eventType !== input.eventType) {
      return false;
    }

    if (transaction.status === "expired" || transaction.status === "reversed" || transaction.pointsDelta <= 0) {
      return false;
    }

    if (input.referralId && transaction.referralId === input.referralId) {
      return true;
    }

    return transaction.sourceType === input.sourceType && transaction.sourceId === input.sourceId;
  });
}

function getReservedCashoutPoints(state: PointsState, userId: string) {
  return state.cashoutRequests
    .filter((request) => request.userId === userId && ["requested", "under_review", "approved"].includes(request.status))
    .reduce((sum, request) => sum + request.pointsRequested, 0);
}

function computeBalanceRecord(state: PointsState, userId: string, role: PointsRole): UserPointsBalanceRecord {
  const transactions = state.transactions.filter((transaction) => transaction.userId === userId && transaction.role === role);
  const totalPoints = roundPoints(transactions
    .filter((transaction) => transaction.status !== "expired" && transaction.status !== "reversed")
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0));
  const pendingPoints = roundPoints(transactions
    .filter((transaction) => transaction.status === "pending" && transaction.pointsDelta > 0)
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0));
  const unlockedPoints = roundPoints(transactions
    .filter((transaction) => transaction.status !== "pending" && transaction.status !== "expired" && transaction.status !== "reversed")
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0));
  const lifetimeEarned = roundPoints(transactions
    .filter((transaction) => transaction.pointsDelta > 0 && transaction.status !== "expired" && transaction.status !== "reversed")
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0));
  const lifetimeRedeemed = roundPoints(Math.abs(transactions
    .filter((transaction) => transaction.pointsDelta < 0 && (transaction.status === "redeemed" || transaction.status === "cashed_out"))
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0)));
  const updatedAt = sortByNewest(transactions)[0]?.createdAt
    ?? state.balances.find((entry) => entry.userId === userId && entry.role === role)?.updatedAt
    ?? new Date().toISOString();

  return {
    userId,
    role,
    totalPoints,
    pendingPoints,
    unlockedPoints,
    lifetimeEarned,
    lifetimeRedeemed,
    updatedAt
  };
}

function synchronizeBalances(state: PointsState) {
  const identityMap = new Map<string, PointsRole>();

  state.balances.forEach((record) => {
    identityMap.set(`${record.role}:${record.userId}`, record.role);
  });
  state.transactions.forEach((record) => {
    identityMap.set(`${record.role}:${record.userId}`, record.role);
  });
  state.cashoutRequests.forEach((record) => {
    identityMap.set(`${record.role}:${record.userId}`, record.role);
  });

  const balances = [...identityMap.entries()].map(([key, role]) => {
    const userId = key.slice(role.length + 1);
    return computeBalanceRecord(state, userId, role);
  });

  return {
    ...state,
    balances: balances.sort((left, right) => left.userId.localeCompare(right.userId))
  };
}

function buildBalanceView(state: PointsState, scope: PointsScope): PointsBalanceView {
  const record = state.balances.find((entry) => entry.userId === scope.userId && entry.role === scope.role)
    ?? computeBalanceRecord(state, scope.userId, scope.role);
  const scopedTransactions = state.transactions.filter((transaction) =>
    transaction.userId === scope.userId && transaction.role === scope.role
  );
  const promoUnlockedPoints = roundPoints(scopedTransactions
    .filter((transaction) => transaction.pointClass === "promo" && transaction.status !== "pending" && transaction.status !== "expired" && transaction.status !== "reversed")
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0));
  const earnedUnlockedPoints = roundPoints(scopedTransactions
    .filter((transaction) => transaction.pointClass === "earned" && transaction.status !== "pending" && transaction.status !== "expired" && transaction.status !== "reversed")
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0));
  const referralPendingPoints = roundPoints(scopedTransactions
    .filter((transaction) => transaction.eventType === "referral" && transaction.status === "pending" && transaction.pointsDelta > 0)
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0));
  const reservedCashoutPoints = roundPoints(getReservedCashoutPoints(state, scope.userId));
  const cashoutEligiblePoints = roundPoints(Math.max(0, earnedUnlockedPoints - reservedCashoutPoints));
  const balance = {
    userId: scope.userId,
    role: scope.role,
    totalPoints: record.totalPoints,
    pendingPoints: record.pendingPoints,
    unlockedPoints: record.unlockedPoints,
    lifetimeEarned: record.lifetimeEarned,
    lifetimeRedeemed: record.lifetimeRedeemed,
    inAppValue: pointsToInAppValue(record.unlockedPoints),
    cashoutValue: pointsToCashValue(cashoutEligiblePoints),
    promoUnlockedPoints,
    earnedUnlockedPoints,
    referralPendingPoints,
    reservedCashoutPoints,
    cashoutEligiblePoints,
    updatedAt: record.updatedAt
  };

  return {
    ...balance,
    explanation: buildPointsBalanceExplanation(balance)
  };
}

function appendEligibilitySnapshot(
  state: PointsState,
  input: {
    userId: string;
    role: PointsRole;
    eventType: PointsEventType;
    eligibilityStatus: RewardEligibilityStatus;
    validationFlags: Record<string, unknown>;
  }
) {
  const snapshot: RewardEligibilitySnapshotRecord = {
    id: createId("points-eligibility"),
    userId: input.userId,
    role: input.role,
    eventType: input.eventType,
    eligibilityStatus: input.eligibilityStatus,
    validationFlags: input.validationFlags,
    createdAt: new Date().toISOString()
  };

  return {
    state: {
      ...state,
      eligibilitySnapshots: sortByNewest([snapshot, ...state.eligibilitySnapshots])
    },
    snapshot
  };
}

export function awardPointsForEventInState(
  state: PointsState,
  input: RewardGuardrailInput
): RewardAwardResult {
  const now = new Date().toISOString();
  const rule = getProgramRule(state, input.role, input.eventType);
  const campaign = getPreferredCampaign(state, input.role, input.eventType, now);
  const multiplier = campaign?.multiplier ?? 1;
  const maxPointsPerEvent = rule?.maxPointsPerEvent ?? 0;
  const basePoints = roundPoints(input.basePoints ?? maxPointsPerEvent);
  const multipliedPoints = roundPoints(basePoints * multiplier);
  const windowIssuedPoints = rule ? getWindowIssuedPoints(state, input.userId, input.eventType, rule.windowDays, now) : 0;
  const remainingWindowPoints = rule ? Math.max(0, rule.maxPointsPerUserWindow - windowIssuedPoints) : 0;
  const budgetRemainingPoints = getCampaignBudgetRemaining(state, campaign?.id);
  const approvedPoints = rule
    ? Math.min(multipliedPoints, maxPointsPerEvent, remainingWindowPoints, budgetRemainingPoints)
    : 0;
  const paymentSettled = input.paymentSettled ?? true;
  const serviceCompleted = input.serviceCompleted ?? true;
  const refundClear = (input.refundState ?? "clean") === "clean";
  const phoneValidated = input.phoneValidated ?? true;
  const sourceUnique = !hasDuplicateReward(state, input);
  const referralUnique = input.referralId
    ? !state.transactions.some((transaction) =>
      transaction.referralId === input.referralId
      && transaction.userId === input.userId
      && transaction.role === input.role
      && transaction.pointsDelta > 0
      && transaction.status !== "expired"
      && transaction.status !== "reversed"
    )
    : true;
  const eventCapSafe = Boolean(rule && basePoints <= rule.maxPointsPerEvent);
  const windowSafe = Boolean(rule && remainingWindowPoints > 0);
  const fraudClear = !(input.fraudFlags?.length) && (input.anomalyScore ?? 0) < 0.8;
  const economicBudget = Math.max(input.platformFeeAmount ?? 0, (input.orderTotal ?? 0) * 0.12, 1.5);
  const economicSafe = pointsToInAppValue(approvedPoints) <= economicBudget;
  const validationFlags = {
    paymentSettled,
    serviceCompleted,
    refundClear,
    phoneValidated,
    sourceUnique,
    referralUnique,
    eventCapSafe,
    windowSafe,
    economicSafe,
    fraudClear,
    approvedPoints,
    multiplier,
    windowIssuedPoints,
    remainingWindowPoints,
    campaignId: campaign?.id ?? null,
    budgetRemainingPoints: Number.isFinite(budgetRemainingPoints) ? budgetRemainingPoints : null,
    locationId: input.locationId ?? null,
    orderTotal: input.orderTotal ?? null,
    anomalyScore: input.anomalyScore ?? 0,
    fraudFlags: input.fraudFlags ?? []
  } satisfies Record<string, unknown>;
  const eligibilityStatus: RewardEligibilityStatus = !fraudClear
    ? "pending_review"
    : !rule || !paymentSettled || !serviceCompleted || !refundClear || !phoneValidated || !sourceUnique || !referralUnique || !eventCapSafe || !windowSafe || !economicSafe || approvedPoints <= 0
      ? "blocked"
      : "eligible";
  const snapshotResult = appendEligibilitySnapshot(state, {
    userId: input.userId,
    role: input.role,
    eventType: input.eventType,
    eligibilityStatus,
    validationFlags
  });

  if (eligibilityStatus !== "eligible" || !rule || approvedPoints <= 0) {
    return {
      state: syncPointsStateLifecycle(snapshotResult.state),
      snapshot: snapshotResult.snapshot,
      transaction: null,
      approvedPoints: 0,
      campaign
    };
  }

  const pointClass: PointsPointClass = campaign?.pointClass ?? "earned";
  const unlockedAt = rule.delayUnlockHours > 0 ? addHours(now, rule.delayUnlockHours) : now;
  const transaction: PointsTransactionRecord = {
    id: createId("points-txn"),
    userId: input.userId,
    role: input.role,
    pointClass,
    eventType: input.eventType,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    referralId: input.referralId ?? null,
    pointsDelta: approvedPoints,
    inAppValue: pointsToInAppValue(approvedPoints),
    cashValue: pointClass === "earned" && rule.cashoutAllowed ? pointsToCashValue(approvedPoints) : 0,
    status: rule.delayUnlockHours > 0 ? "pending" : "unlocked",
    createdAt: now,
    unlockedAt,
    expiresAt: rule.expirationDays ? addDays(unlockedAt, rule.expirationDays) : null,
    reversedAt: null,
    metadata: {
      ...(input.metadata ?? {}),
      locationId: input.locationId ?? null,
      orderTotal: input.orderTotal ?? null,
      platformFeeAmount: input.platformFeeAmount ?? null,
      campaignId: campaign?.id ?? null,
      campaignName: campaign?.name ?? null,
      multiplier
    }
  };

  return {
    state: syncPointsStateLifecycle({
      ...snapshotResult.state,
      transactions: sortByNewest([transaction, ...snapshotResult.state.transactions])
    }),
    snapshot: snapshotResult.snapshot,
    transaction,
    approvedPoints,
    campaign
  };
}

export function reversePointsForAppointmentInState(
  state: PointsState,
  input: { appointmentId: string; reason: string }
) {
  const reversedAt = new Date().toISOString();
  const touched = state.transactions.filter((transaction) =>
    transaction.status !== "reversed"
    && (
      transaction.sourceId === input.appointmentId
      || transaction.metadata.appointmentId === input.appointmentId
    )
  );

  if (!touched.length) {
    return syncPointsStateLifecycle(state);
  }

  const nextTransactions = state.transactions.flatMap((transaction) => {
    const matches = touched.some((entry) => entry.id === transaction.id);
    if (!matches) {
      return [transaction];
    }

    return [
      {
        ...transaction,
        status: "reversed" as PointsTransactionStatus,
        reversedAt
      },
      {
        id: createId("points-reversal"),
        userId: transaction.userId,
        role: transaction.role,
        pointClass: transaction.pointClass,
        eventType: transaction.eventType,
        sourceType: "refund" as PointsSourceType,
        sourceId: `${transaction.id}:reversal`,
        referralId: transaction.referralId ?? null,
        pointsDelta: -transaction.pointsDelta,
        inAppValue: -transaction.inAppValue,
        cashValue: -transaction.cashValue,
        status: "reversed" as PointsTransactionStatus,
        createdAt: reversedAt,
        unlockedAt: reversedAt,
        expiresAt: null,
        reversedAt,
        metadata: {
          appointmentId: input.appointmentId,
          reversalOf: transaction.id,
          reason: input.reason
        }
      } satisfies PointsTransactionRecord
    ];
  });

  return syncPointsStateLifecycle({
    ...state,
    transactions: sortByNewest(nextTransactions)
  });
}

function resolveRedemptionSourceType(purpose: RedemptionCommitInput["purpose"]): PointsSourceType {
  switch (purpose) {
    case "subscription_credit":
      return "subscription_credit";
    case "campaign_credit":
      return "campaign_credit";
    default:
      return "booking_redemption";
  }
}

function resolveRedemptionEventType(purpose: RedemptionCommitInput["purpose"]): PointsEventType {
  return purpose === "booking_discount" ? "booking" : "campaign";
}

export function commitPointsRedemptionInState(
  state: PointsState,
  input: RedemptionCommitInput
): PointsRedemptionCommitView & { state: PointsState } {
  const balance = buildBalanceView(syncPointsStateLifecycle(state), {
    userId: input.userId,
    role: input.role
  });
  const preview = previewPointsRedemption({
    requestedPoints: input.requestedPoints,
    promoUnlockedPoints: balance.promoUnlockedPoints,
    earnedUnlockedPoints: balance.earnedUnlockedPoints,
    orderTotal: input.orderTotal,
    maxRedemptionRate: DEFAULT_MAX_REDEMPTION_RATE
  });

  if (!preview.approvedPoints) {
    return {
      state: syncPointsStateLifecycle(state),
      balance,
      preview,
      transactions: []
    };
  }

  const createdAt = new Date().toISOString();
  const transactions: PointsTransactionRecord[] = [];

  if (preview.promoPointsUsed > 0) {
    transactions.push({
      id: createId("points-redeem"),
      userId: input.userId,
      role: input.role,
      pointClass: "promo",
      eventType: resolveRedemptionEventType(input.purpose),
      sourceType: resolveRedemptionSourceType(input.purpose),
      sourceId: input.sourceId,
      referralId: null,
      pointsDelta: -preview.promoPointsUsed,
      inAppValue: -pointsToInAppValue(preview.promoPointsUsed),
      cashValue: 0,
      status: "redeemed",
      createdAt,
      unlockedAt: createdAt,
      expiresAt: null,
      reversedAt: null,
      metadata: {
        ...(input.metadata ?? {}),
        locationId: input.locationId ?? null,
        redemptionPurpose: input.purpose
      }
    });
  }

  if (preview.earnedPointsUsed > 0) {
    transactions.push({
      id: createId("points-redeem"),
      userId: input.userId,
      role: input.role,
      pointClass: "earned",
      eventType: resolveRedemptionEventType(input.purpose),
      sourceType: resolveRedemptionSourceType(input.purpose),
      sourceId: input.sourceId,
      referralId: null,
      pointsDelta: -preview.earnedPointsUsed,
      inAppValue: -pointsToInAppValue(preview.earnedPointsUsed),
      cashValue: -pointsToCashValue(preview.earnedPointsUsed),
      status: "redeemed",
      createdAt,
      unlockedAt: createdAt,
      expiresAt: null,
      reversedAt: null,
      metadata: {
        ...(input.metadata ?? {}),
        locationId: input.locationId ?? null,
        redemptionPurpose: input.purpose
      }
    });
  }

  const nextState = syncPointsStateLifecycle({
    ...state,
    transactions: sortByNewest([...transactions, ...state.transactions])
  });

  return {
    state: nextState,
    balance: buildBalanceView(nextState, { userId: input.userId, role: input.role }),
    preview,
    transactions
  };
}

export function createCashoutRequestInState(
  state: PointsState,
  input: CashoutRequestInput
): PointsCashoutRequestView & { state: PointsState } {
  const nextState = syncPointsStateLifecycle(state);
  const existingOpenRequest = nextState.cashoutRequests.find((request) =>
    request.userId === input.userId
    && request.role === input.role
    && ["requested", "under_review", "approved", "failed"].includes(request.status)
  );

  if (existingOpenRequest) {
    throw new Error("An open BVR Points cash-out request already exists.");
  }

  const balance = buildBalanceView(nextState, {
    userId: input.userId,
    role: input.role
  });
  const preview = previewCashoutRequest({
    requestedPoints: input.requestedPoints,
    availableEarnedPoints: balance.cashoutEligiblePoints,
    minimumThresholdPoints: input.minimumThresholdPoints ?? DEFAULT_CASHOUT_MIN_POINTS,
    cashoutRate: input.cashoutRate ?? POINT_CASH_VALUE
  });

  if (!preview.approvedPoints) {
    throw new Error(preview.blockedReason ?? "Cash-out request is not eligible yet.");
  }

  const request: CashoutRequestRecord = {
    id: createId("cashout"),
    userId: input.userId,
    role: input.role,
    pointsRequested: preview.approvedPoints,
    cashValue: preview.cashValue,
    status: "requested",
    createdAt: new Date().toISOString(),
    processedAt: null,
    metadata: {
      cashoutRate: input.cashoutRate ?? POINT_CASH_VALUE,
      minimumThresholdPoints: input.minimumThresholdPoints ?? DEFAULT_CASHOUT_MIN_POINTS,
      ...(input.metadata ?? {})
    }
  };

  const persistedState = syncPointsStateLifecycle({
    ...nextState,
    cashoutRequests: sortByNewest([request, ...nextState.cashoutRequests])
  });

  return {
    state: persistedState,
    balance: buildBalanceView(persistedState, { userId: input.userId, role: input.role }),
    preview,
    request
  };
}

function estimatePlatformFee(orderTotal: number, explicitPlatformFeeAmount?: number) {
  if (typeof explicitPlatformFeeAmount === "number" && explicitPlatformFeeAmount > 0) {
    return explicitPlatformFeeAmount;
  }

  return roundCurrency(orderTotal * 0.05);
}

function isQualifiedTip(tipAmount?: number) {
  return (tipAmount ?? 0) >= 5;
}

function resolveTipRewardPoints(tipAmount?: number) {
  if (!isQualifiedTip(tipAmount)) {
    return 0;
  }

  return roundPoints(Math.min(6, Math.floor(tipAmount ?? 0)));
}

async function resolveClientUserId(clientReference: string, supabase?: SupabaseClient | null) {
  if (!supabase) {
    return clientReference;
  }

  const clientResult = await supabase
    .from("clients")
    .select("id, reference_code, profile_id")
    .or(`id.eq.${clientReference},reference_code.eq.${clientReference}`)
    .limit(1)
    .maybeSingle();

  if (clientResult.error) {
    return clientReference;
  }

  return clientResult.data?.profile_id ?? clientReference;
}

async function resolveBarberUserId(barberReference: string, supabase?: SupabaseClient | null) {
  if (!supabase) {
    return barberReference;
  }

  const barberResult = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id")
    .or(`id.eq.${barberReference},reference_code.eq.${barberReference}`)
    .limit(1)
    .maybeSingle();

  if (barberResult.error) {
    return barberReference;
  }

  return barberResult.data?.profile_id ?? barberReference;
}

async function resolveOwnerUserId(locationReference: string, supabase?: SupabaseClient | null) {
  if (!supabase) {
    return `owner:${locationReference}`;
  }

  const profilesResult = await supabase
    .from("profiles")
    .select("id, role")
    .eq("role", "owner")
    .limit(1);

  if (profilesResult.error) {
    return `owner:${locationReference}`;
  }

  return profilesResult.data?.[0]?.id ?? `owner:${locationReference}`;
}

function buildPointsTransactionPlatformEvent(transaction: PointsTransactionRecord): PlatformEventInput | null {
  const eventType = transaction.pointsDelta > 0
    ? "points_earned"
    : transaction.pointsDelta < 0 && transaction.status === "redeemed"
      ? "points_redeemed"
      : null;

  if (!eventType) {
    return null;
  }

  return {
    eventType,
    entityType: "points_transaction",
    entityId: transaction.id,
    actorId: transaction.userId,
    actorRole: transaction.role,
    source: "system",
    relatedIds: {
      pointsTransactionId: transaction.id,
      sourceType: transaction.sourceType,
      sourceId: transaction.sourceId,
      appointmentId: transaction.metadata.appointmentId,
      locationId: transaction.metadata.locationId,
      referralId: transaction.referralId
    },
    payload: {
      role: transaction.role,
      pointClass: transaction.pointClass,
      eventType: transaction.eventType,
      sourceType: transaction.sourceType,
      pointsDelta: transaction.pointsDelta,
      inAppValue: transaction.inAppValue,
      cashValue: transaction.cashValue,
      status: transaction.status,
      metadata: transaction.metadata
    },
    idempotencyKey: buildPlatformEventIdempotencyKey(["points", transaction.id, eventType]),
    occurredAt: transaction.createdAt
  };
}

async function recordPointsTransactionPlatformEvents(
  supabase: SupabaseClient,
  previousState: PointsState,
  nextState: PointsState
) {
  const previousTransactionIds = new Set(previousState.transactions.map((transaction) => transaction.id));
  const events = nextState.transactions
    .filter((transaction) => !previousTransactionIds.has(transaction.id))
    .map(buildPointsTransactionPlatformEvent)
    .filter((event): event is PlatformEventInput => Boolean(event));

  if (events.length) {
    await recordRequiredPlatformEvents(supabase, events);
  }
}

async function withMutation<T>(mutate: (state: PointsState, supabase?: SupabaseClient | null) => Promise<{ state: PointsState; result: T }>) {
  const storage = await readStorageContext();
  const payload = await mutate(storage.state, storage.kind === "supabase" ? storage.supabase : null);
  await persistStorageContext({
    ...storage,
    state: payload.state
  } as StorageContext);
  if (storage.kind === "supabase") {
    await recordPointsTransactionPlatformEvents(storage.supabase, storage.state, payload.state);
  }
  return payload.result;
}

export async function readPointsStateSnapshot(): Promise<PointsState> {
  const storage = await readStorageContext();
  return clone(storage.state);
}

export async function writePointsStateSnapshot(nextState: PointsState) {
  const storage = await readStorageContext();
  await persistStorageContext({
    ...storage,
    state: clone(nextState)
  } as StorageContext);
}

export async function readPointsBalanceForScope(scope: PointsScope): Promise<PointsBalanceView> {
  const storage = await readStorageContext();
  return buildBalanceView(storage.state, scope);
}

export async function readPointsBalanceForClientReference(
  clientReference: string,
  supabase?: SupabaseClient | null
): Promise<PointsBalanceView> {
  if (!supabase) {
    return buildBalanceView(createEmptyLivePointsState(), {
      userId: clientReference,
      role: "client"
    });
  }

  const userId = await resolveClientUserId(clientReference, supabase);
  return readPointsBalanceForScope({
    userId,
    role: "client"
  });
}

export async function readPointsHistoryForScope(scope: PointsScope): Promise<PointsHistoryView> {
  const storage = await readStorageContext();
  const history = {
    balance: buildBalanceView(storage.state, scope),
    transactions: storage.state.transactions.filter((transaction) => transaction.userId === scope.userId && transaction.role === scope.role),
    eligibilitySnapshots: storage.state.eligibilitySnapshots.filter((snapshot) => snapshot.userId === scope.userId && snapshot.role === scope.role),
    cashoutRequests: storage.state.cashoutRequests.filter((request) => request.userId === scope.userId && request.role === scope.role)
  };

  return {
    ...history,
    activity: buildPointsActivityView(history)
  };
}

export async function readPointsCampaignsForRole(role: PointsRole): Promise<PointsCampaignView> {
  const storage = await readStorageContext();
  const referenceAt = new Date().toISOString();
  const scopedCampaigns = storage.state.campaigns.filter((campaign) => campaign.roleTarget === "all" || campaign.roleTarget === role);

  return {
    campaigns: scopedCampaigns,
    activeCampaigns: scopedCampaigns.filter((campaign) =>
      campaign.isActive
      && campaign.startAt <= referenceAt
      && campaign.endAt >= referenceAt
    )
  };
}

export async function previewPointsRedemptionForUser(input: {
  userId: string;
  role: PointsRole;
  requestedPoints: number;
  orderTotal: number;
}) {
  const balance = await readPointsBalanceForScope({
    userId: input.userId,
    role: input.role
  });
  return previewPointsRedemption({
    requestedPoints: input.requestedPoints,
    promoUnlockedPoints: balance.promoUnlockedPoints,
    earnedUnlockedPoints: balance.earnedUnlockedPoints,
    orderTotal: input.orderTotal,
    maxRedemptionRate: DEFAULT_MAX_REDEMPTION_RATE
  });
}

export async function previewPointsQuoteAdjustment(input: {
  userId: string;
  role: PointsRole;
  requestedPoints: number;
  quote: AppointmentFinancialQuote;
}) {
  const preview = await previewPointsRedemptionForUser({
    userId: input.userId,
    role: input.role,
    requestedPoints: input.requestedPoints,
    orderTotal: input.quote.grandTotal
  });

  return {
    preview,
    quote: applyPointsPreviewToQuote(input.quote, preview)
  };
}

export async function commitPointsRedemption(input: RedemptionCommitInput): Promise<PointsRedemptionCommitView> {
  return withMutation(async (state) => {
    const result = commitPointsRedemptionInState(state, input);
    return {
      state: result.state,
      result: {
        balance: result.balance,
        preview: result.preview,
        transactions: result.transactions
      }
    };
  });
}

export async function requestPointsCashout(input: CashoutRequestInput): Promise<PointsCashoutRequestView> {
  return withMutation(async (state) => {
    const result = createCashoutRequestInState(state, input);
    return {
      state: result.state,
      result: {
        balance: result.balance,
        preview: result.preview,
        request: result.request
      }
    };
  });
}

export async function processCompletedAppointmentPoints(input: AppointmentPointsInput) {
  return withMutation(async (state, supabase) => {
    let nextState = state;
    const clientUserId = await resolveClientUserId(input.clientId, supabase);
    const barberUserId = await resolveBarberUserId(input.barberId, supabase);
    const ownerUserId = await resolveOwnerUserId(input.locationId, supabase);
    const platformFeeAmount = estimatePlatformFee(input.orderTotal, input.platformFeeAmount);
    const bookingAward = awardPointsForEventInState(nextState, {
      userId: clientUserId,
      role: "client",
      eventType: "booking",
      sourceType: "appointment",
      sourceId: input.appointmentId,
      basePoints: 8,
      orderTotal: input.orderTotal,
      platformFeeAmount,
      paymentSettled: input.paymentSettled,
      serviceCompleted: input.serviceCompleted,
      refundState: input.refundState ?? "clean",
      phoneValidated: input.clientPhoneValidated ?? true,
      locationId: input.locationId,
      metadata: {
        appointmentId: input.appointmentId,
        clientId: input.clientId,
        barberId: input.barberId,
        locationId: input.locationId,
        completedAt: input.completedAt ?? new Date().toISOString()
      }
    });
    nextState = bookingAward.state;
    const transactions = bookingAward.transaction ? [bookingAward.transaction] : [];
    const completedBookingCount = input.completedBookingCount ?? 1;

    if (completedBookingCount >= 2) {
      const retentionAward = awardPointsForEventInState(nextState, {
        userId: clientUserId,
        role: "client",
        eventType: "retention",
        sourceType: "appointment",
        sourceId: `${input.appointmentId}:retention`,
        basePoints: 12,
        orderTotal: input.orderTotal,
        platformFeeAmount,
        paymentSettled: input.paymentSettled,
        serviceCompleted: input.serviceCompleted,
        refundState: input.refundState ?? "clean",
        phoneValidated: input.clientPhoneValidated ?? true,
        locationId: input.locationId,
        metadata: {
          appointmentId: input.appointmentId,
          clientId: input.clientId,
          barberId: input.barberId,
          locationId: input.locationId,
          completedBookingCount
        }
      });
      nextState = retentionAward.state;
      if (retentionAward.transaction) {
        transactions.push(retentionAward.transaction);
      }
    }

    const tipRewardPoints = resolveTipRewardPoints(input.tipAmount);
    if (tipRewardPoints > 0) {
      const tipAward = awardPointsForEventInState(nextState, {
        userId: clientUserId,
        role: "client",
        eventType: "tip",
        sourceType: "appointment",
        sourceId: `${input.appointmentId}:tip`,
        basePoints: tipRewardPoints,
        orderTotal: input.orderTotal,
        platformFeeAmount,
        paymentSettled: input.paymentSettled,
        serviceCompleted: input.serviceCompleted,
        refundState: input.refundState ?? "clean",
        phoneValidated: input.clientPhoneValidated ?? true,
        locationId: input.locationId,
        metadata: {
          appointmentId: input.appointmentId,
          clientId: input.clientId,
          barberId: input.barberId,
          locationId: input.locationId,
          tipAmount: input.tipAmount ?? 0
        }
      });
      nextState = tipAward.state;
      if (tipAward.transaction) {
        transactions.push(tipAward.transaction);
      }
    }

    let referralReward: {
      referralId: string;
      creditedTransactionId: string | null;
      rewardPointsIssued: number;
    } | null = null;

    if (input.referralReward) {
      const referralAwards: RewardGuardrailInput[] = [
        {
          userId: await resolveClientUserId(input.referralReward.referrerClientId, supabase),
          role: "client",
          eventType: "referral",
          sourceType: "referral_event",
          sourceId: `${input.referralReward.referralId}:client`,
          referralId: input.referralReward.referralId,
          basePoints: 10,
          orderTotal: input.orderTotal,
          platformFeeAmount,
          paymentSettled: input.paymentSettled,
          serviceCompleted: input.serviceCompleted,
          refundState: input.refundState ?? "clean",
          phoneValidated: input.clientPhoneValidated ?? true,
          locationId: input.locationId,
          metadata: {
            appointmentId: input.appointmentId,
            referredClientId: input.clientId,
            referrerClientId: input.referralReward.referrerClientId,
            barberId: input.barberId,
            locationId: input.locationId,
            completedAt: input.completedAt ?? new Date().toISOString()
          }
        },
        {
          userId: barberUserId,
          role: "barber",
          eventType: "referral",
          sourceType: "referral_event",
          sourceId: `${input.referralReward.referralId}:barber`,
          referralId: input.referralReward.referralId,
          basePoints: 15,
          orderTotal: input.orderTotal,
          platformFeeAmount,
          paymentSettled: input.paymentSettled,
          serviceCompleted: input.serviceCompleted,
          refundState: input.refundState ?? "clean",
          phoneValidated: input.clientPhoneValidated ?? true,
          locationId: input.locationId,
          metadata: {
            appointmentId: input.appointmentId,
            referredClientId: input.clientId,
            barberId: input.barberId,
            locationId: input.locationId,
            completedAt: input.completedAt ?? new Date().toISOString()
          }
        },
        {
          userId: ownerUserId,
          role: "owner",
          eventType: "referral",
          sourceType: "referral_event",
          sourceId: `${input.referralReward.referralId}:owner`,
          referralId: input.referralReward.referralId,
          basePoints: 20,
          orderTotal: input.orderTotal,
          platformFeeAmount,
          paymentSettled: input.paymentSettled,
          serviceCompleted: input.serviceCompleted,
          refundState: input.refundState ?? "clean",
          phoneValidated: input.clientPhoneValidated ?? true,
          locationId: input.locationId,
          metadata: {
            appointmentId: input.appointmentId,
            referredClientId: input.clientId,
            barberId: input.barberId,
            locationId: input.locationId,
            completedAt: input.completedAt ?? new Date().toISOString()
          }
        }
      ];

      for (const rewardInput of referralAwards) {
        const referralAward = awardPointsForEventInState(nextState, rewardInput);
        nextState = referralAward.state;
        if (referralAward.transaction) {
          transactions.push(referralAward.transaction);
        }
      }

      const referralTransactions = transactions.filter((transaction) =>
        transaction.eventType === "referral"
        && transaction.referralId === input.referralReward?.referralId
      );
      const referrerClientTransaction = referralTransactions.find((transaction) => transaction.role === "client") ?? null;

      if (referralTransactions.length) {
        referralReward = {
          referralId: input.referralReward.referralId,
          creditedTransactionId: referrerClientTransaction?.id ?? referralTransactions[0]?.id ?? null,
          rewardPointsIssued: referralTransactions.reduce((sum, transaction) => sum + Math.max(transaction.pointsDelta, 0), 0)
        };
      }
    }

    return {
      state: nextState,
      result: {
        transactions,
        balances: {
          client: buildBalanceView(nextState, { userId: clientUserId, role: "client" }),
          barber: buildBalanceView(nextState, { userId: barberUserId, role: "barber" }),
          owner: buildBalanceView(nextState, { userId: ownerUserId, role: "owner" })
        },
        referralReward
      }
    };
  });
}

export async function reversePointsForAppointment(input: { appointmentId: string; reason: string }) {
  return withMutation(async (state) => ({
    state: reversePointsForAppointmentInState(state, input),
    result: true
  }));
}

export async function buildOwnerPointsAnalyticsSummary(input?: {
  locationIds?: string[];
  grossRevenue?: number;
  referralCompleted?: number;
  referralCredited?: number;
}): Promise<OwnerPointsAnalyticsSummary> {
  const storage = await readStorageContext();
  const locationIds = input?.locationIds ?? [];
  const transactions = storage.state.transactions.filter((transaction) => {
    if (!locationIds.length) {
      return true;
    }

    const locationId = typeof transaction.metadata.locationId === "string" ? transaction.metadata.locationId : null;
    return !locationId || locationIds.includes(locationId);
  });
  const eligibilitySnapshots = storage.state.eligibilitySnapshots.filter((snapshot) => {
    if (!locationIds.length) {
      return true;
    }

    const locationId = typeof snapshot.validationFlags.locationId === "string"
      ? snapshot.validationFlags.locationId
      : null;
    return !locationId || locationIds.includes(locationId);
  });
  const positiveTransactions = transactions.filter((transaction) => transaction.pointsDelta > 0 && transaction.status !== "expired" && transaction.status !== "reversed");
  const grossPositiveTransactions = transactions.filter((transaction) => transaction.pointsDelta > 0 && transaction.status !== "expired");
  const issuedPoints = positiveTransactions.reduce((sum, transaction) => sum + transaction.pointsDelta, 0);
  const pendingPoints = positiveTransactions
    .filter((transaction) => transaction.status === "pending")
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0);
  const unlockedPoints = transactions
    .filter((transaction) => transaction.status !== "pending" && transaction.status !== "expired" && transaction.status !== "reversed")
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0);
  const redeemedPoints = roundPoints(Math.abs(transactions
    .filter((transaction) => transaction.pointsDelta < 0 && transaction.status === "redeemed")
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0)));
  const cashedOutPoints = roundPoints(Math.abs(transactions
    .filter((transaction) => transaction.pointsDelta < 0 && transaction.status === "cashed_out")
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0)));
  const issuedInAppValue = roundCurrency(positiveTransactions.reduce((sum, transaction) => sum + transaction.inAppValue, 0));
  const redeemedInAppValue = roundCurrency(Math.abs(transactions
    .filter((transaction) => transaction.pointsDelta < 0 && transaction.status === "redeemed")
    .reduce((sum, transaction) => sum + transaction.inAppValue, 0)));
  const cashedOutValue = roundCurrency(Math.abs(transactions
    .filter((transaction) => transaction.pointsDelta < 0 && transaction.status === "cashed_out")
    .reduce((sum, transaction) => sum + transaction.cashValue, 0)));
  const grossRevenue = input?.grossRevenue ?? 0;
  const pointLiabilityPoints = roundPoints(Math.max(0, transactions
    .filter((transaction) => transaction.status !== "expired" && transaction.status !== "reversed")
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0)));
  const pointLiabilityValue = roundCurrency(pointsToInAppValue(pointLiabilityPoints));
  const reversedPoints = roundPoints(grossPositiveTransactions
    .filter((transaction) => transaction.status === "reversed")
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0));
  const pendingReviewSnapshots = eligibilitySnapshots.filter((snapshot) => snapshot.eligibilityStatus === "pending_review").length;
  const issuanceByEventType = (["booking", "retention", "tip", "referral", "campaign"] as PointsEventType[])
    .map((eventType) => {
      const eventTransactions = positiveTransactions.filter((transaction) => transaction.eventType === eventType);
      return {
        eventType,
        issuedPoints: eventTransactions.reduce((sum, transaction) => sum + transaction.pointsDelta, 0),
        issuedInAppValue: roundCurrency(eventTransactions.reduce((sum, transaction) => sum + transaction.inAppValue, 0)),
        transactionCount: eventTransactions.length
      };
    })
    .filter((entry) => entry.issuedPoints > 0)
    .sort((left, right) => right.issuedPoints - left.issuedPoints);

  return {
    issuedPoints,
    pendingPoints,
    unlockedPoints: roundPoints(Math.max(0, unlockedPoints)),
    redeemedPoints,
    cashedOutPoints,
    pointLiabilityPoints,
    pointLiabilityValue,
    reversedPoints,
    issuedInAppValue,
    redeemedInAppValue,
    cashedOutValue,
    rewardSpendRate: grossRevenue ? roundCurrency(((redeemedInAppValue + cashedOutValue) / grossRevenue) * 100) : 0,
    redemptionRate: issuedPoints ? roundCurrency((redeemedPoints / issuedPoints) * 100) : 0,
    cashoutRate: issuedPoints ? roundCurrency((cashedOutPoints / issuedPoints) * 100) : 0,
    reversalRate: grossPositiveTransactions.length ? roundCurrency((reversedPoints / grossPositiveTransactions.reduce((sum, transaction) => sum + transaction.pointsDelta, 0)) * 100) : 0,
    fraudReviewRate: eligibilitySnapshots.length ? roundCurrency((pendingReviewSnapshots / eligibilitySnapshots.length) * 100) : 0,
    referralRewardTransactions: positiveTransactions.filter((transaction) => transaction.eventType === "referral").length,
    referralConversionRate: input?.referralCompleted
      ? roundCurrency(((input.referralCredited ?? 0) / input.referralCompleted) * 100)
      : 0,
    ltvUplift: DEFAULT_OWNER_LTV_UPLIFT,
    issuanceByEventType,
    topCampaigns: storage.state.campaigns.map((campaign) => {
      const campaignTransactions = positiveTransactions.filter((transaction) => transaction.metadata.campaignId === campaign.id);
      const attributedRevenue = roundCurrency(campaignTransactions.reduce((sum, transaction) => {
        const orderTotal = typeof transaction.metadata.orderTotal === "number"
          ? transaction.metadata.orderTotal
          : Number(transaction.metadata.orderTotal ?? 0);
        return sum + (Number.isFinite(orderTotal) ? orderTotal : 0);
      }, 0));
      const issuedValue = roundCurrency(campaignTransactions.reduce((sum, transaction) => sum + transaction.inAppValue, 0));
      const redeemedValue = roundCurrency(Math.abs(transactions
        .filter((transaction) => transaction.metadata.campaignId === campaign.id && transaction.pointsDelta < 0 && transaction.status === "redeemed")
        .reduce((sum, transaction) => sum + transaction.inAppValue, 0)));

      return {
        campaignId: campaign.id,
        name: campaign.name,
        issuedPoints: campaignTransactions.reduce((sum, transaction) => sum + transaction.pointsDelta, 0),
        inAppValue: issuedValue,
        redeemedValue,
        attributedRevenue,
        rewardCostRate: attributedRevenue ? roundCurrency((issuedValue / attributedRevenue) * 100) : 0,
        redemptionRate: issuedValue ? roundCurrency((redeemedValue / issuedValue) * 100) : 0
      };
    }).filter((campaign) => campaign.issuedPoints > 0)
      .sort((left, right) => right.issuedPoints - left.issuedPoints)
      .slice(0, 5)
  };
}

export async function refreshPointsLifecycle() {
  return withMutation(async (state) => ({
    state: syncPointsStateLifecycle(state),
    result: true
  }));
}

export function buildPointsBalanceFromState(state: PointsState, scope: PointsScope) {
  return buildBalanceView(syncPointsStateLifecycle(state), scope);
}

export function buildPointsHistoryFromState(state: PointsState, scope: PointsScope): PointsHistoryView {
  const nextState = syncPointsStateLifecycle(state);
  const history = {
    balance: buildBalanceView(nextState, scope),
    transactions: nextState.transactions.filter((transaction) => transaction.userId === scope.userId && transaction.role === scope.role),
    eligibilitySnapshots: nextState.eligibilitySnapshots.filter((snapshot) => snapshot.userId === scope.userId && snapshot.role === scope.role),
    cashoutRequests: nextState.cashoutRequests.filter((request) => request.userId === scope.userId && request.role === scope.role)
  };

  return {
    ...history,
    activity: buildPointsActivityView(history)
  };
}

export function buildSyntheticPointsState() {
  return syncPointsStateLifecycle(createInitialPointsState());
}
