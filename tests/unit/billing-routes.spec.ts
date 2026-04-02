import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getClientExperienceContextMock,
  readClientBillingHistoryMock,
  readClientBillingInvoicesMock,
  requestClientBillingRetryMock
} = vi.hoisted(() => ({
  getClientExperienceContextMock: vi.fn(),
  readClientBillingHistoryMock: vi.fn(),
  readClientBillingInvoicesMock: vi.fn(),
  requestClientBillingRetryMock: vi.fn()
}));

vi.mock("@/lib/client-experience/session", () => ({
  getClientExperienceContext: getClientExperienceContextMock
}));

vi.mock("@/lib/monetization/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/monetization/service")>("@/lib/monetization/service");
  return {
    ...actual,
    readClientBillingHistory: readClientBillingHistoryMock,
    readClientBillingInvoices: readClientBillingInvoicesMock,
    requestClientBillingRetry: requestClientBillingRetryMock
  };
});

import { GET as getBillingHistory } from "@/app/api/billing/history/route";
import { GET as getBillingInvoices } from "@/app/api/billing/invoices/route";
import { POST as postBillingRetry } from "@/app/api/billing/retry/route";
import { MonetizationServiceError } from "@/lib/monetization/service";

describe("billing routes", () => {
  beforeEach(() => {
    getClientExperienceContextMock.mockReset();
    readClientBillingHistoryMock.mockReset();
    readClientBillingInvoicesMock.mockReset();
    requestClientBillingRetryMock.mockReset();

    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        role: "client",
        email: "client@bvrb3r.demo",
        name: "Jordan Ellis",
        clientId: "client-jordan"
      },
      clientId: "client-jordan",
      activeClient: {
        name: "Jordan Ellis"
      },
      isSignedInClient: true
    });
  });

  it("blocks non-client billing access", async () => {
    getClientExperienceContextMock.mockResolvedValue({
      viewer: {
        role: "owner",
        email: "owner@bvrb3r.demo",
        name: "Owner"
      },
      clientId: null,
      activeClient: null,
      isSignedInClient: false
    });

    const response = await getBillingHistory();

    expect(response.status).toBe(403);
  });

  it("returns billing history and invoices for the signed-in client", async () => {
    readClientBillingHistoryMock.mockResolvedValue({
      subscription: {
        id: "subscription-client-jordan",
        subjectType: "client",
        subjectId: "client-jordan",
        displayName: "Jordan Ellis",
        provider: "stripe_billing",
        planCode: "client_core_monthly",
        planName: "Client Core",
        planInterval: "monthly",
        unitAmount: 19,
        currency: "usd",
        subscriptionStatus: "active",
        billingState: "current",
        entitlementStatus: "enabled",
        updatedAt: "2026-03-26T09:00:00.000Z"
      },
      invoices: [],
      history: [],
      recoveryInvoice: null
    });
    readClientBillingInvoicesMock.mockResolvedValue([
      {
        id: "invoice-1",
        subscriptionId: "subscription-client-jordan",
        providerInvoiceId: "in_123",
        status: "paid",
        amountDue: 19,
        amountPaid: 19,
        currency: "usd",
        invoiceCreatedAt: "2026-03-26T09:00:00.000Z",
        attemptCount: 1
      }
    ]);

    const [historyResponse, invoicesResponse] = await Promise.all([
      getBillingHistory(),
      getBillingInvoices()
    ]);
    const historyBody = await historyResponse.json();
    const invoicesBody = await invoicesResponse.json();

    expect(historyResponse.status).toBe(200);
    expect(invoicesResponse.status).toBe(200);
    expect(historyBody.billing.subscription.planName).toBe("Client Core");
    expect(invoicesBody.invoices[0].providerInvoiceId).toBe("in_123");
  });

  it("starts a client billing retry from canonical billing state", async () => {
    requestClientBillingRetryMock.mockResolvedValue({
      recoveryUrl: "https://billing.stripe.test/recovery",
      invoice: {
        id: "invoice-recovery",
        subscriptionId: "subscription-client-jordan",
        providerInvoiceId: "in_recovery",
        status: "past_due",
        amountDue: 19,
        amountPaid: 0,
        currency: "usd",
        invoiceCreatedAt: "2026-03-26T09:00:00.000Z",
        attemptCount: 2
      }
    });

    const response = await postBillingRetry();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requestClientBillingRetryMock).toHaveBeenCalledWith({
      user: {
        role: "client",
        email: "client@bvrb3r.demo",
        name: "Jordan Ellis",
        clientId: "client-jordan"
      }
    });
    expect(body.retry.recoveryUrl).toContain("billing.stripe.test");
  });

  it("returns safe monetization errors for billing recovery conflicts", async () => {
    requestClientBillingRetryMock.mockRejectedValue(
      new MonetizationServiceError("No failed invoice is available for billing recovery.", 409)
    );

    const response = await postBillingRetry();
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/failed invoice/i);
  });
});
