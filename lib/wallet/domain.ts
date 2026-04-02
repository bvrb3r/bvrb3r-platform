import { roundCurrency } from "@/lib/fintech/domain";
import type {
  BoothRentStatusView,
  WalletBalanceView,
  WalletSubjectType,
  WalletTransactionType,
  WalletTransactionView
} from "@/types/wallet";

export const INSTANT_PAYOUT_FEE_RATE = 0.015;

export type WalletLedgerSeed = {
  id: string;
  subjectType: WalletSubjectType;
  subjectId: string;
  transactionType: WalletTransactionType;
  pendingDelta: number;
  availableDelta: number;
  currency?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
};

export type WalletServiceEscrowInput = {
  subjectType: WalletSubjectType;
  subjectId: string;
  baseAmount: number;
  currentAmount: number;
  isCompleted: boolean;
  netPaidOut: number;
  currency?: string;
  transactionIds: {
    capture: string;
    completion: string;
    adjustment: string;
    payout: string;
  };
};

function normalizeSeed(seed: WalletLedgerSeed): WalletTransactionView {
  const now = new Date().toISOString();
  return {
    id: seed.id,
    subjectType: seed.subjectType,
    subjectId: seed.subjectId,
    transactionType: seed.transactionType,
    pendingDelta: roundCurrency(seed.pendingDelta),
    availableDelta: roundCurrency(seed.availableDelta),
    currency: (seed.currency ?? "usd").toLowerCase(),
    createdAt: seed.createdAt ?? now,
    updatedAt: seed.updatedAt ?? now,
    metadata: seed.metadata ?? {}
  };
}

export function buildWalletServiceEscrowEntries(input: WalletServiceEscrowInput) {
  const baseAmount = roundCurrency(Math.max(input.baseAmount, 0));
  const currentAmount = roundCurrency(Math.max(input.currentAmount, 0));
  const adjustmentDelta = roundCurrency(currentAmount - baseAmount);
  const netPaidOut = roundCurrency(Math.max(input.netPaidOut, 0));
  const isCompleted = Boolean(input.isCompleted);

  const capture = normalizeSeed({
    id: input.transactionIds.capture,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    transactionType: "payment_pending_credit",
    pendingDelta: baseAmount,
    availableDelta: 0,
    currency: input.currency,
    metadata: {
      stage: "captured"
    }
  });

  const completion = normalizeSeed({
    id: input.transactionIds.completion,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    transactionType: "payment_completion_release",
    pendingDelta: isCompleted ? -baseAmount : 0,
    availableDelta: isCompleted ? baseAmount : 0,
    currency: input.currency,
    metadata: {
      stage: "completed"
    }
  });

  const adjustment = normalizeSeed({
    id: input.transactionIds.adjustment,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    transactionType: "payment_adjustment",
    pendingDelta: !isCompleted ? adjustmentDelta : 0,
    availableDelta: isCompleted ? adjustmentDelta : 0,
    currency: input.currency,
    metadata: {
      currentAmount
    }
  });

  const payout = normalizeSeed({
    id: input.transactionIds.payout,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    transactionType: "payout_debit",
    pendingDelta: 0,
    availableDelta: -netPaidOut,
    currency: input.currency,
    metadata: {
      netPaidOut
    }
  });

  return {
    capture,
    completion,
    adjustment,
    payout
  };
}

export function summarizeWalletBalances(transactions: WalletTransactionView[]) {
  return transactions.reduce<Record<string, WalletBalanceView>>((accumulator, transaction) => {
    const key = `${transaction.subjectType}:${transaction.subjectId}:${transaction.currency}`;
    const current = accumulator[key] ?? {
      subjectType: transaction.subjectType,
      subjectId: transaction.subjectId,
      currency: transaction.currency,
      pendingBalance: 0,
      availableBalance: 0,
      updatedAt: null
    };

    current.pendingBalance = roundCurrency(current.pendingBalance + transaction.pendingDelta);
    current.availableBalance = roundCurrency(current.availableBalance + transaction.availableDelta);
    current.updatedAt = transaction.updatedAt;
    accumulator[key] = current;
    return accumulator;
  }, {});
}

export function calculateInstantPayoutAmounts(input: {
  grossAmount: number;
  speed?: "standard" | "instant";
  instantFeeRate?: number;
}) {
  const grossAmount = roundCurrency(Math.max(input.grossAmount, 0));
  const speed = input.speed ?? "standard";
  const instantFeeRate = input.instantFeeRate ?? INSTANT_PAYOUT_FEE_RATE;
  const instantFeeAmount = speed === "instant"
    ? roundCurrency(grossAmount * instantFeeRate)
    : 0;
  const netTransferAmount = roundCurrency(Math.max(grossAmount - instantFeeAmount, 0));

  return {
    speed,
    grossAmount,
    instantFeeAmount,
    netTransferAmount
  };
}

export function resolveBoothRentCollection(input: {
  amountDue: number;
  availableBalance: number;
  frequency: "weekly" | "monthly" | null;
  periodLabel?: string | null;
  dueDate?: string | null;
  lastAttemptedAt?: string | null;
}) {
  const amountDue = roundCurrency(Math.max(input.amountDue, 0));
  const availableBalance = roundCurrency(input.availableBalance);

  if (!(amountDue > 0) || !input.frequency) {
    return {
      amount: amountDue,
      frequency: input.frequency,
      status: "not_applicable",
      periodLabel: input.periodLabel ?? null,
      dueDate: input.dueDate ?? null,
      paidDate: null,
      overdueAmount: 0,
      lastAttemptedAt: input.lastAttemptedAt ?? null,
      debitAmount: 0
    } satisfies BoothRentStatusView & { debitAmount: number };
  }

  const canCollect = availableBalance >= amountDue;
  return {
    amount: amountDue,
    frequency: input.frequency,
    status: canCollect ? "paid" : "overdue",
    periodLabel: input.periodLabel ?? null,
    dueDate: input.dueDate ?? null,
    paidDate: canCollect ? new Date().toISOString() : null,
    overdueAmount: canCollect ? 0 : amountDue,
    lastAttemptedAt: input.lastAttemptedAt ?? new Date().toISOString(),
    debitAmount: canCollect ? amountDue : 0
  } satisfies BoothRentStatusView & { debitAmount: number };
}
