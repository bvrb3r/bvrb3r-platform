import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { FintechServiceError } from "@/lib/fintech/service";

const {
  getSessionUserMock,
  getBarberFintechReadinessMock,
  recordLegalAcceptanceMock,
  listFintechManagementPayloadMock,
  updateMembershipCompensationMock,
  updateConnectedAccountStatusMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getBarberFintechReadinessMock: vi.fn(),
  recordLegalAcceptanceMock: vi.fn(),
  listFintechManagementPayloadMock: vi.fn(),
  updateMembershipCompensationMock: vi.fn(),
  updateConnectedAccountStatusMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/fintech/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fintech/service")>("@/lib/fintech/service");
  return {
    ...actual,
    getBarberFintechReadiness: getBarberFintechReadinessMock,
    recordLegalAcceptance: recordLegalAcceptanceMock,
    listFintechManagementPayload: listFintechManagementPayloadMock,
    updateMembershipCompensation: updateMembershipCompensationMock,
    updateConnectedAccountStatus: updateConnectedAccountStatusMock
  };
});

import { GET as getFintechReadiness } from "@/app/api/fintech/readiness/route";
import { POST as postLegalAcceptance } from "@/app/api/fintech/legal-acceptance/route";
import { GET as getFintechManagement } from "@/app/api/operations/fintech/route";
import { POST as postCompensation } from "@/app/api/operations/fintech/memberships/[id]/compensation/route";
import { POST as postConnectedAccountStatus } from "@/app/api/operations/fintech/accounts/[id]/status/route";

describe("phase 13 fintech routes", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    getBarberFintechReadinessMock.mockReset();
    recordLegalAcceptanceMock.mockReset();
    listFintechManagementPayloadMock.mockReset();
    updateMembershipCompensationMock.mockReset();
    updateConnectedAccountStatusMock.mockReset();
  });

  it("returns barber payout readiness for an authenticated barber", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));
    getBarberFintechReadinessMock.mockResolvedValue({
      barberId: "barber-blaze",
      barberName: "Blaze King",
      connectedAccount: {
        id: "acct-barber",
        subjectType: "barber",
        provider: "stripe_connect",
        providerAccountId: null,
        onboardingStatus: "pending",
        payoutReadinessStatus: "needs_attention",
        legalReadinessStatus: "pending",
        taxReadinessStatus: "pending",
        chargesEnabled: false,
        payoutsEnabled: false,
        requirementsCurrentlyDue: ["identity_document"],
        requirementsEventuallyDue: [],
        requirementsPastDue: [],
        missingAgreements: ["barber_agreement"],
        outdatedAgreements: [],
        missingSteps: ["Legal acceptance missing: barber agreement"],
        disabledReason: null,
        lastCheckedAt: null,
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:00:00.000Z"
      },
      agreements: [],
      memberships: [],
      routingSummary: {
        blockedPaymentsCount: 1,
        pendingPaymentsCount: 0,
        readyForPayoutAmount: 0,
        blockedReasons: ["Barber payout readiness is incomplete."]
      },
      blockedPayments: []
    });

    const response = await getFintechReadiness();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.barberId).toBe("barber-blaze");
    expect(body.connectedAccount.payoutReadinessStatus).toBe("needs_attention");
  });

  it("rejects invalid legal acceptance payloads", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));
    const request = new NextRequest("https://bvrb3r.demo/api/fintech/legal-acceptance", {
      method: "POST",
      body: JSON.stringify({ agreementType: "not-real" })
    });

    const response = await postLegalAcceptance(request);
    expect(response.status).toBe(400);
  });

  it("records a legal acceptance with a stable response shape", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("blaze@bvrb3r.demo"));
    recordLegalAcceptanceMock.mockResolvedValue({
      acceptance: {
        agreementType: "barber_agreement",
        agreementVersion: "2026-03",
        acceptedAt: "2026-03-20T10:10:00.000Z"
      },
      accounts: []
    });

    const request = new NextRequest("https://bvrb3r.demo/api/fintech/legal-acceptance", {
      method: "POST",
      body: JSON.stringify({ agreementType: "barber_agreement" })
    });

    const response = await postLegalAcceptance(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.acceptance.agreementType).toBe("barber_agreement");
  });

  it("returns the management fintech workspace payload", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    listFintechManagementPayloadMock.mockResolvedValue({
      summary: {
        totalAccounts: 2,
        readyAccounts: 1,
        blockedAccounts: 0,
        needsAttentionAccounts: 1,
        notReadyAccounts: 0,
        blockedRoutingRecords: 1,
        readyForPayoutAmount: 55
      },
      shops: [],
      barbers: [],
      memberships: [],
      blockedPayments: []
    });

    const response = await getFintechManagement();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.totalAccounts).toBe(2);
  });

  it("rejects invalid compensation payloads", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    const request = new NextRequest("https://bvrb3r.demo/api/operations/fintech/memberships/mem-1/compensation", {
      method: "POST",
      body: JSON.stringify({ routingModel: "unknown" })
    });

    const response = await postCompensation(request, {
      params: Promise.resolve({ id: "mem-1" })
    });

    expect(response.status).toBe(400);
  });

  it("propagates scoped compensation errors", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("manager@bvrb3r.demo"));
    updateMembershipCompensationMock.mockRejectedValue(new FintechServiceError("This compensation assignment is outside the viewer's shop scope.", 403));

    const response = await postCompensation(new NextRequest("https://bvrb3r.demo/api/operations/fintech/memberships/mem-1/compensation", {
      method: "POST",
      body: JSON.stringify({ routingModel: "commission", commissionRate: 0.5 })
    }), {
      params: Promise.resolve({ id: "mem-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/shop scope/i);
  });

  it("rejects invalid connected account payloads", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    const request = new NextRequest("https://bvrb3r.demo/api/operations/fintech/accounts/acct-1/status", {
      method: "POST",
      body: JSON.stringify({ onboardingStatus: "ready" })
    });

    const response = await postConnectedAccountStatus(request, {
      params: Promise.resolve({ id: "acct-1" })
    });

    expect(response.status).toBe(400);
  });

  it("updates connected account status with a stable response shape", async () => {
    getSessionUserMock.mockResolvedValue(resolveDemoUser("owner@bvrb3r.demo"));
    updateConnectedAccountStatusMock.mockResolvedValue({
      account: {
        id: "acct-1",
        subjectType: "shop",
        provider: "stripe_connect",
        providerAccountId: "acct_123",
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
        lastCheckedAt: "2026-03-20T10:30:00.000Z",
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:30:00.000Z"
      }
    });

    const response = await postConnectedAccountStatus(new NextRequest("https://bvrb3r.demo/api/operations/fintech/accounts/acct-1/status", {
      method: "POST",
      body: JSON.stringify({
        onboardingStatus: "verified",
        taxReadinessStatus: "verified",
        chargesEnabled: true,
        payoutsEnabled: true
      })
    }), {
      params: Promise.resolve({ id: "acct-1" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.account.payoutReadinessStatus).toBe("ready");
  });
});
