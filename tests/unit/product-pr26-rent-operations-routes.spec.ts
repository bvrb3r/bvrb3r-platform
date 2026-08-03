import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionUserMock,
  getRentWorkspacePayloadMock,
  setRentAutopayMock,
  requestRentPaymentMock,
  disputeRentLineMock,
  applyRentRelationshipLifecycleMock,
  exportRentStatementMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getRentWorkspacePayloadMock: vi.fn(),
  setRentAutopayMock: vi.fn(),
  requestRentPaymentMock: vi.fn(),
  disputeRentLineMock: vi.fn(),
  applyRentRelationshipLifecycleMock: vi.fn(),
  exportRentStatementMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/rent/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/rent/service")>();
  return {
    ...original,
    getRentWorkspacePayload: getRentWorkspacePayloadMock,
    setRentAutopay: setRentAutopayMock,
    requestRentPayment: requestRentPaymentMock,
    disputeRentLine: disputeRentLineMock,
    applyRentRelationshipLifecycle: applyRentRelationshipLifecycleMock,
    exportRentStatement: exportRentStatementMock
  };
});

import { PATCH as patchAutopay } from "@/app/api/rent/preferences/route";
import { POST as payRent } from "@/app/api/rent/obligations/[obligationId]/pay/route";
import { POST as disputeLine } from "@/app/api/rent/contributions/[contributionId]/dispute/route";
import { POST as changeLifecycle } from "@/app/api/rent/relationships/[relationshipId]/lifecycle/route";
import { GET as exportStatement } from "@/app/api/rent/statements/[obligationId]/export/route";

const UUID = "11111111-1111-4111-8111-111111111111";

function request(url: string, method: "POST" | "PATCH", body: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("Product PR26 rent operation routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    getRentWorkspacePayloadMock.mockReset();
    setRentAutopayMock.mockReset();
    requestRentPaymentMock.mockReset();
    disputeRentLineMock.mockReset();
    applyRentRelationshipLifecycleMock.mockReset();
    exportRentStatementMock.mockReset();
    getSessionUserMock.mockResolvedValue({ id: UUID, role: "barber_user" });
    getRentWorkspacePayloadMock.mockResolvedValue({ viewer: "barber" });
  });

  it("changes AutoPay through the barber-owned RPC", async () => {
    setRentAutopayMock.mockResolvedValue({ enabled: true });
    const response = await patchAutopay(request(
      "https://example.test/api/rent/preferences",
      "PATCH",
      {
        agreementId: UUID,
        enabled: true,
        paymentMethodReference: "pm_saved_1"
      }
    ));

    expect(response.status).toBe(200);
    expect(setRentAutopayMock).toHaveBeenCalledWith({
      agreementId: UUID,
      enabled: true,
      paymentMethodReference: "pm_saved_1"
    });
  });

  it("creates an idempotent pending payment request without claiming settlement", async () => {
    requestRentPaymentMock.mockResolvedValue({ id: UUID, status: "pending" });
    const response = await payRent(
      request("https://example.test/api/rent/obligations/id/pay", "POST", {
        rail: "cash",
        amountCents: 14_260,
        idempotencyKey: "rent-pay-20260729"
      }),
      { params: Promise.resolve({ obligationId: UUID }) }
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      paymentRequest: { status: "pending" }
    });
  });

  it("blocks an owner from paying or disputing a barber line", async () => {
    getRentWorkspacePayloadMock.mockResolvedValue({ viewer: "owner" });

    const paymentResponse = await payRent(
      request("https://example.test/api/rent/obligations/id/pay", "POST", {
        rail: "card",
        amountCents: 1_000,
        idempotencyKey: "owner-pay-denied"
      }),
      { params: Promise.resolve({ obligationId: UUID }) }
    );
    const disputeResponse = await disputeLine(
      request("https://example.test/api/rent/contributions/id/dispute", "POST", {
        reason: "Incorrect line",
        evidenceReference: "case-1"
      }),
      { params: Promise.resolve({ contributionId: UUID }) }
    );

    expect(paymentResponse.status).toBe(403);
    expect(disputeResponse.status).toBe(403);
    expect(requestRentPaymentMock).not.toHaveBeenCalled();
    expect(disputeRentLineMock).not.toHaveBeenCalled();
  });

  it("routes settle-first lifecycle transitions to the database command", async () => {
    applyRentRelationshipLifecycleMock.mockResolvedValue({ status: "applied" });
    const response = await changeLifecycle(
      request("https://example.test/api/rent/relationships/id/lifecycle", "POST", {
        type: "leave",
        reason: "Moving to another city",
        effectiveAt: "2026-08-03T00:00:00.000Z",
        idempotencyKey: "leave-relationship-1"
      }),
      { params: Promise.resolve({ relationshipId: UUID }) }
    );

    expect(response.status).toBe(200);
    expect(applyRentRelationshipLifecycleMock).toHaveBeenCalledWith({
      relationshipId: UUID,
      type: "leave",
      reason: "Moving to another city",
      effectiveAt: "2026-08-03T00:00:00.000Z",
      idempotencyKey: "leave-relationship-1",
      proposedTerms: {}
    });
  });

  it("returns a private canonical statement export", async () => {
    exportRentStatementMock.mockResolvedValue({
      body: "Line ID,Applied cents\r\nline-1,100\r\n",
      contentType: "text/csv; charset=utf-8",
      extension: "csv"
    });
    const response = await exportStatement(
      new Request(`https://example.test/api/rent/statements/${UUID}/export?format=csv`),
      { params: Promise.resolve({ obligationId: UUID }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toContain(".csv");
  });
});
