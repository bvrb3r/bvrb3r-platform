import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireTrustActorMock,
  getTrustProviderMock,
  getMarketplaceActivationProviderMock
} = vi.hoisted(() => ({
  requireTrustActorMock: vi.fn(),
  getTrustProviderMock: vi.fn(),
  getMarketplaceActivationProviderMock: vi.fn()
}));

vi.mock("@/lib/trust/auth", () => ({
  requireTrustActor: requireTrustActorMock
}));

vi.mock("@/lib/trust/provider", () => ({
  getTrustProvider: getTrustProviderMock
}));

vi.mock("@/lib/marketplace/activation-provider", () => ({
  getMarketplaceActivationProvider: getMarketplaceActivationProviderMock
}));

import { POST as postVerificationUpload } from "@/app/api/trust/uploads/route";
import { POST as postBarberVerification } from "@/app/api/trust/barber/verification/route";
import { POST as postShopVerification } from "@/app/api/trust/owner/shop-verification/route";

describe("trust privacy routes", () => {
  beforeEach(() => {
    requireTrustActorMock.mockReset();
    getTrustProviderMock.mockReset();
    getMarketplaceActivationProviderMock.mockReset();
  });

  it("sanitizes verification upload responses", async () => {
    requireTrustActorMock.mockResolvedValue({ role: "barber_user", barberId: "barber-fade", userEmail: "fade@bvrb3r.demo" });
    getMarketplaceActivationProviderMock.mockResolvedValue({
      createVerificationUpload: vi.fn().mockResolvedValue({
        signedUploadUrl: "https://storage.example.invalid/object/upload/sign/verification-private/opaque?token=secret-capability",
        upload: {
          id: "upload-1",
          ownerType: "barber",
          ownerId: "barber-fade",
          category: "identity_verification",
          fileName: "fade-driver-license.pdf",
          contentType: "application/pdf",
          fileSizeBytes: 2048,
          storagePath: "verification/barber-fade/fade-driver-license.pdf",
          secureReference: "secure://verification/barber-fade/upload-1",
          uploadStatus: "uploaded",
          uploadedByRole: "barber_user",
          uploadedAt: "2026-03-31T12:00:00.000Z"
        }
      })
    });

    const response = await postVerificationUpload(new Request("https://bvrb3r.demo/api/trust/uploads", {
      method: "POST",
      body: JSON.stringify({
        ownerType: "barber",
        ownerId: "barber-fade",
        category: "identity_verification",
        fileName: "fade-driver-license.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 2048
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(body.upload.uploadId).toBe("upload-1");
    expect(body.upload.signedUploadUrl).toContain("token=secret-capability");
    expect(body.upload).not.toHaveProperty("id");
    expect(body.upload).not.toHaveProperty("storageBucket");
    expect(body.upload).not.toHaveProperty("storagePath");
    expect(body.upload).not.toHaveProperty("secureReference");
  });

  it("sanitizes barber verification submissions", async () => {
    requireTrustActorMock.mockResolvedValue({ role: "barber_user", barberId: "barber-fade", userEmail: "fade@bvrb3r.demo" });
    getTrustProviderMock.mockResolvedValue({
      submitBarberVerification: vi.fn().mockResolvedValue({
        verification: {
          id: "verify-1",
          category: "license_verification",
          legalName: "Fade Monroe",
          verificationStatus: "pending",
          documentPath: "verification/barber-fade/license.pdf",
          updatedAt: "2026-03-31T12:00:00.000Z"
        },
        document: {
          id: "doc-1",
          category: "license_verification",
          ownerType: "barber",
          ownerId: "barber-fade",
          storagePath: "verification/barber-fade/license.pdf",
          secureReference: "secure://verification/barber-fade/doc-1",
          uploadedAt: "2026-03-31T12:00:00.000Z"
        }
      })
    });

    const response = await postBarberVerification(new Request("https://bvrb3r.demo/api/trust/barber/verification", {
      method: "POST",
      body: JSON.stringify({
        category: "license_verification",
        legalName: "Fade Monroe",
        uploadId: "upload-1"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.verification).not.toHaveProperty("documentPath");
    expect(body.document).not.toHaveProperty("storagePath");
    expect(body.document).not.toHaveProperty("secureReference");
  });

  it("sanitizes owner verification submissions", async () => {
    requireTrustActorMock.mockResolvedValue({ role: "owner", userEmail: "owner@bvrb3r.demo" });
    getTrustProviderMock.mockResolvedValue({
      submitShopVerification: vi.fn().mockResolvedValue({
        verification: {
          id: "shop-verify-1",
          shopId: "shop-bvrb3r",
          category: "business_verification",
          businessName: "The BVRB3R Shop(TM) & Co.",
          verificationStatus: "pending",
          documentPath: "verification/shop-bvrb3r/business.pdf",
          updatedAt: "2026-03-31T12:00:00.000Z"
        },
        document: {
          id: "doc-shop-1",
          category: "business_verification",
          ownerType: "shop",
          ownerId: "shop-bvrb3r",
          storagePath: "verification/shop-bvrb3r/business.pdf",
          secureReference: "secure://verification/shop-bvrb3r/doc-shop-1",
          uploadedAt: "2026-03-31T12:00:00.000Z"
        }
      })
    });

    const response = await postShopVerification(new Request("https://bvrb3r.demo/api/trust/owner/shop-verification", {
      method: "POST",
      body: JSON.stringify({
        shopId: "shop-bvrb3r",
        category: "business_verification",
        businessName: "The BVRB3R Shop(TM) & Co.",
        uploadId: "upload-shop-1"
      })
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.verification).not.toHaveProperty("documentPath");
    expect(body.document).not.toHaveProperty("storagePath");
    expect(body.document).not.toHaveProperty("secureReference");
  });
});
