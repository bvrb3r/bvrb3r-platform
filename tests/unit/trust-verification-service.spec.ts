import { beforeEach, describe, expect, it } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { getVerificationMePayload } from "@/lib/trust/verification-service";
import { getTrustState, resetTrustState, setTrustState } from "@/lib/trust/state";

describe("trust verification service", () => {
  beforeEach(() => {
    resetTrustState();
  });

  it("returns subject-safe verification metadata for the signed-in barber", async () => {
    const barber = resolveDemoUser("fade@bvrb3r.demo");
    const payload = await getVerificationMePayload(barber);

    expect(payload.profiles).toHaveLength(1);
    expect(payload.profiles[0]?.documents[0]).not.toHaveProperty("storagePath");
    expect(payload.profiles[0]?.documents[0]).not.toHaveProperty("secureReference");
    expect(payload.profiles[0]?.documents[0]).not.toHaveProperty("reviewNotes");
    expect(payload.profiles[0]?.reviews[0]).not.toHaveProperty("internalNotes");
    expect(payload.profiles[0]?.providerStatuses[0]).not.toHaveProperty("providerReferenceId");
    expect(payload.profiles[0]?.providerStatuses[0]).not.toHaveProperty("metadata");
    expect(payload.profiles[0]?.providerStatuses[0]?.summary).toBeTruthy();
  });

  it("returns the owner's own verification documents without leaking raw storage references", async () => {
    const owner = resolveDemoUser("owner@bvrb3r.demo");
    const payload = await getVerificationMePayload(owner);

    expect(payload.profiles[0]?.role).toBe("shop_owner");
    expect(payload.profiles[0]?.documents[0]?.legacyCategory).toBe("business_verification");
    expect(payload.profiles[0]?.documents[0]).not.toHaveProperty("storagePath");
    expect(payload.profiles[0]?.documents[0]).not.toHaveProperty("secureReference");
  });

  it("keeps barber and owner verification lanes separated for one account", async () => {
    const owner = resolveDemoUser("owner@bvrb3r.demo");
    const current = getTrustState();

    setTrustState({
      ...current,
      verificationProfiles: [
        ...current.verificationProfiles ?? [],
        {
          id: "vprof-owner-barber",
          userId: owner.id,
          role: "barber",
          overallStatus: "submitted",
          identityStatus: "submitted",
          licenseStatus: "approved",
          businessStatus: "not_started",
          payoutStatus: "submitted",
          complianceStatus: "approved",
          publicVerified: false,
          canAcceptBookings: false,
          canReceivePayouts: false,
          canCreateShopListing: false,
          currentRequirements: ["Connect payouts"],
          createdAt: "2026-03-10T09:00:00-05:00",
          updatedAt: "2026-03-10T09:00:00-05:00"
        }
      ],
      barberVerifications: [
        ...current.barberVerifications,
        {
          id: "verify-owner-barber-license",
          barberId: "barber-owner",
          category: "license_verification",
          legalName: "Owner Operator",
          userId: owner.id,
          verificationProfileId: "vprof-owner-barber",
          professionalLicenseType: "barber",
          licenseNumber: "FL-BR-778899",
          issuingState: "FL",
          expirationDate: "2027-12-31",
          verificationStatus: "submitted",
          identityStatus: "submitted",
          payoutStatus: "submitted",
          complianceStatus: "approved",
          verificationSubmittedAt: "2026-03-10T09:00:00-05:00",
          verificationNotes: "Awaiting payout completion.",
          updatedAt: "2026-03-10T09:00:00-05:00"
        }
      ],
      verificationDocuments: [
        ...current.verificationDocuments,
        {
          id: "doc-owner-barber-license",
          ownerType: "barber",
          ownerId: "barber-owner",
          userId: owner.id,
          verificationProfileId: "vprof-owner-barber",
          category: "license_verification",
          documentType: "barber_license",
          status: "submitted",
          storageBucket: "verification-private",
          storagePath: "verification/barber-owner/license.pdf",
          secureReference: "secure-owner-barber-license",
          fileName: "owner-barber-license.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 1024,
          uploadedAt: "2026-03-10T09:00:00-05:00",
          updatedAt: "2026-03-10T09:00:00-05:00"
        }
      ],
      verificationProviderLinks: [
        ...(current.verificationProviderLinks ?? []),
        {
          id: "vprovider-owner-barber-connect",
          verificationProfileId: "vprof-owner-barber",
          userId: owner.id,
          provider: "stripe",
          providerSubject: "connect_account",
          providerReferenceId: "acct_owner_barber_demo",
          providerStatus: "requirements_due",
          metadata: { payoutsEnabled: false },
          createdAt: "2026-03-10T09:00:00-05:00",
          updatedAt: "2026-03-10T09:00:00-05:00"
        }
      ]
    });

    const payload = await getVerificationMePayload({
      ...owner,
      barberId: "barber-owner"
    });

    const barberProfile = payload.profiles.find((profile) => profile.role === "barber");
    const ownerProfile = payload.profiles.find((profile) => profile.role === "shop_owner");

    expect(payload.profiles).toHaveLength(2);
    expect(barberProfile?.documents.map((document) => document.id)).toEqual(["doc-owner-barber-license"]);
    expect(ownerProfile?.documents.map((document) => document.id)).toEqual(["doc-shop-business"]);
    expect(barberProfile?.providerStatuses).toHaveLength(1);
    expect(ownerProfile?.providerStatuses).toHaveLength(1);
  });
});
