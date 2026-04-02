import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { FintechServiceError } from "@/lib/fintech/service";

const {
  getSessionUserMock,
  ensureStripeConnectSubjectAccountMock,
  createStripeConnectOnboardingSessionMock,
  createStripeConnectDashboardSessionMock,
  refreshStripeConnectSubjectAccountMock,
  processStripeConnectWebhookMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  ensureStripeConnectSubjectAccountMock: vi.fn(),
  createStripeConnectOnboardingSessionMock: vi.fn(),
  createStripeConnectDashboardSessionMock: vi.fn(),
  refreshStripeConnectSubjectAccountMock: vi.fn(),
  processStripeConnectWebhookMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/fintech/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fintech/service")>("@/lib/fintech/service");
  return {
    ...actual,
    ensureStripeConnectSubjectAccount: ensureStripeConnectSubjectAccountMock,
    createStripeConnectOnboardingSession: createStripeConnectOnboardingSessionMock,
    createStripeConnectDashboardSession: createStripeConnectDashboardSessionMock,
    refreshStripeConnectSubjectAccount: refreshStripeConnectSubjectAccountMock,
    processStripeConnectWebhook: processStripeConnectWebhookMock
  };
});

import { POST as postConnect } from "@/app/api/fintech/connect/route";
import { POST as postAccountLink } from "@/app/api/fintech/connect/account-link/route";
import { POST as postDashboardLink } from "@/app/api/fintech/connect/dashboard-link/route";
import { POST as postSync } from "@/app/api/fintech/connect/sync/route";
import { POST as postConnectWebhook } from "@/app/api/stripe/connect/webhook/route";
import { POST as postWebhook } from "@/app/api/stripe/webhook/route";

describe("phase 14 stripe connect routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    ensureStripeConnectSubjectAccountMock.mockReset();
    createStripeConnectOnboardingSessionMock.mockReset();
    createStripeConnectDashboardSessionMock.mockReset();
    refreshStripeConnectSubjectAccountMock.mockReset();
    processStripeConnectWebhookMock.mockReset();
  });

  it("creates or reuses a Stripe connected account through the connect route", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));
    ensureStripeConnectSubjectAccountMock.mockResolvedValue({
      account: {
        id: "acct-row-1",
        subjectType: "barber",
        provider: "stripe_connect",
        operationalStatus: "onboarding_required",
        providerAccountId: "acct_123",
        onboardingStatus: "invited",
        payoutReadinessStatus: "not_ready",
        legalReadinessStatus: "accepted",
        taxReadinessStatus: "pending",
        chargesEnabled: false,
        payoutsEnabled: false,
        requirementsCurrentlyDue: [],
        requirementsEventuallyDue: [],
        requirementsPastDue: [],
        missingAgreements: [],
        outdatedAgreements: [],
        missingSteps: ["Stripe onboarding has not started."],
        disabledReason: null,
        lastCheckedAt: null,
        onboardingStartedAt: null,
        onboardingCompletedAt: null,
        processorLastSyncedAt: null,
        processorLastEventId: null,
        processorLastEventType: null,
        dashboardLastAccessedAt: null,
        createdAt: "2026-03-20T11:00:00.000Z",
        updatedAt: "2026-03-20T11:00:00.000Z"
      }
    });

    const response = await postConnect(new NextRequest("https://bvrb3r.demo/api/fintech/connect", {
      method: "POST",
      body: JSON.stringify({})
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.account.providerAccountId).toBe("acct_123");
  });

  it("propagates onboarding auth errors cleanly", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("manager@bvrb3r.demo"));
    createStripeConnectOnboardingSessionMock.mockRejectedValue(
      new FintechServiceError("This shop is outside the viewer's scope.", 403)
    );

    const response = await postAccountLink(new NextRequest("https://bvrb3r.demo/api/fintech/connect/account-link", {
      method: "POST",
      body: JSON.stringify({ shopId: "shop-other" })
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/outside the viewer's scope/i);
  });

  it("returns a Stripe dashboard login link with a stable response shape", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    createStripeConnectDashboardSessionMock.mockResolvedValue({
      account: {
        id: "acct-row-shop",
        subjectType: "shop",
        provider: "stripe_connect",
        operationalStatus: "payout_ready",
        providerAccountId: "acct_shop",
        onboardingStatus: "verified",
        payoutReadinessStatus: "ready",
        legalReadinessStatus: "accepted",
        taxReadinessStatus: "verified",
        chargesEnabled: true,
        payoutsEnabled: true,
        requirementsCurrentlyDue: [],
        requirementsEventuallyDue: [],
        requirementsPastDue: [],
        missingAgreements: [],
        outdatedAgreements: [],
        missingSteps: [],
        disabledReason: null,
        lastCheckedAt: "2026-03-20T11:10:00.000Z",
        onboardingStartedAt: "2026-03-20T10:00:00.000Z",
        onboardingCompletedAt: "2026-03-20T10:20:00.000Z",
        processorLastSyncedAt: "2026-03-20T11:10:00.000Z",
        processorLastEventId: "evt_1",
        processorLastEventType: "account.updated",
        dashboardLastAccessedAt: "2026-03-20T11:10:00.000Z",
        createdAt: "2026-03-20T09:50:00.000Z",
        updatedAt: "2026-03-20T11:10:00.000Z"
      },
      url: "https://connect.stripe.com/express/acct_shop"
    });

    const response = await postDashboardLink(new NextRequest("https://bvrb3r.demo/api/fintech/connect/dashboard-link", {
      method: "POST",
      body: JSON.stringify({ shopId: "shop-1" })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toMatch(/^https:\/\/connect\.stripe\.com/);
  });

  it("rejects invalid sync payloads", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));

    const response = await postSync(new NextRequest("https://bvrb3r.demo/api/fintech/connect/sync", {
      method: "POST",
      body: JSON.stringify({ shopId: 123 })
    }));

    expect(response.status).toBe(400);
  });

  it("requires a Stripe signature on the webhook route", async () => {
    const response = await postWebhook(new NextRequest("https://bvrb3r.demo/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({ id: "evt_missing_sig" })
    }));

    expect(response.status).toBe(400);
  });

  it("returns duplicate-safe webhook results", async () => {
    processStripeConnectWebhookMock.mockResolvedValue({
      received: true,
      duplicate: true,
      status: "processed"
    });

    const response = await postWebhook(new NextRequest("https://bvrb3r.demo/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({ id: "evt_1" }),
      headers: { "stripe-signature": "test_signature" }
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.duplicate).toBe(true);
    expect(body.status).toBe("processed");
  });

  it("supports the dedicated Stripe Connect webhook route", async () => {
    processStripeConnectWebhookMock.mockResolvedValue({
      received: true,
      duplicate: false,
      status: "processed"
    });

    const response = await postConnectWebhook(new NextRequest("https://bvrb3r.demo/api/stripe/connect/webhook", {
      method: "POST",
      body: JSON.stringify({ id: "evt_connect_1" }),
      headers: { "stripe-signature": "test_signature" }
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("processed");
  });
});
