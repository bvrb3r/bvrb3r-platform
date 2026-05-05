import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import { getVerificationMePayload } from "@/lib/trust/verification-service";
import { getTrustState, resetTrustState, setTrustState } from "@/lib/trust/state";

vi.mock("@/lib/trust/provider", async () => {
  const state = await vi.importActual<typeof import("@/lib/trust/state")>("@/lib/trust/state");
  return {
    getTrustProvider: async () => ({
      kind: "test",
      readState: async () => state.getTrustState()
    })
  };
});

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

  it("aligns stale barber verification rows with canonical Architect approval without faking payouts", async () => {
    const barber = {
      ...resolveDemoUser("fade@bvrb3r.demo"),
      appApprovalStatus: "approved" as const
    };
    const current = getTrustState();

    setTrustState({
      ...current,
      verificationProfiles: [
        ...(current.verificationProfiles ?? []).filter((profile) => profile.userId !== barber.id),
        {
          id: "vprof-stale-approved-barber",
          userId: barber.id,
          role: "barber",
          overallStatus: "pending",
          identityStatus: "pending",
          licenseStatus: "pending",
          businessStatus: "not_started",
          payoutStatus: "not_started",
          complianceStatus: "pending",
          publicVerified: false,
          canAcceptBookings: false,
          canReceivePayouts: false,
          canCreateShopListing: false,
          currentRequirements: ["Identity review", "License review", "Connect payouts"],
          createdAt: "2026-03-10T09:00:00-05:00",
          updatedAt: "2026-03-10T09:00:00-05:00"
        }
      ]
    });

    const payload = await getVerificationMePayload(barber);
    const profile = payload.profiles.find((item) => item.role === "barber");

    expect(profile?.overallStatus).toBe("approved");
    expect(profile?.identityStatus).toBe("approved");
    expect(profile?.licenseStatus).toBe("approved");
    expect(profile?.canAcceptBookings).toBe(true);
    expect(profile?.canReceivePayouts).toBe(false);
    expect(profile?.payoutStatus).toBe("not_started");
    expect(profile?.currentRequirements).toEqual(["Connect payouts"]);
  });

  it("keeps rejected canonical barber approvals out of public/bookable state", async () => {
    const barber = {
      ...resolveDemoUser("fade@bvrb3r.demo"),
      appApprovalStatus: "rejected" as const
    };
    const current = getTrustState();

    setTrustState({
      ...current,
      verificationProfiles: [
        ...(current.verificationProfiles ?? []).filter((profile) => profile.userId !== barber.id),
        {
          id: "vprof-suspended-barber",
          userId: barber.id,
          role: "barber",
          overallStatus: "approved",
          identityStatus: "approved",
          licenseStatus: "approved",
          businessStatus: "not_started",
          payoutStatus: "approved",
          complianceStatus: "approved",
          publicVerified: true,
          canAcceptBookings: true,
          canReceivePayouts: true,
          canCreateShopListing: false,
          currentRequirements: [],
          createdAt: "2026-03-10T09:00:00-05:00",
          updatedAt: "2026-03-10T09:00:00-05:00"
        }
      ]
    });

    const payload = await getVerificationMePayload(barber);
    const profile = payload.profiles.find((item) => item.role === "barber");

    expect(profile?.overallStatus).toBe("rejected");
    expect(profile?.publicVerified).toBe(false);
    expect(profile?.canAcceptBookings).toBe(false);
    expect(profile?.canReceivePayouts).toBe(false);
  });
});
