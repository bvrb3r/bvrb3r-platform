import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const {
  getCurrentUserFromServerMock,
  listVerificationProfilesForArchitectMock,
  getVerificationProfileDetailMock,
  approveVerificationProfileMock,
  createArchitectVerificationDocumentSignedUrlMock,
  createEmptyArchitectVerificationQueuePayloadMock,
  createEmptyArchitectVerificationDetailPayloadMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  listVerificationProfilesForArchitectMock: vi.fn(),
  getVerificationProfileDetailMock: vi.fn(),
  approveVerificationProfileMock: vi.fn(),
  createArchitectVerificationDocumentSignedUrlMock: vi.fn(),
  createEmptyArchitectVerificationQueuePayloadMock: vi.fn(() => ({ items: [], warnings: [] })),
  createEmptyArchitectVerificationDetailPayloadMock: vi.fn(() => ({ profile: null, warnings: [] }))
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/platform-admin/verification-service", () => ({
  listVerificationProfilesForArchitect: listVerificationProfilesForArchitectMock,
  getVerificationProfileDetail: getVerificationProfileDetailMock,
  approveVerificationProfile: approveVerificationProfileMock,
  createArchitectVerificationDocumentSignedUrl: createArchitectVerificationDocumentSignedUrlMock,
  isVerificationAccessError: (error: unknown) => error instanceof Error && error.name === "VerificationAccessError",
  createEmptyArchitectVerificationQueuePayload: createEmptyArchitectVerificationQueuePayloadMock,
  createEmptyArchitectVerificationDetailPayload: createEmptyArchitectVerificationDetailPayloadMock
}));

import { GET as getQueue } from "@/app/api/architect/verifications/route";
import { GET as getDetail } from "@/app/api/architect/verifications/[profileId]/route";
import { POST as postApprove } from "@/app/api/architect/verifications/[profileId]/approve/route";
import { POST as postDocumentSignedUrl } from "@/app/api/architect/verifications/[profileId]/documents/[documentId]/signed-url/route";

describe("architect verification routes", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    listVerificationProfilesForArchitectMock.mockReset();
    getVerificationProfileDetailMock.mockReset();
    approveVerificationProfileMock.mockReset();
    createArchitectVerificationDocumentSignedUrlMock.mockReset();
    createEmptyArchitectVerificationQueuePayloadMock.mockClear();
    createEmptyArchitectVerificationDetailPayloadMock.mockClear();
  });

  it("blocks non-admin queue access with a clean 403", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: resolveDemoUser("owner@bvrb3r.demo") });

    const response = await getQueue(new NextRequest("https://bvrb3r.demo/api/architect/verifications"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/restricted to the platform admin/i);
  });

  it("returns the verification queue for the founder", async () => {
    const founder = resolveDemoUser("architect@bvrb3r.demo");
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: founder });
    listVerificationProfilesForArchitectMock.mockResolvedValue({
      items: [
        {
          profileId: "vprof-barber-fade",
          source: "profile",
          subjectName: "Fade Monroe",
          role: "barber",
          overallStatus: "submitted",
          canonicalOverallStatus: "submitted",
          identityStatus: "submitted",
          licenseStatus: "approved",
          businessStatus: "not_started",
          payoutStatus: "not_started",
          complianceStatus: "approved",
          publicVerified: false,
          canAcceptBookings: false,
          canReceivePayouts: false,
          canCreateShopListing: false,
          updatedAt: "2026-03-31T12:00:00.000Z",
          currentRequirementsCount: 2,
          currentRequirements: ["Verify identity", "Connect payouts"]
        }
      ],
      warnings: []
    });

    const response = await getQueue(new NextRequest("https://bvrb3r.demo/api/architect/verifications?role=barber&submittedOnly=true"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(listVerificationProfilesForArchitectMock).toHaveBeenCalledWith(founder, expect.objectContaining({
      role: "barber",
      submittedOnly: true
    }));
  });

  it("blocks non-admin detail access with a clean 403", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: resolveDemoUser("manager@bvrb3r.demo") });

    const response = await getDetail(new Request("https://bvrb3r.demo/api/architect/verifications/vprof-barber-fade"), {
      params: Promise.resolve({ profileId: "vprof-barber-fade" })
    });

    expect(response.status).toBe(403);
  });

  it("forwards approve actions through the verification service", async () => {
    const founder = resolveDemoUser("architect@bvrb3r.demo");
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: founder });
    approveVerificationProfileMock.mockResolvedValue({ ok: true, profileId: "vprof-barber-fade" });

    const response = await postApprove(new NextRequest("https://bvrb3r.demo/api/architect/verifications/vprof-barber-fade/approve", {
      method: "POST",
      body: JSON.stringify({
        reason: "Identity review completed.",
        internalNotes: "Still pending payouts."
      })
    }), {
      params: Promise.resolve({ profileId: "vprof-barber-fade" })
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(approveVerificationProfileMock).toHaveBeenCalledWith(founder, "vprof-barber-fade", {
      reason: "Identity review completed.",
      internalNotes: "Still pending payouts."
    });
  });

  it("blocks non-admin document signed-url access", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: resolveDemoUser("owner@bvrb3r.demo") });

    const response = await postDocumentSignedUrl(new Request("https://bvrb3r.demo/api/architect/verifications/vprof-barber-fade/documents/doc-fade-identity/signed-url", {
      method: "POST"
    }), {
      params: Promise.resolve({ profileId: "vprof-barber-fade", documentId: "doc-fade-identity" })
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/restricted to the platform admin/i);
  });

  it("returns 404 when the requested document does not belong to the profile", async () => {
    const founder = resolveDemoUser("architect@bvrb3r.demo");
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, mode: "demo", user: founder });
    createArchitectVerificationDocumentSignedUrlMock.mockRejectedValue(
      Object.assign(new Error("Verification document not found for this profile."), {
        name: "VerificationAccessError",
        status: 404
      })
    );

    const response = await postDocumentSignedUrl(new Request("https://bvrb3r.demo/api/architect/verifications/vprof-barber-wave/documents/doc-fade-identity/signed-url", {
      method: "POST"
    }), {
      params: Promise.resolve({ profileId: "vprof-barber-wave", documentId: "doc-fade-identity" })
    });

    expect(response.status).toBe(404);
  });
});
