import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";

const {
  getCurrentUserFromServerMock,
  getVerificationMePayloadMock,
  createEmptyVerificationMePayloadMock,
  createVerificationDocumentSignedUrlMock
} = vi.hoisted(() => ({
  getCurrentUserFromServerMock: vi.fn(),
  getVerificationMePayloadMock: vi.fn(),
  createEmptyVerificationMePayloadMock: vi.fn((warnings: string[] = []) => ({ profiles: [], warnings })),
  createVerificationDocumentSignedUrlMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/trust/verification-service", () => ({
  getVerificationMePayload: getVerificationMePayloadMock,
  createEmptyVerificationMePayload: createEmptyVerificationMePayloadMock
}));

vi.mock("@/lib/platform-admin/verification-service", () => ({
  createVerificationDocumentSignedUrl: createVerificationDocumentSignedUrlMock,
  isVerificationAccessError: (error: unknown) => error instanceof Error && error.name === "VerificationAccessError"
}));

import { GET as getVerificationMe } from "@/app/api/verification/me/route";
import { POST as postSubjectSignedUrl } from "@/app/api/verification/documents/[documentId]/signed-url/route";

function makeAccessError(message: string, status: number) {
  const error = new Error(message) as Error & { status: number; name: string };
  error.name = "VerificationAccessError";
  error.status = status;
  return error;
}

describe("verification privacy routes", () => {
  beforeEach(() => {
    getCurrentUserFromServerMock.mockReset();
    getVerificationMePayloadMock.mockReset();
    createEmptyVerificationMePayloadMock.mockClear();
    createVerificationDocumentSignedUrlMock.mockReset();
  });

  it("returns subject-safe verification metadata for the signed-in user", async () => {
    const barber = resolveDemoUser("fade@bvrb3r.demo");
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: barber });
    getVerificationMePayloadMock.mockResolvedValue({
      profiles: [
        {
          profileId: "vprof-barber-fade",
          role: "barber",
          overallStatus: "submitted",
          identityStatus: "submitted",
          licenseStatus: "approved",
          businessStatus: "not_started",
          payoutStatus: "not_started",
          complianceStatus: "approved",
          publicVerified: false,
          canAcceptBookings: false,
          canReceivePayouts: false,
          canCreateShopListing: false,
          currentRequirements: ["Verify identity"],
          updatedAt: "2026-03-31T12:00:00.000Z",
          documents: [
            {
              id: "doc-fade-identity",
              legacyCategory: "identity_verification",
              fileName: "fade-driver-license.pdf",
              uploadedAt: "2026-03-31T12:00:00.000Z"
            }
          ],
          reviews: [],
          providerStatuses: []
        }
      ],
      warnings: []
    });

    const response = await getVerificationMe();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.profiles[0].documents[0]).not.toHaveProperty("storagePath");
    expect(body.profiles[0].documents[0]).not.toHaveProperty("secureReference");
  });

  it("returns 403 when a user requests another subject's verification document", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("fade@bvrb3r.demo") });
    createVerificationDocumentSignedUrlMock.mockRejectedValue(
      makeAccessError("You do not have access to this verification document.", 403)
    );

    const response = await postSubjectSignedUrl(new Request("https://bvrb3r.demo/api/verification/documents/doc-wave-license/signed-url", {
      method: "POST"
    }), {
      params: Promise.resolve({ documentId: "doc-wave-license" })
    });

    expect(response.status).toBe(403);
  });

  it("returns 404 when the requested verification document does not exist", async () => {
    getCurrentUserFromServerMock.mockResolvedValue({ mode: "demo", user: resolveDemoUser("fade@bvrb3r.demo") });
    createVerificationDocumentSignedUrlMock.mockRejectedValue(
      makeAccessError("Verification document not found.", 404)
    );

    const response = await postSubjectSignedUrl(new Request("https://bvrb3r.demo/api/verification/documents/doc-missing/signed-url", {
      method: "POST"
    }), {
      params: Promise.resolve({ documentId: "doc-missing" })
    });

    expect(response.status).toBe(404);
  });
});
