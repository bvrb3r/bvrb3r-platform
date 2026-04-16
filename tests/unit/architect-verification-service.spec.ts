import { beforeEach, describe, expect, it } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import {
  approveVerificationProfile,
  createArchitectVerificationDocumentSignedUrl,
  createVerificationDocumentSignedUrl,
  getVerificationProfileDetail,
  listVerificationProfilesForArchitect,
  reactivateVerificationProfile,
  requestVerificationUpdate,
  resetArchitectVerificationStateForTests,
  suspendVerificationProfile
} from "@/lib/platform-admin/verification-service";
import {
  readPlatformAdminAuditLogEntries,
  resetPlatformAdminStateForTests
} from "@/lib/platform-admin/service";
import { getTrustState, resetTrustState, setTrustState } from "@/lib/trust/state";

describe("architect verification service", () => {
  const founder = resolveDemoUser("architect@bvrb3r.demo");
  const owner = resolveDemoUser("owner@bvrb3r.demo");
  const barber = resolveDemoUser("fade@bvrb3r.demo");
  const wave = resolveDemoUser("wave@bvrb3r.demo");

  beforeEach(() => {
    resetTrustState();
    resetPlatformAdminStateForTests();
    resetArchitectVerificationStateForTests();
  });

  it("lists pending verification cases for the founder queue", async () => {
    const payload = await listVerificationProfilesForArchitect(founder, { submittedOnly: true });

    expect(payload.items.some((item) => item.profileId === "vprof-barber-fade")).toBe(true);
    expect(payload.items.some((item) => item.profileId === "vprof-barber-luxe")).toBe(true);
  });

  it("blocks non-admin users from the architect verification queue", async () => {
    await expect(listVerificationProfilesForArchitect(owner)).rejects.toThrow(/platform admin/i);
  });

  it("writes review and architect audit entries for approval actions", async () => {
    await approveVerificationProfile(founder, "vprof-barber-fade", {
      reason: "Identity and license review completed.",
      internalNotes: "Waiting on payout onboarding before public activation."
    });

    const detail = await getVerificationProfileDetail(founder, "vprof-barber-fade");
    const auditEntries = await readPlatformAdminAuditLogEntries();

    expect(detail.profile?.reviews[0]?.actionType).toBe("approved");
    expect(detail.profile?.auditTrail.some((entry) => entry.actionType === "verification_approved")).toBe(true);
    expect(detail.profile?.publicVerified).toBe(false);
    expect(detail.profile?.canAcceptBookings).toBe(false);
    expect(detail.profile?.documents[0]).not.toHaveProperty("storagePath");
    expect(detail.profile?.documents[0]).not.toHaveProperty("secureReference");
    expect(auditEntries[0]?.actionType).toBe("verification_approved");
  });

  it("keeps request-update cases non-live and logs the action", async () => {
    await requestVerificationUpdate(founder, "vprof-barber-wave", {
      reason: "Need a clearer license scan.",
      internalNotes: "Current upload is too blurry for archive quality."
    });

    const detail = await getVerificationProfileDetail(founder, "vprof-barber-wave");

    expect(detail.profile?.canonicalOverallStatus).toBe("needs_update");
    expect(detail.profile?.publicVerified).toBe(false);
    expect(detail.profile?.canAcceptBookings).toBe(false);
    expect(detail.profile?.reviews[0]?.actionType).toBe("requested_update");
    expect(detail.profile?.auditTrail.some((entry) => entry.actionType === "verification_requested_update")).toBe(true);
  });

  it("suspends and reactivates a profile through canonical recompute", async () => {
    await suspendVerificationProfile(founder, "vprof-shop-bvrb3r", {
      reason: "Temporary platform hold during manual compliance review."
    });

    let detail = await getVerificationProfileDetail(founder, "vprof-shop-bvrb3r");

    expect(detail.profile?.canonicalOverallStatus).toBe("suspended");
    expect(detail.profile?.publicVerified).toBe(false);
    expect(detail.profile?.canReceivePayouts).toBe(false);
    expect(detail.profile?.canCreateShopListing).toBe(false);

    await reactivateVerificationProfile(founder, "vprof-shop-bvrb3r", {
      reason: "Manual review cleared and the shop can return to normal operation."
    });

    detail = await getVerificationProfileDetail(founder, "vprof-shop-bvrb3r");

    expect(detail.profile?.canonicalOverallStatus).toBe("approved");
    expect(detail.profile?.canReceivePayouts).toBe(true);
    expect(detail.profile?.canCreateShopListing).toBe(true);
    expect(detail.profile?.auditTrail.some((entry) => entry.actionType === "verification_reactivated")).toBe(true);
  });

  it("limits raw verification file access to the subject or the platform admin", async () => {
    const founderResult = await createVerificationDocumentSignedUrl("doc-fade-identity", founder);
    const subjectResult = await createVerificationDocumentSignedUrl("doc-fade-identity", barber);

    expect(founderResult.url).toMatch(/^data:text\/plain/);
    expect(subjectResult.url).toMatch(/^data:text\/plain/);
    await expect(createVerificationDocumentSignedUrl("doc-fade-identity", owner)).rejects.toThrow(/do not have access/i);
  });

  it("requires architect document requests to match the profile in the route", async () => {
    await expect(
      createArchitectVerificationDocumentSignedUrl("vprof-barber-wave", "doc-fade-identity", founder)
    ).rejects.toThrow(/not found for this profile/i);
  });

  it("writes an architect audit entry when a secure verification document URL is issued", async () => {
    await createArchitectVerificationDocumentSignedUrl("vprof-barber-fade", "doc-fade-identity", founder);

    const auditEntries = await readPlatformAdminAuditLogEntries();

    expect(auditEntries.some((entry) => entry.actionType === "verification_document_signed_url_issued")).toBe(true);
  });

  it("supports separate barber and shop-owner verification profiles for one account", async () => {
    const current = getTrustState();

    setTrustState({
      ...current,
      verificationProfiles: [
        ...current.verificationProfiles ?? [],
        {
          id: "vprof-wave-shop",
          userId: wave.id,
          role: "shop_owner",
          overallStatus: "submitted",
          identityStatus: "approved",
          licenseStatus: "not_started",
          businessStatus: "submitted",
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
      shopVerifications: [
        ...current.shopVerifications,
        {
          id: "shop-verify-wave-business",
          shopId: "shop-bvrb3r",
          category: "business_verification",
          businessName: "Wave Carter Studio LLC",
          userId: wave.id,
          verificationProfileId: "vprof-wave-shop",
          dbaName: "Wave Carter Studio",
          einLast4: "7711",
          stateOfRegistration: "FL",
          businessLicenseType: "barber_shop",
          shopLicenseNumber: "FL-SH-771122",
          verificationStatus: "submitted",
          identityStatus: "approved",
          payoutStatus: "submitted",
          complianceStatus: "approved",
          providerConnectStatus: "requirements_due",
          verificationSubmittedAt: "2026-03-10T09:00:00-05:00",
          verificationNotes: "Pending payout completion.",
          updatedAt: "2026-03-10T09:00:00-05:00"
        }
      ],
      verificationDocuments: [
        ...current.verificationDocuments,
        {
          id: "doc-wave-shop-business",
          ownerType: "shop",
          ownerId: "shop-bvrb3r",
          userId: wave.id,
          shopId: "shop-bvrb3r",
          verificationProfileId: "vprof-wave-shop",
          category: "business_verification",
          documentType: "business_registration",
          status: "submitted",
          storageBucket: "verification-private",
          storagePath: "verification/shop-bvrb3r/wave-business.pdf",
          secureReference: "secure-wave-shop-business",
          fileName: "wave-shop-business.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 1024,
          uploadedAt: "2026-03-10T09:00:00-05:00",
          updatedAt: "2026-03-10T09:00:00-05:00"
        }
      ],
      verificationProviderLinks: [
        ...(current.verificationProviderLinks ?? []),
        {
          id: "vprovider-wave-shop-connect",
          verificationProfileId: "vprof-wave-shop",
          userId: wave.id,
          provider: "stripe",
          providerSubject: "connect_account",
          providerReferenceId: "acct_wave_shop_demo",
          providerStatus: "requirements_due",
          metadata: { payoutsEnabled: false },
          createdAt: "2026-03-10T09:00:00-05:00",
          updatedAt: "2026-03-10T09:00:00-05:00"
        }
      ]
    });
    resetArchitectVerificationStateForTests();

    const payload = await listVerificationProfilesForArchitect(founder);
    const roles = payload.items
      .filter((item) => item.userId === wave.id)
      .map((item) => item.role)
      .sort();

    const barberDetail = await getVerificationProfileDetail(founder, "vprof-barber-wave");
    const ownerDetail = await getVerificationProfileDetail(founder, "vprof-wave-shop");

    expect(roles).toEqual(["barber", "shop_owner"]);
    expect(barberDetail.profile?.documents.map((document) => document.id)).toEqual(["doc-wave-license"]);
    expect(ownerDetail.profile?.documents.map((document) => document.id)).toContain("doc-wave-shop-business");
    expect(ownerDetail.profile?.documents.map((document) => document.id)).not.toContain("doc-wave-license");
  });
});
