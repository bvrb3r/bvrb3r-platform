import { beforeEach, describe, expect, it, vi } from "vitest";

const { sessionMock, changePlanMock, cancelMock, createPaymentMock, adminRpcMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  changePlanMock: vi.fn(),
  cancelMock: vi.fn(),
  createPaymentMock: vi.fn(),
  adminRpcMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUserFromServer: sessionMock }));
vi.mock("@/lib/billing/pr34-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/pr34-service")>("@/lib/billing/pr34-service");
  return {
    ...actual,
    changePr34Plan: changePlanMock,
    cancelPr34Subscription: cancelMock,
    createPr34BalancePayment: createPaymentMock
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ rpc: adminRpcMock })
}));

import { POST as postBalanceDispute } from "@/app/api/billing/balance/dispute/route";
import { POST as postBalancePayment } from "@/app/api/billing/balance/payment/route";
import { POST as postCancel } from "@/app/api/billing/cancel/route";
import { POST as postPlan } from "@/app/api/billing/plan/route";
import { Pr34BillingServiceError } from "@/lib/billing/pr34-service";

const user = {
  id: "profile-1",
  role: "client_user",
  email: "client@example.com",
  name: "Client One"
};

describe("Product PR34 billing routes", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    changePlanMock.mockReset();
    cancelMock.mockReset();
    createPaymentMock.mockReset();
    adminRpcMock.mockReset();
    adminRpcMock.mockResolvedValue({ data: { status: "disputed" }, error: null });
    sessionMock.mockResolvedValue({ authenticated: true, user });
  });

  it("binds plan changes to the authenticated user and explicit idempotency header", async () => {
    changePlanMock.mockResolvedValue({ outcome: "checkout", timing: "now", redirectUrl: "https://checkout.stripe.test", providerReference: "cs_123" });
    const request = new Request("https://bvrb3r.app/api/billing/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "plan:00000000-0000-4000-8000-000000000001" },
      body: JSON.stringify({ targetTier: "pro", billingInterval: "monthly", customerId: "cus_attacker" })
    });
    const response = await postPlan(request);

    expect(response.status).toBe(200);
    expect(changePlanMock).toHaveBeenCalledWith({
      user,
      targetTier: "pro",
      billingInterval: "monthly",
      idempotencyKey: "plan:00000000-0000-4000-8000-000000000001"
    });
    expect(JSON.stringify(changePlanMock.mock.calls[0])).not.toContain("cus_attacker");
  });

  it("returns HTTP 423 when owed-balance truth blocks cancel", async () => {
    cancelMock.mockRejectedValue(new Pr34BillingServiceError(
      "The account has an owed balance. cancel remains paused until the balance is $0.00.",
      423,
      "account_balance_locked"
    ));
    const response = await postCancel(new Request("https://bvrb3r.app/api/billing/cancel", {
      method: "POST",
      headers: { "Idempotency-Key": "cancel:00000000-0000-4000-8000-000000000001" }
    }));
    const body = await response.json();

    expect(response.status).toBe(423);
    expect(body).toMatchObject({ code: "account_balance_locked" });
    expect(response.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("does not create a Stripe balance payment for an unauthenticated request", async () => {
    sessionMock.mockResolvedValue({ authenticated: false, user: { ...user, id: "guest-user" } });
    const response = await postBalancePayment(new Request("https://bvrb3r.app/api/billing/balance/payment", {
      method: "POST",
      headers: { "Idempotency-Key": "balance:00000000-0000-4000-8000-000000000001" }
    }));

    expect(response.status).toBe(401);
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it("uses the signed-in database actor for a balance-line dispute", async () => {
    const response = await postBalanceDispute(new Request("https://bvrb3r.app/api/billing/balance/dispute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lineId: "00000000-0000-4000-8000-000000000001",
        reason: "This charge does not match the agreed service."
      })
    }));

    expect(response.status).toBe(200);
    expect(adminRpcMock).toHaveBeenCalledWith("pr34_dispute_balance_line", {
      p_line_id: "00000000-0000-4000-8000-000000000001",
      p_reason: "This charge does not match the agreed service."
    });
  });
});
