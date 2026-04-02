import { randomUUID } from "crypto";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { demoUsers } from "@/lib/data/demo";
import {
  readPointsStateSnapshot,
  writePointsStateSnapshot
} from "@/lib/points/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";
import type {
  CashoutReviewEntryView,
  CashoutReviewQueueView
} from "@/types/fintech";
import type {
  CashoutRequestRecord,
  PointsState,
  PointsTransactionRecord
} from "@/types/points";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type CashoutReviewAction = "under_review" | "approved" | "rejected" | "paid" | "failed" | "reversed";

type CashoutReviewTransitionInput = {
  requestId: string;
  nextStatus: CashoutReviewAction;
  actorUserId: string;
  actorRole: UserAccount["role"];
  note?: string;
  fraudFlags?: string[];
  payoutReference?: string | null;
};

type PayoutTarget = {
  mode: "stripe_connect" | "manual";
  providerAccountId?: string | null;
  label: string;
};

const ALLOWED_TRANSITIONS: Record<CashoutRequestRecord["status"], CashoutReviewAction[]> = {
  requested: ["under_review", "approved", "rejected"],
  under_review: ["approved", "rejected"],
  approved: ["paid", "failed", "rejected", "reversed"],
  paid: ["reversed"],
  failed: ["paid", "reversed"],
  rejected: [],
  reversed: []
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPoints(value: number) {
  return Math.max(0, Math.floor(value));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function appendAuditLog(
  request: CashoutRequestRecord,
  input: {
    actorUserId: string;
    actorRole: string;
    action: string;
    note?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const metadata = clone(request.metadata ?? {});
  const existingAuditLog = Array.isArray(metadata.auditLog) ? metadata.auditLog : [];
  metadata.auditLog = [
    ...existingAuditLog,
    {
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: input.action,
      createdAt: new Date().toISOString(),
      note: input.note ?? null,
      metadata: input.metadata ?? {}
    }
  ];
  return metadata;
}

function getFraudFlags(request: CashoutRequestRecord) {
  return Array.isArray(request.metadata?.fraudFlags)
    ? request.metadata.fraudFlags.filter((flag): flag is string => typeof flag === "string")
    : [];
}

function buildCashoutTransaction(request: CashoutRequestRecord, payoutReference: string): PointsTransactionRecord {
  return {
    id: `pts-txn-cashout-${randomUUID().slice(0, 8)}`,
    userId: request.userId,
    role: request.role,
    pointClass: "earned",
    eventType: "cashout",
    sourceType: "cashout_request",
    sourceId: request.id,
    pointsDelta: -roundPoints(request.pointsRequested),
    inAppValue: 0,
    cashValue: -roundCurrency(request.cashValue),
    status: "cashed_out",
    createdAt: new Date().toISOString(),
    metadata: {
      payoutReference
    }
  };
}

function buildCashoutReversalTransaction(request: CashoutRequestRecord, payoutReference?: string | null): PointsTransactionRecord {
  return {
    id: `pts-txn-cashout-reversal-${randomUUID().slice(0, 8)}`,
    userId: request.userId,
    role: request.role,
    pointClass: "earned",
    eventType: "cashout",
    sourceType: "manual",
    sourceId: `${request.id}:reversal`,
    pointsDelta: roundPoints(request.pointsRequested),
    inAppValue: 0,
    cashValue: roundCurrency(request.cashValue),
    status: "reversed",
    createdAt: new Date().toISOString(),
    metadata: {
      payoutReference: payoutReference ?? null,
      reversalOfCashoutRequestId: request.id
    }
  };
}

function computeBalance(state: PointsState, userId: string, role: "barber" | "owner") {
  const transactions = state.transactions.filter((transaction) => transaction.userId === userId && transaction.role === role);
  const cashoutRequests = state.cashoutRequests.filter((request) => request.userId === userId && request.role === role);
  const unlockedEarnedPoints = transactions
    .filter((transaction) =>
      transaction.pointClass === "earned"
      && transaction.pointsDelta > 0
      && transaction.status === "unlocked"
    )
    .reduce((sum, transaction) => sum + transaction.pointsDelta, 0)
    + transactions
      .filter((transaction) =>
        transaction.pointClass === "earned"
        && transaction.pointsDelta < 0
        && (transaction.status === "redeemed" || transaction.status === "cashed_out")
      )
      .reduce((sum, transaction) => sum + transaction.pointsDelta, 0);
  const reserved = cashoutRequests
    .filter((request) => ["requested", "under_review", "approved", "failed"].includes(request.status))
    .reduce((sum, request) => sum + request.pointsRequested, 0);

  return {
    cashoutEligiblePoints: Math.max(0, roundPoints(unlockedEarnedPoints) - reserved),
    reservedCashoutPoints: roundPoints(reserved)
  };
}

function syncPointsBalances(state: PointsState) {
  const nextState = clone(state);
  const keys = new Set(
    nextState.transactions
      .map((transaction) => `${transaction.role}:${transaction.userId}`)
      .concat(nextState.cashoutRequests.map((request) => `${request.role}:${request.userId}`))
  );

  nextState.balances = [...keys].map((identity) => {
    const [role, userId] = identity.split(":");
    const transactions = nextState.transactions.filter((transaction) => transaction.userId === userId && transaction.role === role);
    const totalPoints = roundPoints(
      transactions
        .filter((transaction) => transaction.status !== "expired" && transaction.status !== "reversed")
        .reduce((sum, transaction) => sum + transaction.pointsDelta, 0)
    );
    const pendingPoints = roundPoints(
      transactions
        .filter((transaction) => transaction.status === "pending" && transaction.pointsDelta > 0)
        .reduce((sum, transaction) => sum + transaction.pointsDelta, 0)
    );
    const unlockedPoints = roundPoints(
      transactions
        .filter((transaction) => transaction.status !== "pending" && transaction.status !== "expired" && transaction.status !== "reversed")
        .reduce((sum, transaction) => sum + transaction.pointsDelta, 0)
    );
    const lifetimeEarned = roundPoints(
      transactions
        .filter((transaction) => transaction.pointsDelta > 0 && transaction.status !== "expired" && transaction.status !== "reversed")
        .reduce((sum, transaction) => sum + transaction.pointsDelta, 0)
    );
    const lifetimeRedeemed = roundPoints(
      Math.abs(
        transactions
          .filter((transaction) => transaction.pointsDelta < 0 && (transaction.status === "redeemed" || transaction.status === "cashed_out"))
          .reduce((sum, transaction) => sum + transaction.pointsDelta, 0)
      )
    );

    return {
      userId,
      role: role as "client" | "barber" | "owner",
      totalPoints,
      pendingPoints,
      unlockedPoints,
      lifetimeEarned,
      lifetimeRedeemed,
      updatedAt: new Date().toISOString()
    };
  });

  return nextState;
}

export function transitionCashoutRequestInState(state: PointsState, input: CashoutReviewTransitionInput): PointsState {
  const request = state.cashoutRequests.find((entry) => entry.id === input.requestId);
  if (!request) {
    throw new Error("Cash-out request not found.");
  }

  if (!ALLOWED_TRANSITIONS[request.status].includes(input.nextStatus)) {
    throw new Error(`Cash-out request cannot move from ${request.status} to ${input.nextStatus}.`);
  }

  const fraudFlags = input.fraudFlags?.map((flag) => flag.trim()).filter(Boolean) ?? getFraudFlags(request);
  if (input.nextStatus === "approved" && fraudFlags.length) {
    throw new Error("Cash-out requests with unresolved fraud flags cannot be approved.");
  }

  const nextState = clone(state);
  const requestIndex = nextState.cashoutRequests.findIndex((entry) => entry.id === input.requestId);
  const nextRequest = clone(nextState.cashoutRequests[requestIndex]);
  const processedAt = ["approved", "paid", "failed", "rejected", "reversed"].includes(input.nextStatus)
    ? new Date().toISOString()
    : nextRequest.processedAt ?? null;
  const metadata = appendAuditLog(nextRequest, {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: input.nextStatus,
    note: input.note,
    metadata: {
      fraudFlags,
      payoutReference: input.payoutReference ?? null
    }
  });
  metadata.fraudFlags = fraudFlags;
  metadata.reviewNote = input.note ?? metadata.reviewNote ?? null;
  metadata.payoutReference = input.payoutReference ?? metadata.payoutReference ?? null;
  metadata.failureReason = input.nextStatus === "failed"
    ? input.note ?? metadata.failureReason ?? "Cash-out payout failed."
    : input.nextStatus === "paid"
      ? null
      : metadata.failureReason ?? null;
  metadata.lastReviewedBy = input.actorUserId;
  metadata.lastReviewedRole = input.actorRole;

  nextState.cashoutRequests[requestIndex] = {
    ...nextRequest,
    status: input.nextStatus,
    processedAt,
    metadata
  };

  const existingCashoutTransaction = nextState.transactions.find(
    (transaction) =>
      transaction.sourceType === "cashout_request"
      && transaction.sourceId === request.id
      && transaction.status === "cashed_out"
  );

  if (input.nextStatus === "paid" && !existingCashoutTransaction) {
    nextState.transactions.unshift(buildCashoutTransaction(request, input.payoutReference ?? `cashout-payout-${request.id}`));
  }

  if (input.nextStatus === "reversed" && existingCashoutTransaction) {
    const transactionIndex = nextState.transactions.findIndex((transaction) => transaction.id === existingCashoutTransaction.id);
    nextState.transactions[transactionIndex] = {
      ...nextState.transactions[transactionIndex],
      status: "reversed",
      reversedAt: new Date().toISOString(),
      metadata: {
        ...nextState.transactions[transactionIndex].metadata,
        reversalReason: input.note ?? "cashout_reversed"
      }
    };
    nextState.transactions.unshift(buildCashoutReversalTransaction(request, input.payoutReference ?? null));
  }

  return syncPointsBalances(nextState);
}

async function resolveSupabaseUserLabels(supabase: SupabaseClient, ids: string[]) {
  if (!ids.length) {
    return new Map<string, string>();
  }

  const result = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);

  if (result.error) {
    return new Map<string, string>();
  }

  return new Map(
    (result.data ?? []).map((row) => [
      row.id as string,
      (row.full_name as string | null) ?? (row.email as string)
    ])
  );
}

async function resolvePayoutTarget(request: CashoutRequestRecord) {
  if (!isSupabaseEnabled()) {
    return {
      mode: "manual",
      label: "Manual cash-out review"
    } satisfies PayoutTarget;
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase || request.role !== "barber") {
    return {
      mode: "manual",
      label: "Manual cash-out review"
    } satisfies PayoutTarget;
  }

  const barberResult = await supabase
    .from("barbers")
    .select("id")
    .eq("profile_id", request.userId)
    .maybeSingle();

  if (barberResult.error || !barberResult.data) {
    return {
      mode: "manual",
      label: "Manual cash-out review"
    } satisfies PayoutTarget;
  }

  const accountResult = await supabase
    .from("connected_accounts")
    .select("provider_account_id, payout_readiness_status")
    .eq("subject_type", "barber")
    .eq("barber_id", barberResult.data.id)
    .maybeSingle();

  if (accountResult.error || !accountResult.data || accountResult.data.payout_readiness_status !== "ready") {
    return {
      mode: "manual",
      label: "Manual cash-out review"
    } satisfies PayoutTarget;
  }

  return {
    mode: "stripe_connect",
    providerAccountId: accountResult.data.provider_account_id,
    label: "Stripe Connect payout"
  } satisfies PayoutTarget;
}

function canReview(status: CashoutRequestRecord["status"]) {
  return status === "requested";
}

function canApprove(status: CashoutRequestRecord["status"]) {
  return status === "requested" || status === "under_review";
}

function canReject(status: CashoutRequestRecord["status"]) {
  return status === "requested" || status === "under_review" || status === "approved";
}

function canMarkPaid(status: CashoutRequestRecord["status"]) {
  return status === "approved" || status === "failed";
}

function canMarkFailed(status: CashoutRequestRecord["status"]) {
  return status === "approved";
}

function canReverse(status: CashoutRequestRecord["status"]) {
  return status === "approved" || status === "paid" || status === "failed";
}

function mapRequestView(
  request: CashoutRequestRecord & { role: "barber" | "owner" },
  label: string
): CashoutReviewEntryView {
  const metadata = request.metadata ?? {};
  const auditLog = Array.isArray(metadata.auditLog) ? metadata.auditLog : [];
  return {
    requestId: request.id,
    userId: request.userId,
    role: request.role,
    userLabel: label,
    pointsRequested: request.pointsRequested,
    cashValue: request.cashValue,
    status: request.status,
    createdAt: request.createdAt,
    processedAt: request.processedAt ?? null,
    fraudFlags: getFraudFlags(request),
    reviewNote: typeof metadata.reviewNote === "string" ? metadata.reviewNote : null,
    payoutReference: typeof metadata.payoutReference === "string" ? metadata.payoutReference : null,
    failureReason: typeof metadata.failureReason === "string" ? metadata.failureReason : null,
    auditLog: auditLog.map((entry) => ({
      actorUserId: typeof entry.actorUserId === "string" ? entry.actorUserId : "system",
      actorRole: typeof entry.actorRole === "string" ? entry.actorRole : "system",
      action: typeof entry.action === "string" ? entry.action : "unknown",
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : request.createdAt,
      note: typeof entry.note === "string" ? entry.note : undefined,
      metadata: typeof entry.metadata === "object" && entry.metadata !== null ? entry.metadata as Record<string, unknown> : {}
    })),
    canReview: canReview(request.status),
    canApprove: canApprove(request.status),
    canReject: canReject(request.status),
    canMarkPaid: canMarkPaid(request.status),
    canMarkFailed: canMarkFailed(request.status),
    canReverse: canReverse(request.status)
  };
}

export async function readCashoutReviewQueue(): Promise<CashoutReviewQueueView> {
  const state = await readPointsStateSnapshot();
  const queueRequests = state.cashoutRequests
    .filter((request): request is CashoutRequestRecord & { role: "barber" | "owner" } => request.role === "barber" || request.role === "owner")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const labels = new Map<string, string>();

  for (const user of demoUsers) {
    labels.set(user.id, user.name);
  }

  if (isSupabaseEnabled()) {
    const supabase = createSupabaseAdminClient();
    if (supabase) {
      const supabaseLabels = await resolveSupabaseUserLabels(
        supabase,
        Array.from(new Set(queueRequests.map((request) => request.userId)))
      );
      supabaseLabels.forEach((value, key) => labels.set(key, value));
    }
  }

  return {
    summary: {
      requested: queueRequests.filter((request) => request.status === "requested").length,
      underReview: queueRequests.filter((request) => request.status === "under_review").length,
      approved: queueRequests.filter((request) => request.status === "approved").length,
      paid: queueRequests.filter((request) => request.status === "paid").length,
      failed: queueRequests.filter((request) => request.status === "failed").length,
      rejected: queueRequests.filter((request) => request.status === "rejected").length,
      reversed: queueRequests.filter((request) => request.status === "reversed").length
    },
    requests: queueRequests.map((request) => mapRequestView(request, labels.get(request.userId) ?? request.userId))
  };
}

async function persistTransition(input: CashoutReviewTransitionInput) {
  const state = await readPointsStateSnapshot();
  const nextState = transitionCashoutRequestInState(state, input);
  await writePointsStateSnapshot(nextState);
  return nextState.cashoutRequests.find((request) => request.id === input.requestId) ?? null;
}

export async function markCashoutRequestUnderReview(input: {
  requestId: string;
  actorUserId: string;
  actorRole: UserAccount["role"];
  note?: string;
  fraudFlags?: string[];
}) {
  const request = await persistTransition({
    requestId: input.requestId,
    nextStatus: "under_review",
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    note: input.note,
    fraudFlags: input.fraudFlags
  });
  if (!request) {
    throw new Error("Cash-out request not found after review.");
  }
  return request;
}

export async function approveCashoutRequest(input: {
  requestId: string;
  actorUserId: string;
  actorRole: UserAccount["role"];
  note?: string;
}) {
  const state = await readPointsStateSnapshot();
  const request = state.cashoutRequests.find((entry) => entry.id === input.requestId);
  if (!request) {
    throw new Error("Cash-out request not found.");
  }
  const payoutTarget = await resolvePayoutTarget(request);
  const nextState = transitionCashoutRequestInState(state, {
    requestId: input.requestId,
    nextStatus: "approved",
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    note: input.note,
    payoutReference: payoutTarget.providerAccountId ?? payoutTarget.label
  });
  const requestIndex = nextState.cashoutRequests.findIndex((entry) => entry.id === input.requestId);
  nextState.cashoutRequests[requestIndex].metadata = {
    ...nextState.cashoutRequests[requestIndex].metadata,
    payoutTarget
  };
  await writePointsStateSnapshot(nextState);
  return nextState.cashoutRequests[requestIndex];
}

export async function rejectCashoutRequest(input: {
  requestId: string;
  actorUserId: string;
  actorRole: UserAccount["role"];
  note?: string;
  fraudFlags?: string[];
}) {
  const request = await persistTransition({
    requestId: input.requestId,
    nextStatus: "rejected",
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    note: input.note,
    fraudFlags: input.fraudFlags
  });
  if (!request) {
    throw new Error("Cash-out request not found after rejection.");
  }
  return request;
}

export async function markCashoutRequestPaid(input: {
  requestId: string;
  actorUserId: string;
  actorRole: UserAccount["role"];
  note?: string;
  payoutReference?: string;
}) {
  const request = await persistTransition({
    requestId: input.requestId,
    nextStatus: "paid",
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    note: input.note,
    payoutReference: input.payoutReference
  });
  if (!request) {
    throw new Error("Cash-out request not found after payout completion.");
  }
  return request;
}

export async function markCashoutRequestFailed(input: {
  requestId: string;
  actorUserId: string;
  actorRole: UserAccount["role"];
  note?: string;
  payoutReference?: string;
  fraudFlags?: string[];
}) {
  const request = await persistTransition({
    requestId: input.requestId,
    nextStatus: "failed",
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    note: input.note,
    payoutReference: input.payoutReference,
    fraudFlags: input.fraudFlags
  });
  if (!request) {
    throw new Error("Cash-out request not found after failure handling.");
  }
  return request;
}

export async function reverseCashoutRequest(input: {
  requestId: string;
  actorUserId: string;
  actorRole: UserAccount["role"];
  note?: string;
  payoutReference?: string;
}) {
  const request = await persistTransition({
    requestId: input.requestId,
    nextStatus: "reversed",
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    note: input.note,
    payoutReference: input.payoutReference
  });
  if (!request) {
    throw new Error("Cash-out request not found after reversal.");
  }
  return request;
}

export async function processApprovedCashoutQueue() {
  const queue = await readCashoutReviewQueue();
  return {
    processed: queue.requests.filter((request) => request.status === "approved").length,
    readyForPayout: queue.requests.filter((request) => request.status === "approved"),
    failed: queue.requests.filter((request) => request.status === "failed"),
    queue
  };
}

export async function readUserCashoutRequests(input: { userId: string; role: "barber" | "owner" }) {
  const queue = await readCashoutReviewQueue();
  return queue.requests.filter((request) => request.userId === input.userId && request.role === input.role);
}

export function getReservedCashoutSummary(state: PointsState, input: { userId: string; role: "barber" | "owner" }) {
  return computeBalance(state, input.userId, input.role);
}
