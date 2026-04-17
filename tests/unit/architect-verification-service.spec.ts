import { beforeEach, describe, expect, it } from "vitest";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";
import {
  approveVerificationProfile,
  createArchitectVerificationDocumentSignedUrl,
  createVerificationDocumentSignedUrl,
  getVerificationProfileDetail,
  listVerificationProfilesForArchitect,
  requestVerificationUpdate,
  resetArchitectVerificationStateForTests,
  stageArchitectProductionVerificationRowsForTests,
  suspendVerificationProfile
} from "@/lib/platform-admin/verification-service";
import {
  readPlatformAdminAuditLogEntries,
  resetPlatformAdminStateForTests
} from "@/lib/platform-admin/service";
import { createEmptyTrustState } from "@/lib/trust/engine";
import { resetTrustState, setTrustState } from "@/lib/trust/state";
import type { UserAccount } from "@/types/domain";
import type { TrustState } from "@/types/trust";

const now = "2026-04-17T10:00:00.000Z";

const barberProfile = {
  id: "profile-phillip",
  full_name: "Phillip McGee",
  email: "phillipmcgee813@gmail.com",
  phone: null,
  primary_onboarding_role: "barber",
  onboarding_state: "active",
  created_at: now
} as const;

const ownerProfile = {
  id: "profile-bvrb3r-owner",
  full_name: "BVRB3R Owner",
  email: "bvrb3r@gmail.com",
  phone: null,
  primary_onboarding_role: "shop_owner",
  onboarding_state: "active",
  created_at: now
} as const;

const barberRow = {
  id: "barber-phillip",
  reference_code: "barber-phillip",
  profile_id: barberProfile.id,
  compensation_model: "booth_rent",
  barber_subtype: "freelance",
  app_approval_status: "pending",
  shop_approval_status: "not_required",
  created_at: now
} as const;

const shopRow = {
  id: "shop-bvrb3r-real",
  name: "BVRB3R Tampa",
  owner_profile_id: ownerProfile.id,
  app_approval_status: "pending",
  created_at: now
} as const;

function realTrustState(): TrustState {
  return {
    ...createEmptyTrustState(),
    verificationProfiles: [
      {
        id: "vprof-barber-phillip",
        userId: barberProfile.id,
        role: "barber",
        overallStatus: "submitted",
        identityStatus: "submitted",
        licenseStatus: "submitted",
        businessStatus: "not_started",
        payoutStatus: "not_started",
        complianceStatus: "approved",
        publicVerified: false,
        canAcceptBookings: false,
        canReceivePayouts: false,
        canCreateShopListing: false,
        currentRequirements: ["Review identity", "Review license", "Connect payouts"],
        createdAt: now,
        updatedAt: now
      },
      {
        id: "vprof-shop-bvrb3r",
        userId: ownerProfile.id,
        role: "shop_owner",
        overallStatus: "submitted",
        identityStatus: "not_started",
        licenseStatus: "not_started",
        businessStatus: "submitted",
        payoutStatus: "submitted",
        complianceStatus: "approved",
        publicVerified: false,
        canAcceptBookings: false,
        canReceivePayouts: false,
        canCreateShopListing: false,
        currentRequirements: ["Review business", "Connect payouts"],
        createdAt: now,
        updatedAt: now
      }
    ],
    barberVerifications: [
      {
        id: "verify-phillip-identity",
        barberId: barberRow.reference_code,
        category: "identity_verification",
        legalName: "Phillip McGee",
        userId: barberProfile.id,
        verificationProfileId: "vprof-barber-phillip",
        verificationStatus: "submitted",
        verificationSubmittedAt: now,
        updatedAt: now
      },
      {
        id: "verify-phillip-license",
        barberId: barberRow.reference_code,
        category: "license_verification",
        legalName: "Phillip McGee",
        userId: barberProfile.id,
        verificationProfileId: "vprof-barber-phillip",
        licenseNumber: "FL-BR-813",
        issuingState: "FL",
        verificationStatus: "submitted",
        verificationSubmittedAt: now,
        updatedAt: now
      }
    ],
    shopVerifications: [
      {
        id: "verify-bvrb3r-business",
        shopId: shopRow.id,
        category: "business_verification",
        businessName: "BVRB3R Tampa",
        userId: ownerProfile.id,
        verificationProfileId: "vprof-shop-bvrb3r",
        verificationStatus: "submitted",
        verificationSubmittedAt: now,
        updatedAt: now
      }
    ],
    verificationDocuments: [
      {
        id: "doc-phillip-license",
        ownerType: "barber",
        ownerId: barberRow.reference_code,
        userId: barberProfile.id,
        verificationProfileId: "vprof-barber-phillip",
        category: "license_verification",
        documentType: "barber_license",
        status: "submitted",
        storageBucket: "verification-private",
        storagePath: "verification/phillip/license.pdf",
        secureReference: "secure-phillip-license",
        fileName: "phillip-license.pdf",
        mimeType: "application/pdf",
        uploadedAt: now
      }
    ]
  };
}

function seedRealProductionRows(state = realTrustState()) {
  setTrustState(state);
  resetArchitectVerificationStateForTests();
  stageArchitectProductionVerificationRowsForTests({
    profiles: [barberProfile, ownerProfile],
    barbers: [barberRow],
    shops: [shopRow]
  });
}

function makeUser(overrides: Partial<UserAccount>): UserAccount {
  return {
    id: "user",
    role: "client",
    email: "client@example.com",
    password: "",
    name: "Client",
    title: "Client",
    locationIds: [],
    ...overrides
  };
}

describe("architect verification service", () => {
  const founder = makePlatformAdminUser();
  const barber = makeUser({
    id: barberProfile.id,
    role: "booth_rent_barber",
    email: barberProfile.email,
    name: barberProfile.full_name,
    primaryOnboardingRole: "barber",
    barberId: barberRow.reference_code
  });
  const owner = makeUser({
    id: ownerProfile.id,
    role: "owner",
    email: ownerProfile.email,
    name: ownerProfile.full_name,
    primaryOnboardingRole: "shop_owner",
    ownedShopId: shopRow.id
  });

  beforeEach(() => {
    resetTrustState();
    setTrustState(createEmptyTrustState());
    resetPlatformAdminStateForTests();
    resetArchitectVerificationStateForTests();
  });

  it("shows a true empty queue when no real production rows are pending", async () => {
    stageArchitectProductionVerificationRowsForTests({});

    const payload = await listVerificationProfilesForArchitect(founder, { submittedOnly: true });

    expect(payload.items).toEqual([]);
  });

  it("lists real pending barber and shop-owner production cases", async () => {
    seedRealProductionRows();

    const payload = await listVerificationProfilesForArchitect(founder, { submittedOnly: true });

    expect(payload.items.map((item) => item.subjectEmail)).toEqual(
      expect.arrayContaining(["phillipmcgee813@gmail.com", "bvrb3r@gmail.com"])
    );
    expect(payload.items.map((item) => item.subjectName)).not.toEqual(expect.arrayContaining(["Wave Carter", "Blaze King"]));
  });

  it("does not fabricate queue entries when production rows lack verification profiles", async () => {
    setTrustState(createEmptyTrustState());
    resetArchitectVerificationStateForTests();
    stageArchitectProductionVerificationRowsForTests({
      profiles: [barberProfile, ownerProfile],
      barbers: [barberRow],
      shops: [shopRow]
    });

    const payload = await listVerificationProfilesForArchitect(founder, { submittedOnly: true });

    expect(payload.items).toEqual([]);
  });

  it("ignores fake legacy verification subjects that are not backed by production rows", async () => {
    setTrustState({
      ...createEmptyTrustState(),
      barberVerifications: [{
        id: "fake-blaze",
        barberId: "barber-blaze",
        category: "license_verification",
        legalName: "Blaze King",
        verificationStatus: "submitted",
        updatedAt: now
      }]
    });
    resetArchitectVerificationStateForTests();
    stageArchitectProductionVerificationRowsForTests({});

    const payload = await listVerificationProfilesForArchitect(founder, { submittedOnly: true });

    expect(payload.items).toEqual([]);
  });

  it("blocks non-admin users from the architect verification queue", async () => {
    seedRealProductionRows();

    await expect(listVerificationProfilesForArchitect(owner)).rejects.toThrow(/platform admin/i);
  });

  it("writes review and architect audit entries for approval actions", async () => {
    seedRealProductionRows();

    await approveVerificationProfile(founder, "vprof-barber-phillip", {
      reason: "Identity and license review completed.",
      internalNotes: "Waiting on payout onboarding before public activation."
    });

    const detail = await getVerificationProfileDetail(founder, "vprof-barber-phillip");
    const auditEntries = await readPlatformAdminAuditLogEntries();

    expect(detail.profile?.reviews[0]?.actionType).toBe("approved");
    expect(detail.profile?.auditTrail.some((entry) => entry.actionType === "verification_approved")).toBe(true);
    expect(detail.profile?.publicVerified).toBe(false);
    expect(detail.profile?.documents[0]).not.toHaveProperty("storagePath");
    expect(auditEntries[0]?.actionType).toBe("verification_approved");
  });

  it("keeps request-update and suspend cases non-live while preserving audit history", async () => {
    seedRealProductionRows();

    await requestVerificationUpdate(founder, "vprof-barber-phillip", {
      reason: "Need clearer license scan.",
      internalNotes: "Current upload is too blurry for archive quality."
    });
    await suspendVerificationProfile(founder, "vprof-shop-bvrb3r", {
      reason: "Temporary platform hold during manual compliance review."
    });

    const barberDetail = await getVerificationProfileDetail(founder, "vprof-barber-phillip");
    const shopDetail = await getVerificationProfileDetail(founder, "vprof-shop-bvrb3r");

    expect(barberDetail.profile?.canonicalOverallStatus).toBe("needs_update");
    expect(barberDetail.profile?.canAcceptBookings).toBe(false);
    expect(shopDetail.profile?.canonicalOverallStatus).toBe("suspended");
    expect(shopDetail.profile?.canCreateShopListing).toBe(false);
    expect(shopDetail.profile?.auditTrail.some((entry) => entry.actionType === "verification_suspended")).toBe(true);
  });

  it("does not fabricate document previews when secure storage is unavailable", async () => {
    seedRealProductionRows();

    await expect(createVerificationDocumentSignedUrl("doc-phillip-license", founder)).rejects.toThrow(/storage is unavailable/i);
    await expect(createVerificationDocumentSignedUrl("doc-phillip-license", barber)).rejects.toThrow(/storage is unavailable/i);
    await expect(createVerificationDocumentSignedUrl("doc-phillip-license", owner)).rejects.toThrow(/do not have access/i);
  });

  it("requires architect document requests to match the real profile route", async () => {
    seedRealProductionRows();

    await expect(
      createArchitectVerificationDocumentSignedUrl("vprof-shop-bvrb3r", "doc-phillip-license", founder)
    ).rejects.toThrow(/not found for this profile/i);
  });
});
