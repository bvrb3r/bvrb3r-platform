import { beforeEach, describe, expect, it } from "vitest";
import { makePlatformAdminUser } from "@/tests/unit/platform-admin-test-user";
import {
  getArchitectAccountDetailPayload,
  getArchitectAccountDirectoryPayload,
  getArchitectDashboardPayload,
  resetArchitectAccountRowsForTests,
  stageArchitectAccountRowsForTests
} from "@/lib/platform-admin/accounts-service";
import { resetPlatformAdminStateForTests } from "@/lib/platform-admin/service";

const founder = makePlatformAdminUser();

function stageRealAccountRows() {
  stageArchitectAccountRowsForTests({
    authUsers: [
      {
        id: "profile-admin",
        email: "bvrb3r@icloud.com",
        phone: null,
        created_at: "2026-04-01T12:00:00.000Z",
        updated_at: "2026-04-01T12:00:00.000Z",
        last_sign_in_at: "2026-04-05T12:00:00.000Z",
        email_confirmed_at: "2026-04-01T12:10:00.000Z",
        phone_confirmed_at: null,
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: { full_name: "BVRB3R Architect" },
        identities: [{ provider: "email" }]
      },
      {
        id: "profile-barber",
        email: "phillipmcgee813@gmail.com",
        phone: "+18135550101",
        created_at: "2026-04-02T12:00:00.000Z",
        updated_at: "2026-04-02T12:00:00.000Z",
        last_sign_in_at: "2026-04-05T12:00:00.000Z",
        email_confirmed_at: "2026-04-02T12:10:00.000Z",
        phone_confirmed_at: "2026-04-02T12:20:00.000Z",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: { full_name: "Phillip McGee" },
        identities: [{ provider: "email" }]
      },
      {
        id: "profile-owner",
        email: "bvrb3r@gmail.com",
        phone: "+18135550202",
        created_at: "2026-04-03T12:00:00.000Z",
        updated_at: "2026-04-03T12:00:00.000Z",
        email_confirmed_at: "2026-04-03T12:10:00.000Z",
        app_metadata: { provider: "google", providers: ["google"] },
        user_metadata: { full_name: "BVRB3R Shop" },
        identities: [{ provider: "google" }]
      },
      {
        id: "auth-apple-client",
        email: "apple-client@icloud.com",
        phone: "+18135550404",
        created_at: "2026-04-05T12:00:00.000Z",
        updated_at: "2026-04-05T12:00:00.000Z",
        email_confirmed_at: "2026-04-05T12:10:00.000Z",
        app_metadata: { provider: "apple", providers: ["apple"] },
        user_metadata: { full_name: "Apple Client" },
        identities: [{ provider: "apple" }]
      },
      {
        id: "fake-demo-user",
        email: "blaze@bvrb3r.demo",
        phone: null,
        created_at: "2026-04-05T12:00:00.000Z",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: { full_name: "Blaze King" },
        identities: [{ provider: "email" }]
      }
    ],
    profiles: [
      {
        id: "profile-admin",
        role: "platform_admin",
        primary_onboarding_role: "platform_admin",
        onboarding_state: "complete",
        full_name: "BVRB3R Architect",
        email: "bvrb3r@icloud.com",
        phone: null,
        created_at: "2026-04-01T12:00:00.000Z"
      },
      {
        id: "profile-barber",
        role: "barber",
        primary_onboarding_role: "barber",
        onboarding_state: "complete",
        full_name: "Phillip McGee",
        email: "phillipmcgee813@gmail.com",
        phone: "8135550101",
        created_at: "2026-04-02T12:00:00.000Z"
      },
      {
        id: "profile-owner",
        role: "shop_owner",
        primary_onboarding_role: "shop_owner",
        onboarding_state: "complete",
        full_name: "BVRB3R Shop",
        email: "bvrb3r@gmail.com",
        phone: "8135550202",
        created_at: "2026-04-03T12:00:00.000Z"
      },
      {
        id: "profile-client",
        role: "client",
        primary_onboarding_role: "client",
        onboarding_state: "complete",
        full_name: "Client One",
        email: "client@example.com",
        phone: null,
        created_at: "2026-04-04T12:00:00.000Z"
      }
    ],
    clients: [
      {
        id: "client-1",
        reference_code: "client-ref-1",
        profile_id: "profile-client",
        loyalty_points: 40,
        retention_tag: "new",
        created_at: "2026-04-04T12:00:00.000Z"
      }
    ],
    barbers: [
      {
        id: "barber-1",
        reference_code: "barber-ref-1",
        profile_id: "profile-barber",
        compensation_model: "commission",
        barber_subtype: "solo",
        app_approval_status: "pending",
        shop_approval_status: "pending",
        created_at: "2026-04-02T12:00:00.000Z"
      }
    ],
    shops: [
      {
        id: "shop-1",
        name: "BVRB3R Studio",
        owner_profile_id: "profile-owner",
        app_approval_status: "pending",
        neighborhood: "Downtown",
        city: "Tampa",
        state: "FL",
        phone: "8135550303",
        address: "100 Main St",
        created_at: "2026-04-03T12:00:00.000Z"
      }
    ],
    memberships: [
      {
        barber_reference: "barber-ref-1",
        shop_reference: "shop-1",
        active: true
      }
    ],
    barberProfiles: [
      {
        barber_reference: "barber-ref-1",
        username: "phillipmcgee",
        display_name: "Phillip McGee",
        shop_reference: "shop-1",
        visibility_state: "visible",
        next_available_at: "2026-04-05T12:00:00.000Z"
      }
    ],
    marketplaceVisibilities: [
      {
        barber_reference: "barber-ref-1",
        visibility_state: "visible",
        accepts_instant_bookings: true
      }
    ],
    barberStatuses: [
      {
        barber_reference: "barber-ref-1",
        shop_reference: "shop-1",
        status: "active",
        accepting_bookings: true,
        next_available_at: "2026-04-05T12:00:00.000Z"
      }
    ],
    services: [
      {
        id: "service-1",
        service_owner_type: "barber",
        barber_reference: "barber-ref-1",
        shop_reference: null,
        active: true
      }
    ],
    availabilityRules: [
      {
        id: "availability-1",
        barber_id: "barber-1",
        location_id: "location-1"
      }
    ],
    verificationProfiles: [
      {
        id: "verification-barber",
        user_id: "profile-barber",
        role: "barber",
        overall_status: "pending",
        identity_status: "pending",
        license_status: "pending",
        business_status: "not_started",
        payout_status: "not_started",
        compliance_status: "pending",
        public_verified: false,
        can_accept_bookings: false,
        can_receive_payouts: false,
        can_create_shop_listing: false,
        current_requirements: ["Identity review"],
        created_at: "2026-04-02T13:00:00.000Z",
        updated_at: "2026-04-02T13:00:00.000Z"
      },
      {
        id: "verification-owner",
        user_id: "profile-owner",
        role: "shop_owner",
        overall_status: "pending",
        identity_status: "pending",
        license_status: "not_started",
        business_status: "pending",
        payout_status: "not_started",
        compliance_status: "pending",
        public_verified: false,
        can_accept_bookings: false,
        can_receive_payouts: false,
        can_create_shop_listing: false,
        current_requirements: ["Business review"],
        created_at: "2026-04-03T13:00:00.000Z",
        updated_at: "2026-04-03T13:00:00.000Z"
      }
    ],
    verificationDocuments: [
      {
        id: "document-1",
        verification_profile_id: "verification-barber",
        user_id: "profile-barber",
        document_type: "professional_license",
        file_name: "license.pdf",
        status: "pending",
        uploaded_at: "2026-04-02T14:00:00.000Z"
      }
    ],
    verificationReviews: [
      {
        id: "review-1",
        verification_profile_id: "verification-barber",
        review_type: "manual",
        action_type: "request_update",
        from_status: "pending",
        to_status: "needs_update",
        reviewed_by: "profile-admin",
        reason: "Need license clarity.",
        internal_notes: null,
        created_at: "2026-04-02T15:00:00.000Z"
      }
    ]
  });
}

describe("architect account service", () => {
  beforeEach(() => {
    resetPlatformAdminStateForTests();
    resetArchitectAccountRowsForTests();
  });

  it("returns real zero counts and empty arrays when no live rows exist", async () => {
    stageArchitectAccountRowsForTests({});

    const payload = await getArchitectDashboardPayload(founder);

    expect(payload.counts.totalAccounts).toBe(0);
    expect(payload.recentSignups).toEqual([]);
    expect(payload.recentApprovalActions).toEqual([]);
  });

  it("counts live accounts by canonical role and approval posture", async () => {
    stageRealAccountRows();

    const payload = await getArchitectDashboardPayload(founder);

    expect(payload.counts.totalAccounts).toBe(5);
    expect(payload.counts.totalClients).toBe(2);
    expect(payload.counts.totalBarbers).toBe(1);
    expect(payload.counts.totalShopOwners).toBe(1);
    expect(payload.counts.totalPlatformAdmins).toBe(1);
    expect(payload.counts.pendingBarberApprovals).toBe(1);
    expect(payload.counts.pendingShopOwnerApprovals).toBe(1);
  });

  it("searches real barber and shop-owner accounts from the all-account directory", async () => {
    stageRealAccountRows();

    const barberPayload = await getArchitectAccountDirectoryPayload(founder, { search: "phillipmcgee813@gmail.com", role: "all", status: "all" });
    const ownerPayload = await getArchitectAccountDirectoryPayload(founder, { search: "BVRB3R Studio", role: "all", status: "all" });

    expect(barberPayload.accounts).toHaveLength(1);
    expect(barberPayload.accounts[0]?.profileId).toBe("profile-barber");
    expect(ownerPayload.accounts).toHaveLength(1);
    expect(ownerPayload.accounts[0]?.profileId).toBe("profile-owner");
  });

  it("does not drop real profile-backed accounts when auth user listing is unavailable", async () => {
    stageArchitectAccountRowsForTests({
      authUsers: [],
      profiles: [
        {
          id: "profile-barber",
          role: "barber",
          primary_onboarding_role: "barber",
          onboarding_state: "complete",
          full_name: "Phillip McGee",
          email: "phillipmcgee813@gmail.com",
          phone: "8135550101",
          created_at: "2026-04-02T12:00:00.000Z"
        },
        {
          id: "profile-owner",
          role: "shop_owner",
          primary_onboarding_role: "shop_owner",
          onboarding_state: "complete",
          full_name: "BVRB3R Shop",
          email: "bvrb3r@gmail.com",
          phone: "8135550202",
          created_at: "2026-04-03T12:00:00.000Z"
        }
      ],
      barbers: [
        {
          id: "barber-1",
          reference_code: "barber-ref-1",
          profile_id: "profile-barber",
          compensation_model: "commission",
          barber_subtype: "solo",
          app_approval_status: "pending",
          shop_approval_status: "pending"
        }
      ],
      shops: [
        {
          id: "shop-1",
          name: "BVRB3R Studio",
          owner_profile_id: "profile-owner",
          app_approval_status: "pending",
          city: "Tampa",
          state: "FL",
          phone: "8135550303"
        }
      ]
    });

    const payload = await getArchitectAccountDirectoryPayload(founder, { role: "all", status: "all" });
    const emails = payload.accounts.map((account) => account.email);

    expect(payload.counts.totalAccounts).toBe(2);
    expect(emails).toContain("phillipmcgee813@gmail.com");
    expect(emails).toContain("bvrb3r@gmail.com");
  });

  it("does not drop lane-backed accounts when profile and verification rows are incomplete", async () => {
    stageArchitectAccountRowsForTests({
      authUsers: [],
      profiles: [],
      clients: [
        {
          id: "client-1",
          reference_code: "client-ref-1",
          profile_id: "profile-client",
          created_at: "2026-04-01T12:00:00.000Z"
        }
      ],
      barbers: [
        {
          id: "barber-1",
          reference_code: "barber-ref-1",
          profile_id: "profile-barber",
          compensation_model: "commission",
          barber_subtype: "solo",
          app_approval_status: "pending",
          shop_approval_status: "pending",
          created_at: "2026-04-02T12:00:00.000Z"
        }
      ],
      shops: [
        {
          id: "shop-1",
          name: "Fallback Shop",
          owner_profile_id: "profile-owner",
          app_approval_status: "pending",
          city: "Tampa",
          state: "FL"
        }
      ]
    });

    const allPayload = await getArchitectAccountDirectoryPayload(founder, { role: "all", status: "all" });
    const barberPayload = await getArchitectAccountDirectoryPayload(founder, { role: "barber", status: "all" });
    const ownerPayload = await getArchitectAccountDirectoryPayload(founder, { search: "Fallback Shop", role: "all", status: "all" });

    expect(allPayload.counts.totalAccounts).toBe(3);
    expect(barberPayload.accounts[0]).toMatchObject({
      profileId: "profile-barber",
      role: "barber",
      profileExists: false
    });
    expect(ownerPayload.accounts[0]).toMatchObject({
      profileId: "profile-owner",
      role: "shop_owner",
      shopName: "Fallback Shop"
    });
  });

  it("searches by normalized phone and surfaces auth provider identity", async () => {
    stageRealAccountRows();

    const barberPayload = await getArchitectAccountDirectoryPayload(founder, { search: "(813) 555-0101", role: "all", status: "all" });
    const googlePayload = await getArchitectAccountDirectoryPayload(founder, { search: "google", role: "all", status: "all" });
    const applePayload = await getArchitectAccountDirectoryPayload(founder, { search: "apple-client@icloud.com", role: "all", status: "all" });

    expect(barberPayload.accounts[0]?.profileId).toBe("profile-barber");
    expect(barberPayload.accounts[0]?.phoneVerified).toBe(true);
    expect(googlePayload.accounts[0]?.profileId).toBe("profile-owner");
    expect(googlePayload.accounts[0]?.authProvider).toBe("google");
    expect(applePayload.accounts[0]).toMatchObject({
      profileId: "auth-apple-client",
      profileExists: false,
      authProvider: "apple",
      accountStatus: "profile_only"
    });
  });

  it("filters by onboarding state without requiring verification rows", async () => {
    stageRealAccountRows();

    const payload = await getArchitectAccountDirectoryPayload(founder, { onboarding: "missing_profile" });

    expect(payload.accounts.map((account) => account.profileId)).toEqual(["auth-apple-client"]);
    expect(payload.accounts[0]?.verificationStatus).toBe("missing_verification_profile");
  });

  it("opens account detail from real profile data even when marketplace approval is still blocked", async () => {
    stageRealAccountRows();

    const payload = await getArchitectAccountDetailPayload(founder, "profile-barber");

    expect(payload.account?.email).toBe("phillipmcgee813@gmail.com");
    expect(payload.account?.profile.exists).toBe(true);
    expect(payload.account?.authIdentity?.providers).toEqual(["email"]);
    expect(payload.account?.barber?.id).toBe("barber-1");
    expect(payload.account?.documents).toHaveLength(1);
    expect(payload.account?.reviews).toHaveLength(1);
    expect(payload.account?.marketplaceBlockers).toContain("Barber approval pending");
    expect(payload.account?.verificationProfiles[0]?.id).toBe("verification-barber");
  });

  it("does not fabricate known demo marketplace names in architect account payloads", async () => {
    stageRealAccountRows();

    const payload = await getArchitectAccountDirectoryPayload(founder, { role: "all", status: "all" });
    const names = payload.accounts.map((account) => account.fullName).join(" ");

    expect(names).not.toMatch(/Wave Carter/i);
    expect(names).not.toMatch(/Blaze King/i);
  });
});
