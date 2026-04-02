import { beforeEach, describe, expect, it } from "vitest";
import { resolveDemoUser } from "@/lib/auth/demo-auth";
import {
  syncStripeConnectVerificationLane,
  syncStripeIdentityVerificationLane
} from "@/lib/trust/provider-sync";
import { getTrustState, resetTrustState, setTrustState } from "@/lib/trust/state";

describe("verification provider sync", () => {
  beforeEach(() => {
    resetTrustState();
  });

  it("maps Stripe Identity verification into the canonical barber lane", async () => {
    const barber = resolveDemoUser("fade@bvrb3r.demo");

    const result = await syncStripeIdentityVerificationLane({
      userId: barber.id,
      barberId: barber.barberId!,
      verificationProfileId: "vprof-barber-fade",
      sessionId: "vs_identity_fade",
      providerStatus: "verified",
      lastEventId: "evt_identity_verified",
      lastEventType: "identity.verification_session.verified",
      livemode: false
    });

    const state = getTrustState();
    const identityRecord = state.barberVerifications.find((record) =>
      record.barberId === barber.barberId && record.category === "identity_verification"
    );
    const providerLink = (state.verificationProviderLinks ?? []).find((record) =>
      record.verificationProfileId === result.profile.id && record.providerSubject === "identity_session"
    );

    expect(result.profile.identityStatus).toBe("approved");
    expect(identityRecord?.providerIdentityStatus).toBe("verified");
    expect(providerLink?.providerStatus).toBe("verified");
  });

  it("maps Stripe Connect readiness into the canonical shop-owner lane", async () => {
    const owner = resolveDemoUser("owner@bvrb3r.demo");

    const result = await syncStripeConnectVerificationLane({
      role: "shop_owner",
      userId: owner.id,
      shopId: "shop-bvrb3r",
      verificationProfileId: "vprof-shop-bvrb3r",
      providerAccountId: "acct_shop_ready",
      providerStatus: "payouts_enabled",
      onboardingStatus: "verified",
      operationalStatus: "payout_ready",
      payoutReadinessStatus: "ready",
      legalReadinessStatus: "accepted",
      taxReadinessStatus: "verified",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirementsCurrentlyDue: [],
      requirementsEventuallyDue: [],
      requirementsPastDue: [],
      missingAgreements: [],
      outdatedAgreements: [],
      missingSteps: [],
      disabledReason: null,
      processorLastEventId: "evt_account_updated",
      processorLastEventType: "account.updated",
      lastCheckedAt: "2026-04-01T10:00:00.000Z"
    });

    expect(result.profile.payoutStatus).toBe("approved");
    expect(result.profile.complianceStatus).toBe("approved");
    expect(result.profile.canReceivePayouts).toBe(true);
  });

  it("keeps barber and shop-owner provider links isolated for one account", async () => {
    const owner = resolveDemoUser("owner@bvrb3r.demo");
    const current = getTrustState();

    setTrustState({
      ...current,
      verificationProfiles: [
        ...(current.verificationProfiles ?? []),
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
        },
        {
          id: "vprof-shop-owner-dual",
          userId: owner.id,
          role: "shop_owner",
          overallStatus: "submitted",
          identityStatus: "not_started",
          licenseStatus: "not_started",
          businessStatus: "approved",
          payoutStatus: "submitted",
          complianceStatus: "submitted",
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
          id: "verify-owner-barber-payout",
          barberId: "barber-owner",
          category: "payout_verification",
          legalName: "Owner Operator",
          userId: owner.id,
          verificationProfileId: "vprof-owner-barber",
          verificationStatus: "submitted",
          payoutStatus: "submitted",
          complianceStatus: "approved",
          updatedAt: "2026-03-10T09:00:00-05:00"
        }
      ],
      shopVerifications: [
        ...current.shopVerifications,
        {
          id: "shop-verify-owner-business",
          shopId: "shop-owner-dual",
          category: "business_verification",
          businessName: "Owner Dual Shop LLC",
          userId: owner.id,
          verificationProfileId: "vprof-shop-owner-dual",
          verificationStatus: "approved",
          payoutStatus: "submitted",
          complianceStatus: "submitted",
          updatedAt: "2026-03-10T09:00:00-05:00"
        }
      ]
    });

    await syncStripeConnectVerificationLane({
      role: "barber",
      userId: owner.id,
      barberId: "barber-owner",
      verificationProfileId: "vprof-owner-barber",
      providerAccountId: "acct_owner_barber",
      providerStatus: "requirements_due",
      onboardingStatus: "submitted",
      operationalStatus: "pending_verification",
      payoutReadinessStatus: "not_ready",
      legalReadinessStatus: "accepted",
      taxReadinessStatus: "submitted",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: true,
      requirementsCurrentlyDue: ["external_account"],
      requirementsEventuallyDue: [],
      requirementsPastDue: [],
      missingAgreements: [],
      outdatedAgreements: [],
      missingSteps: ["Current requirement: external_account"],
      disabledReason: null
    });

    await syncStripeConnectVerificationLane({
      role: "shop_owner",
      userId: owner.id,
      shopId: "shop-owner-dual",
      verificationProfileId: "vprof-shop-owner-dual",
      providerAccountId: "acct_owner_shop",
      providerStatus: "payouts_enabled",
      onboardingStatus: "verified",
      operationalStatus: "payout_ready",
      payoutReadinessStatus: "ready",
      legalReadinessStatus: "accepted",
      taxReadinessStatus: "verified",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirementsCurrentlyDue: [],
      requirementsEventuallyDue: [],
      requirementsPastDue: [],
      missingAgreements: [],
      outdatedAgreements: [],
      missingSteps: [],
      disabledReason: null
    });

    const state = getTrustState();
    const barberLink = (state.verificationProviderLinks ?? []).find((record) => record.verificationProfileId === "vprof-owner-barber");
    const shopLink = (state.verificationProviderLinks ?? []).find((record) => record.verificationProfileId === "vprof-shop-owner-dual");
    const barberProfile = (state.verificationProfiles ?? []).find((record) => record.id === "vprof-owner-barber");
    const shopProfile = (state.verificationProfiles ?? []).find((record) => record.id === "vprof-shop-owner-dual");

    expect(barberLink?.providerReferenceId).toBe("acct_owner_barber");
    expect(shopLink?.providerReferenceId).toBe("acct_owner_shop");
    expect(barberProfile?.canReceivePayouts).toBe(false);
    expect(shopProfile?.canReceivePayouts).toBe(true);
  });
});
