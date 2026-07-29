import { describe, expect, it } from "vitest";
import {
  assertSettleFirst,
  buildRentStatement,
  buildRentStatementCsv,
  buildRentStatementPdf,
  evaluateAutoBoothGates,
  resolveNextRentEffectiveAt,
  resolveRentExportDownloadState
} from "@/lib/rent/operations-domain";

describe("Product PR26 rent operations domain", () => {
  it("requires all five server-side AutoBooth gates", () => {
    const pass = evaluateAutoBoothGates({
      native_transaction: true,
      active_obligation: true,
      settled_payment: true,
      shop_enabled: true,
      barber_authorized: true
    });
    expect(pass).toMatchObject({ eligible: true, passedCount: 5, requiredCount: 5 });

    const blocked = evaluateAutoBoothGates({
      native_transaction: false,
      active_obligation: true,
      settled_payment: true,
      shop_enabled: true,
      barber_authorized: true
    });
    expect(blocked).toMatchObject({
      eligible: false,
      failed: ["native_transaction"]
    });
  });

  it("rejects pause, leave, or end until settled to zero server-side", () => {
    expect(() => assertSettleFirst({ remainingCents: 1 })).toThrow("settle to $0.00");
    expect(() => assertSettleFirst({ remainingCents: 0, pendingCents: 1 })).toThrow("settle to $0.00");
    expect(() => assertSettleFirst({ remainingCents: 0, heldCents: 1 })).toThrow("settle to $0.00");
    expect(() => assertSettleFirst({ remainingCents: 0, pendingCents: 0, heldCents: 0 })).not.toThrow();
  });

  it("keeps an agreement change out of the active rent period", () => {
    expect(() => resolveNextRentEffectiveAt({
      requestedAt: "2026-08-02T12:00:00.000Z",
      activePeriodEnd: "2026-08-02",
      now: new Date("2026-07-29T12:00:00.000Z")
    })).toThrow("period already in progress");

    expect(resolveNextRentEffectiveAt({
      requestedAt: "2026-08-03T00:00:00.000Z",
      activePeriodEnd: "2026-08-02",
      now: new Date("2026-07-29T12:00:00.000Z")
    })).toBe("2026-08-03T00:00:00.000Z");
  });

  it("holds one disputed line while other lines continue and the statement still foots", () => {
    const statement = buildRentStatement({
      obligationId: "obligation-1",
      periodStart: "2026-07-27",
      periodEnd: "2026-08-02",
      obligationCents: 35000,
      settledCents: 10000,
      remainingCents: 25000,
      lines: [
        {
          id: "line-settled",
          kind: "autobooth_card",
          state: "settled",
          appliedCents: 10000,
          createdAt: "2026-07-28T10:00:00.000Z",
          reference: "pi_1",
          disputed: false
        },
        {
          id: "line-held",
          kind: "autobooth_card",
          state: "held",
          appliedCents: 5200,
          createdAt: "2026-07-29T10:00:00.000Z",
          reference: "case_1",
          disputed: true
        },
        {
          id: "line-cash",
          kind: "autobooth_cash",
          state: "pending",
          appliedCents: 4000,
          createdAt: "2026-07-30T10:00:00.000Z",
          reference: null,
          disputed: false
        }
      ]
    });

    expect(statement).toMatchObject({
      lineSettledCents: 10000,
      heldCents: 5200,
      pendingCents: 4000,
      reconciliationDeltaCents: 0,
      reconciled: true
    });
  });

  it("exports the exact canonical statement as CSV and a valid PDF", () => {
    const statement = buildRentStatement({
      obligationId: "obligation-1",
      periodStart: "2026-07-27",
      periodEnd: "2026-08-02",
      obligationCents: 35000,
      settledCents: 35000,
      remainingCents: 0,
      lines: [{
        id: "line-1",
        kind: "manual_payment",
        state: "settled",
        appliedCents: 35000,
        createdAt: "2026-07-29T10:00:00.000Z",
        reference: "receipt,with-comma",
        disputed: false
      }]
    });

    const csv = buildRentStatementCsv(statement);
    expect(csv).toContain("Reconciliation delta cents,0");
    expect(csv).toContain('"receipt,with-comma"');

    const pdf = buildRentStatementPdf(statement);
    expect(new TextDecoder().decode(pdf.slice(0, 8))).toBe("%PDF-1.4");
    expect(new TextDecoder().decode(pdf)).toContain("Reconciliation delta $0.00");
  });

  it("implements all six download states", () => {
    const base = {
      requested: false,
      preparing: false,
      saved: false,
      authorized: true,
      statementReady: true,
      failed: false
    };
    expect(resolveRentExportDownloadState(base)).toBe("idle");
    expect(resolveRentExportDownloadState({ ...base, requested: true })).toBe("preparing");
    expect(resolveRentExportDownloadState({ ...base, saved: true })).toBe("saved");
    expect(resolveRentExportDownloadState({ ...base, statementReady: false })).toBe("not_ready");
    expect(resolveRentExportDownloadState({ ...base, authorized: false })).toBe("not_yours");
    expect(resolveRentExportDownloadState({ ...base, failed: true })).toBe("failed_retry");
  });
});
