import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSessionUserMock,
  buildReleaseReadinessSummaryMock
} = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  buildReleaseReadinessSummaryMock: vi.fn()
}));

vi.mock("@/lib/booking/route-auth", () => ({
  getSessionUser: getSessionUserMock
}));

vi.mock("@/lib/release/readiness", () => ({
  buildReleaseReadinessSummary: buildReleaseReadinessSummaryMock
}));

import { GET } from "@/app/api/release/readiness/route";

describe("release readiness route", () => {
  beforeEach(() => {
    getSessionUserMock.mockReset();
    buildReleaseReadinessSummaryMock.mockReset();
  });

  it("blocks non-owner roles", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-client",
      role: "client",
      email: "client@bvrb3r.demo",
      locationIds: []
    });

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("returns readiness for owner and manager scopes", async () => {
    getSessionUserMock.mockResolvedValue({
      id: "user-owner",
      role: "owner",
      email: "owner@bvrb3r.demo",
      locationIds: ["loc-ybor"]
    });
    buildReleaseReadinessSummaryMock.mockReturnValue({
      generatedAt: "2026-03-26T12:00:00.000Z",
      summary: {
        readyCount: 7,
        attentionCount: 1
      },
      runtime: {
        appUrl: "http://localhost:3000",
        authMode: "supabase",
        mobileRuntime: "hybrid",
        androidPackageName: "com.bvrb3r.platform",
        iosBundleId: "com.bvrb3r.platform.ios",
        capacitorServerUrl: null
      },
      bootstrap: {
        role: "owner",
        route: "/dashboard/owner"
      },
      checks: [],
      docs: {
        mobileQa: "/MOBILE_DEVICE_QA.md",
        releaseCertification: "/RELEASE_CANDIDATE_CERTIFICATION.md",
        storeLaunch: "/STORE_LAUNCH_CHECKLIST.md"
      }
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.readiness.summary.readyCount).toBe(7);
  });
});
