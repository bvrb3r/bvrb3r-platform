import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionUserMock,
  getRentWorkspacePayloadMock,
  createRentAgreementMock,
  settleCashContributionMock,
  getPublicQueueStatusMock,
  requireArchitectDebugAccessMock,
  readArchitectDebugEnvironmentMock,
  issueRentReleaseCertificateMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  getRentWorkspacePayloadMock: vi.fn(),
  createRentAgreementMock: vi.fn(),
  settleCashContributionMock: vi.fn(),
  getPublicQueueStatusMock: vi.fn(),
  requireArchitectDebugAccessMock: vi.fn(),
  readArchitectDebugEnvironmentMock: vi.fn(),
  issueRentReleaseCertificateMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/rent/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/rent/service")>();
  return {
    ...original,
    getRentWorkspacePayload: getRentWorkspacePayloadMock,
    createRentAgreement: createRentAgreementMock,
    settleCashContribution: settleCashContributionMock,
    getPublicQueueStatus: getPublicQueueStatusMock,
    issueRentReleaseCertificate: issueRentReleaseCertificateMock
  };
});

vi.mock("@/lib/architect/debug/guards", () => ({
  requireArchitectDebugAccess: requireArchitectDebugAccessMock
}));

vi.mock("@/lib/architect/debug/env", () => ({
  readArchitectDebugEnvironment: readArchitectDebugEnvironmentMock
}));

import { POST as createAgreement } from "@/app/api/rent/agreements/route";
import { POST as settleCash } from "@/app/api/rent/contributions/[contributionId]/settle-cash/route";
import { GET as getQueueStatus } from "@/app/api/queue/status/[token]/route";
import { POST as issueCertificate } from "@/app/api/architect/pr22-release/route";

const UUID = "11111111-1111-4111-8111-111111111111";

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("PR22 rent route authorization", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    getRentWorkspacePayloadMock.mockReset();
    createRentAgreementMock.mockReset();
    settleCashContributionMock.mockReset();
    getPublicQueueStatusMock.mockReset();
    requireArchitectDebugAccessMock.mockReset();
    readArchitectDebugEnvironmentMock.mockReset();
    issueRentReleaseCertificateMock.mockReset();
    getSessionUserMock.mockResolvedValue({ id: UUID, role: "barber_user" });
    requireArchitectDebugAccessMock.mockResolvedValue({
      ok: true,
      actor: { id: UUID, role: "platform_admin" }
    });
    readArchitectDebugEnvironmentMock.mockReturnValue({
      appEnv: "preview",
      commitHash: "a".repeat(40),
      deploymentId: "dpl_PR22Stage"
    });
  });

  it("denies a barber before a rent agreement mutation reaches the database", async () => {
    getRentWorkspacePayloadMock.mockResolvedValue({ viewer: "barber" });

    const response = await createAgreement(jsonRequest("https://example.test/api/rent/agreements", {
      relationshipId: UUID,
      model: "booth_rent",
      rentAmountCents: 26_000,
      billingFrequency: "weekly",
      autoBoothBasisPoints: 0,
      cashSettlementMethod: "manual_transfer_with_evidence",
      effectiveAt: "2026-08-01T12:00:00.000Z"
    }));

    expect(response.status).toBe(403);
    expect(createRentAgreementMock).not.toHaveBeenCalled();
  });

  it("rejects transaction funding on a Full Booth Rent agreement", async () => {
    getRentWorkspacePayloadMock.mockResolvedValue({ viewer: "owner" });

    const response = await createAgreement(jsonRequest("https://example.test/api/rent/agreements", {
      relationshipId: UUID,
      model: "booth_rent",
      rentAmountCents: 26_000,
      billingFrequency: "weekly",
      autoBoothBasisPoints: 4_000,
      cashSettlementMethod: "manual_transfer_with_evidence",
      effectiveAt: "2026-08-01T12:00:00.000Z"
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Full Booth Rent cannot apply transaction proceeds."
    });
    expect(createRentAgreementMock).not.toHaveBeenCalled();
  });

  it("denies barber cash settlement evidence before the RPC", async () => {
    getRentWorkspacePayloadMock.mockResolvedValue({ viewer: "barber" });

    const response = await settleCash(
      jsonRequest("https://example.test/api/rent/contributions/id/settle-cash", {
        evidenceReference: "bank-transfer-123"
      }),
      { params: Promise.resolve({ contributionId: UUID }) }
    );

    expect(response.status).toBe(403);
    expect(settleCashContributionMock).not.toHaveBeenCalled();
  });

  it("returns a private noindex 404 for an unknown public queue capability", async () => {
    getPublicQueueStatusMock.mockResolvedValue(null);

    const response = await getQueueStatus(
      new Request("https://example.test/api/queue/status/unknown"),
      { params: Promise.resolve({ token: "a".repeat(64) }) }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Queue status not found." });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("binds a release certificate to server-derived deployment evidence", async () => {
    issueRentReleaseCertificateMock.mockResolvedValue({
      id: UUID,
      commitSha: "a".repeat(40),
      deploymentId: "dpl_PR22Stage"
    });

    const response = await issueCertificate();

    expect(response.status).toBe(200);
    expect(issueRentReleaseCertificateMock).toHaveBeenCalledWith({
      commitSha: "a".repeat(40),
      deploymentId: "dpl_PR22Stage"
    });
  });

  it("fails closed when a deployment cannot be traced", async () => {
    readArchitectDebugEnvironmentMock.mockReturnValue({
      appEnv: "local",
      commitHash: null,
      deploymentId: null
    });

    const response = await issueCertificate();

    expect(response.status).toBe(409);
    expect(issueRentReleaseCertificateMock).not.toHaveBeenCalled();
  });
});
