import { describe, expect, it } from "vitest";
import {
  buildWalletServiceEscrowEntries,
  calculateInstantPayoutAmounts,
  resolveBoothRentCollection,
  summarizeWalletBalances
} from "@/lib/wallet/domain";

function summarize(entries: ReturnType<typeof buildWalletServiceEscrowEntries>) {
  return summarizeWalletBalances([
    entries.capture,
    entries.completion,
    entries.adjustment,
    entries.payout
  ])["barber:barber-1:usd"];
}

describe("wallet domain", () => {
  it("keeps captured service funds pending until the appointment completes", () => {
    const entries = buildWalletServiceEscrowEntries({
      subjectType: "barber",
      subjectId: "barber-1",
      baseAmount: 38,
      currentAmount: 38,
      isCompleted: false,
      netPaidOut: 0,
      transactionIds: {
        capture: "capture",
        completion: "completion",
        adjustment: "adjustment",
        payout: "payout"
      }
    });

    expect(summarize(entries)).toMatchObject({
      pendingBalance: 38,
      availableBalance: 0
    });
  });

  it("moves funds from pending to available only after completion", () => {
    const entries = buildWalletServiceEscrowEntries({
      subjectType: "barber",
      subjectId: "barber-1",
      baseAmount: 38,
      currentAmount: 38,
      isCompleted: true,
      netPaidOut: 0,
      transactionIds: {
        capture: "capture",
        completion: "completion",
        adjustment: "adjustment",
        payout: "payout"
      }
    });

    expect(summarize(entries)).toMatchObject({
      pendingBalance: 0,
      availableBalance: 38
    });
  });

  it("reconciles a refund after payout without ledger drift", () => {
    const entries = buildWalletServiceEscrowEntries({
      subjectType: "barber",
      subjectId: "barber-1",
      baseAmount: 38,
      currentAmount: 0,
      isCompleted: true,
      netPaidOut: 38,
      transactionIds: {
        capture: "capture",
        completion: "completion",
        adjustment: "adjustment",
        payout: "payout"
      }
    });

    expect(summarize(entries)).toMatchObject({
      pendingBalance: 0,
      availableBalance: -38
    });
  });

  it("applies instant payout fees while leaving standard payouts free", () => {
    expect(calculateInstantPayoutAmounts({
      grossAmount: 100,
      speed: "standard"
    })).toEqual({
      speed: "standard",
      grossAmount: 100,
      instantFeeAmount: 0,
      netTransferAmount: 100
    });

    expect(calculateInstantPayoutAmounts({
      grossAmount: 100,
      speed: "instant"
    })).toEqual({
      speed: "instant",
      grossAmount: 100,
      instantFeeAmount: 1.5,
      netTransferAmount: 98.5
    });
  });

  it("marks booth rent overdue without corrupting balances when funds are short", () => {
    expect(resolveBoothRentCollection({
      amountDue: 35,
      availableBalance: 12,
      frequency: "weekly",
      periodLabel: "2026-W13",
      dueDate: "2026-03-29T23:59:59.000Z"
    })).toMatchObject({
      status: "overdue",
      overdueAmount: 35,
      debitAmount: 0
    });

    expect(resolveBoothRentCollection({
      amountDue: 35,
      availableBalance: 50,
      frequency: "weekly",
      periodLabel: "2026-W13",
      dueDate: "2026-03-29T23:59:59.000Z"
    })).toMatchObject({
      status: "paid",
      overdueAmount: 0,
      debitAmount: 35
    });
  });
});
