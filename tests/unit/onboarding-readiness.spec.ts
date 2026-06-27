import { describe, expect, it } from "vitest";
import { ONBOARDING_AUDIT_EVENT_NAMES } from "@/lib/onboarding/actions";
import {
  BARBER_MORE_SUBTITLES,
  CLIENT_MORE_SUBTITLES,
  SHOP_OWNER_MORE_SUBTITLES
} from "@/lib/onboarding/requirements";
import {
  buildOnboardingReadiness,
  isCanonicalPublicAccountRole,
  resolveRoleScope
} from "@/lib/onboarding/readiness";
import type { OnboardingReadinessContext, ReadinessKey } from "@/lib/onboarding/types";

const clientAccount: OnboardingReadinessContext = {
  authenticated: true,
  authMethodConnected: true,
  role: "client_user",
  name: "Jordan Ellis",
  username: "jordan",
  email: "jordan@example.com",
  phone: "8135550101",
  termsAccepted: true,
  trustRulesAccepted: true
};

const bookingReady = {
  selectedProviderId: "barber-wave",
  selectedServiceId: "srv-cut",
  selectedTime: "2026-08-01T15:00:00.000Z",
  paymentRequired: true,
  paymentMethodReference: "provider-payment-method-reference",
  policyAccepted: true,
  serverProofConnected: true
};

const barberAccount: OnboardingReadinessContext = {
  authenticated: true,
  authMethodConnected: true,
  role: "barber_user",
  name: "Wave Carter",
  username: "wave",
  email: "wave@example.com",
  phone: "8135550102",
  termsAccepted: true,
  trustRulesAccepted: true
};

const shopOwnerAccount: OnboardingReadinessContext = {
  authenticated: true,
  authMethodConnected: true,
  role: "shop_owner_user",
  name: "Avery Owner",
  username: "averyshop",
  email: "owner@example.com",
  phone: "8135550103",
  termsAccepted: true,
  trustRulesAccepted: true
};

const completeShop = {
  ownerAuthority: true,
  shopRecordId: "shop-ybor",
  shopName: "BVRB3R Ybor",
  shopUsername: "bvrb3r-ybor",
  location: "Ybor City, Tampa",
  hours: "Mon-Sat",
  chairCount: 6,
  operatingModel: "mixed",
  bookingMode: "scheduled_and_walk_in",
  policiesAccepted: true,
  paymentModel: "platform_payments",
  verificationPosture: "approved" as const
};

describe("onboarding readiness engine", () => {
  it("returns Browse Ready for public context without treating guest as a role", () => {
    const result = buildOnboardingReadiness({ city: "Tampa", intent: "book a cut" });

    expect(result.roleScope).toBe("guest");
    expect(resolveRoleScope(undefined, false)).toBe("guest");
    expect(result.readiness.publicGuest.status).toBe("pass");
    expect(result.readiness.browse.status).toBe("pass");
    expect(result.readiness.browse.missingRequirements).toHaveLength(0);
    expect(result.readiness.account.status).toBe("needs_setup");
    expect(isCanonicalPublicAccountRole("guest_user")).toBe(false);
  });

  it("requires controlled account role, identity, contact, and trust acceptance", () => {
    const missing = buildOnboardingReadiness({ authenticated: true, role: "client_user", name: "Jordan" });
    expect(missing.readiness.account.status).toBe("needs_setup");
    expect(missing.readiness.account.missingRequirements.map((requirement) => requirement.label)).toEqual(expect.arrayContaining([
      "Claim your BVRB3R name",
      "Add email or phone",
      "Accept BVRB3R trust rules"
    ]));

    const complete = buildOnboardingReadiness(clientAccount);
    expect(complete.roleScope).toBe("client");
    expect(complete.readiness.account.status).toBe("pass");
    expect(complete.canEnterDashboard).toBe(true);
  });

  it("blocks arbitrary and forbidden public role values", () => {
    const forbiddenRoles = [
      "guest_user",
      "architect_user",
      "pro_barber",
      "elite_client",
      "freelance_barber",
      "booth_rent_barber",
      "commission_barber"
    ];

    forbiddenRoles.forEach((role) => {
      const result = buildOnboardingReadiness({ ...clientAccount, role });
      expect(result.roleScope).toBe("unknown");
      expect(result.readiness.account.status).toBe("blocked");
      expect(result.canEnterDashboard).toBe(false);
    });
  });

  it("requires booking identity, service, time, policy, and payment method only when payment is required", () => {
    const missing = buildOnboardingReadiness({
      ...clientAccount,
      booking: {
        selectedProviderId: "barber-wave",
        selectedServiceId: "srv-cut",
        paymentRequired: true,
        policyAccepted: false
      }
    });

    expect(missing.readiness.booking.status).toBe("needs_setup");
    expect(missing.readiness.booking.missingRequirements.map((requirement) => requirement.label)).toEqual(expect.arrayContaining([
      "Choose a time",
      "Add a payment method",
      "Accept booking policy"
    ]));

    const noPaymentRequired = buildOnboardingReadiness({
      ...clientAccount,
      booking: {
        selectedProviderId: "barber-wave",
        selectedServiceId: "srv-cut",
        selectedTime: "2026-08-01T15:00:00.000Z",
        paymentRequired: false,
        policyAccepted: true,
        serverProofConnected: true
      }
    });
    expect(noPaymentRequired.readiness.booking.status).toBe("pass");
    expect(noPaymentRequired.canPerformSeriousActions).toBe(true);
  });

  it("keeps unsupported culture posting gated without creating fake readiness", () => {
    const result = buildOnboardingReadiness({
      ...clientAccount,
      culture: { supported: false, postingSupported: false }
    });

    expect(result.readiness.culture.status).toBe("not_applicable");
    expect(result.readiness.culture.blockedActions.map((action) => action.label)).toContain("Accept culture rules");
  });

  it("passes Culture Ready only from supported culture proof and active standing", () => {
    const result = buildOnboardingReadiness({
      ...clientAccount,
      culture: {
        supported: true,
        postingSupported: true,
        profileVisible: true,
        rulesAccepted: true,
        accountStanding: "active"
      }
    });

    expect(result.readiness.culture.status).toBe("pass");
  });

  it("requires service, price, duration, schedule, and booking mode for Barber Business Ready", () => {
    const missing = buildOnboardingReadiness({
      ...barberAccount,
      barberBusiness: {
        barberRecordId: "barber-wave",
        displayName: "Wave Carter",
        username: "wave",
        safeProfilePlaceholderAllowed: true,
        activeServiceCount: 0,
        hasPrice: false,
        hasDuration: false,
        hasSchedule: false
      }
    });

    expect(missing.readiness.barberBusiness.status).toBe("needs_setup");
    expect(missing.readiness.barberBusiness.missingRequirements.map((requirement) => requirement.label)).toEqual(expect.arrayContaining([
      "Add your first active service",
      "Add service price",
      "Add service duration",
      "Set your schedule",
      "Choose booking mode"
    ]));
    expect(missing.canPerformSeriousActions).toBe(false);

    const ready = buildOnboardingReadiness({
      ...barberAccount,
      barberBusiness: {
        barberRecordId: "barber-wave",
        displayName: "Wave Carter",
        username: "wave",
        safeProfilePlaceholderAllowed: true,
        activeServiceCount: 1,
        hasPrice: true,
        hasDuration: true,
        hasSchedule: true,
        bookingMode: "scheduled"
      }
    });
    expect(ready.readiness.barberBusiness.status).toBe("pass");
    expect(ready.canPerformSeriousActions).toBe(true);
  });

  it("never marks Payout Ready from frontend-only state or missing provider truth", () => {
    const frontendOnly = buildOnboardingReadiness({
      ...barberAccount,
      payout: {
        paymentLaneSelected: true,
        provider: "stripe",
        providerTruthConnected: false,
        frontendOnly: true,
        identityVerified: true,
        providerPayoutStatus: "ready",
        termsAccepted: true
      }
    });
    expect(frontendOnly.readiness.payout.status).toBe("needs_review");
    expect(frontendOnly.readiness.payout.proofConnected).toBe(false);

    const providerReady = buildOnboardingReadiness({
      ...barberAccount,
      payout: {
        paymentLaneSelected: true,
        provider: "stripe",
        providerTruthConnected: true,
        identityVerified: true,
        providerPayoutStatus: "ready",
        termsAccepted: true
      }
    });
    expect(providerReady.readiness.payout.status).toBe("pass");
  });

  it("requires authority, identity, location, hours, chairs, operating model, booking mode, policies, payment model, and verification for Shop Ready", () => {
    const missing = buildOnboardingReadiness({
      ...shopOwnerAccount,
      shop: {
        ownerAuthority: true,
        shopRecordId: "shop-ybor",
        shopName: "BVRB3R Ybor",
        shopUsername: "bvrb3r-ybor",
        chairCount: 0,
        verificationPosture: "pending"
      }
    });

    expect(missing.readiness.shop.status).toBe("needs_setup");
    expect(missing.readiness.shop.missingRequirements.map((requirement) => requirement.label)).toEqual(expect.arrayContaining([
      "Add shop location",
      "Add shop hours",
      "Add chair count",
      "Choose operating model",
      "Choose shop booking mode",
      "Finish shop policies",
      "Choose shop payment model",
      "Finish shop verification"
    ]));
  });

  it("blocks Kiosk Ready until Shop Ready and kiosk requirements are complete", () => {
    const blocked = buildOnboardingReadiness({
      ...shopOwnerAccount,
      shop: { ...completeShop, location: null },
      kiosk: {
        shopActive: true,
        chairsActive: true,
        teamEligible: true,
        bookingModeSet: true,
        walkInModeSet: true,
        sessionRules: true,
        rotationMode: true,
        notificationSetup: true
      }
    });

    expect(blocked.readiness.shop.status).toBe("needs_setup");
    expect(blocked.readiness.kiosk.status).toBe("blocked");
    expect(blocked.readiness.kiosk.missingRequirements.map((requirement) => requirement.label)).toContain("Finish shop setup first");

    const ready = buildOnboardingReadiness({
      ...shopOwnerAccount,
      shop: completeShop,
      kiosk: {
        shopActive: true,
        chairsActive: true,
        teamEligible: true,
        bookingModeSet: true,
        walkInModeSet: true,
        sessionRules: true,
        rotationMode: true,
        notificationSetup: true
      }
    });
    expect(ready.readiness.kiosk.status).toBe("pass");
  });

  it("always returns a next best action when readiness is incomplete", () => {
    const result = buildOnboardingReadiness({ authenticated: true, role: "client_user" });

    Object.keys(result.readiness).forEach((key) => {
      const section = result.readiness[key as ReadinessKey];
      if (section.status !== "pass" && section.status !== "not_applicable") {
        expect(section.nextBestAction.label).not.toHaveLength(0);
        expect(section.nextBestAction.description).not.toHaveLength(0);
      }
    });
    expect(result.nextBestAction.label).not.toHaveLength(0);
  });

  it("keeps missing requirement labels human-readable", () => {
    const result = buildOnboardingReadiness({ authenticated: true, role: "client_user" });
    const labels = result.missingCriticalRequirements.map((requirement) => requirement.label).join(" ");

    expect(labels).toContain("Choose Client, Barber, or Shop Owner");
    expect(labels).not.toMatch(/profiles\.role|client_user|barber_user|shop_owner_user|guest_user|payment_routing_records/);
  });

  it("keeps More metadata inside existing subtitle sets only", () => {
    expect(CLIENT_MORE_SUBTITLES).toEqual([
      "BVRB3R App Settings",
      "Client Content Creator Settings",
      "Payments & Banking",
      "Compliance & Security",
      "Support",
      "Account session"
    ]);
    expect(BARBER_MORE_SUBTITLES).toEqual([
      "BVRB3R App Settings",
      "Barber Business Settings",
      "Payments & Banking",
      "Compliance & Security",
      "Support",
      "Account session"
    ]);
    expect(SHOP_OWNER_MORE_SUBTITLES).toEqual([
      "BVRB3R App Settings",
      "SHOP BUSINESS SETTINGS",
      "Payments & Banking",
      "Compliance & Security",
      "Support",
      "Account session"
    ]);
  });

  it("defines typed audit event hints without writing events", () => {
    const result = buildOnboardingReadiness({ authenticated: true, role: "client_user" });

    expect(ONBOARDING_AUDIT_EVENT_NAMES).toContain("onboarding_started");
    expect(ONBOARDING_AUDIT_EVENT_NAMES).toContain("dashboard_opened");
    expect(result.auditEventHint.persistence).toBe("typed_hint_only");
  });

  it("keeps platform internal accounts out of public onboarding role completion", () => {
    const result = buildOnboardingReadiness({ authenticated: true, role: "platform_admin" });

    expect(result.roleScope).toBe("platform_internal");
    expect(result.readiness.account.status).toBe("not_applicable");
    expect(result.safeHomeFallback).toBe("/architect");
  });
});
