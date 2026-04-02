export type WalletSubjectType = "barber" | "shop";

export type WalletTransactionType =
  | "payment_pending_credit"
  | "payment_completion_release"
  | "payment_adjustment"
  | "payout_debit"
  | "booth_rent_debit"
  | "booth_rent_credit";

export interface WalletBalanceView {
  subjectType: WalletSubjectType;
  subjectId: string;
  currency: string;
  pendingBalance: number;
  availableBalance: number;
  updatedAt: string | null;
}

export interface WalletTransactionView {
  id: string;
  subjectType: WalletSubjectType;
  subjectId: string;
  transactionType: WalletTransactionType;
  pendingDelta: number;
  availableDelta: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface BoothRentStatusView {
  amount: number;
  frequency: "weekly" | "monthly" | null;
  status: "paid" | "due" | "overdue" | "not_applicable";
  periodLabel: string | null;
  dueDate: string | null;
  paidDate: string | null;
  overdueAmount: number;
  lastAttemptedAt: string | null;
}
