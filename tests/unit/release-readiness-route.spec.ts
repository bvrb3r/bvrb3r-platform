import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionUserMock,
  buildReleaseReadinessSummaryMock,
  buildMoneyTruthCertificationGateMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  buildReleaseReadinessSummaryMock: vi.fn(),
  buildMoneyTruthCertificationGateMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/release/readiness", () => ({
  buildReleaseReadinessSummary: buildReleaseReadinessSummaryMock
}));

vi.mock("@/lib/release/money-readiness.server", () => ({
  buildMoneyTruthCertificationGate: buildMoneyTruthCertificationGateMock
}));

import { GET } from "@/app/api/release/readiness/route";

describe("release readiness route", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    buildReleaseReadinessSummaryMock.mockReset();
    buildMoneyTruthCertificationGateMock.mockReset();
  });

  it("blocks public and shop roles from release certification", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-owner",
      role: "shop_owner_user",
      email: "owner@bvrb3r.demo",
      accountStatus: "active",
      locationIds: ["loc-ybor"]
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/protected Architect access/i);
    expect(buildMoneyTruthCertificationGateMock).not.toHaveBeenCalled();
  });

  it("returns certification only for a protected internal operator", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-architect",
      role: "client_user",
      email: "ops-admin@bvrb3r.app",
      accountStatus: "active",
      platformAdmin: true,
      locationIds: []
    });
    buildMoneyTruthCertificationGateMock.mockResolvedValue({
      id: "money-truth",
      label: "Payment truth",
      owner: "Finance",
      status: "pass",
      summary: "Money evidence passed.",
      evidence: ["Exact commit proof."],
      remediation: [],
      requiredTests: ["money-proof"]
    });
    buildReleaseReadinessSummaryMock.mockReturnValue({
      generatedAt: "2026-07-20T12:00:00.000Z",
      summary: { readyCount: 7, attentionCount: 1 }
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.supportingReadiness.summary.readyCount).toBe(7);
    expect(body.certification.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "money-truth", status: "pass" })
    ]));
  });
});
