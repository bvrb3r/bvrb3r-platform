import { describe, expect, it } from "vitest";
import {
  SHOP_OWNER_ONBOARDING_EVENT_HINTS,
  SHOP_OWNER_ONBOARDING_MORE_METADATA,
  buildShopOwnerOnboardingReadiness,
  canUseShopBookingMode,
  chairEstimateForRange,
  cleanShopUsername,
  getShopInviteLink,
  getShopOwnerHomeFallbackPrompts,
  hasCompleteShopHours,
  hasCompleteShopLocation,
  isAllowedShopOwnerOnboardingRole,
  usesOnlyApprovedShopOwnerMoreSubtitles,
  type ShopOwnerOnboardingDraft
} from "@/lib/onboarding/shop-owner-path";
import { RETIRED_REVENUE_SHARE_ACCOUNT_ROLE } from "@/lib/doctrine/legacy-data-aliases";

const completeDraft: ShopOwnerOnboardingDraft = {
  authenticated: true,
  role: "shop_owner_user",
  ownerName: "Avery Owner",
  email: "owner@example.com",
  phone: "8135550103",
  shopRecordId: "shop-private-id",
  shopName: "BVRB3R Ybor",
  shopDisplayName: "BVRB3R Ybor",
  shopUsername: "bvrb3r-ybor",
  usernameAvailable: true,
  ownerAuthorityType: "owner",
  authorityRequiresReview: false,
  addressLine1: "123 Main St",
  city: "Tampa",
  state: "FL",
  zipCode: "33602",
  locationCaptureMethod: "full_address",
  hoursType: "custom",
  availableDays: ["Monday", "Tuesday"],
  startTime: "09:00",
  endTime: "18:00",
  timezone: "America/New_York",
  chairRange: "4_6",
  estimatedChairCount: 6,
  operatingModel: "mixed",
  bookingMode: "pick_barber",
  paymentModel: "barber_direct",
  providerTruthConnected: false,
  shopMoneySetupStatus: "needs_review",
  policiesChoice: "standard",
  policiesAccepted: true,
  verificationPosture: "approved"
};

describe("shop owner onboarding readiness path", () => {
  it("allows only the canonical Shop Owner public account role", () => {
    expect(isAllowedShopOwnerOnboardingRole("shop_owner_user")).toBe(true);
    ["guest_user", "architect_user", "owner", "shop_owner", "pro_owner", "elite_owner", "booth_rent_barber", RETIRED_REVENUE_SHARE_ACCOUNT_ROLE].forEach((role) => {
      expect(isAllowedShopOwnerOnboardingRole(role)).toBe(false);
      const result = buildShopOwnerOnboardingReadiness({ ...completeDraft, role });
      expect(result.roleScope === "unknown" || result.roleScope === "platform_internal").toBe(true);
      expect(result.canPerformSeriousActions).toBe(false);
    });
  });

  it("keeps Shop Ready gated until authority, shop, location, hours, chairs, model, policies, payment, and verification exist", () => {
    const missing = buildShopOwnerOnboardingReadiness({
      authenticated: true,
      role: "shop_owner_user",
      ownerName: "Avery Owner",
      email: "owner@example.com",
      phone: "8135550103"
    });

    expect(missing.readiness.shop.status).toBe("needs_setup");
    expect(missing.readiness.shop.missingRequirements.map((requirement) => requirement.label)).toEqual(expect.arrayContaining([
      "Confirm shop owner authority",
      "Create shop record",
      "Add shop name",
      "Claim shop BVRB3R name",
      "Add shop location",
      "Add shop hours",
      "Add chair count",
      "Choose operating model",
      "Choose shop booking mode",
      "Finish shop policies",
      "Choose shop payment model",
      "Finish shop verification"
    ]));

    const ready = buildShopOwnerOnboardingReadiness(completeDraft);
    expect(ready.readiness.shop.status).toBe("pass");
    expect(ready.canPerformSeriousActions).toBe(true);
  });

  it("does not fake owner money or payout readiness from payment model selection", () => {
    const autoBooth = buildShopOwnerOnboardingReadiness({
      ...completeDraft,
      paymentModel: "autobooth_bvrb3r_pay",
      providerTruthConnected: false,
      shopMoneySetupStatus: "needs_review"
    });

    expect(autoBooth.readiness.payout.status).toBe("needs_review");
    expect(autoBooth.readiness.payout.proofConnected).toBe(false);

    const boothRent = buildShopOwnerOnboardingReadiness({
      ...completeDraft,
      paymentModel: "booth_rent_tracking",
      providerTruthConnected: false
    });
    expect(boothRent.readiness.payout.status).toBe("needs_review");

    const deferred = buildShopOwnerOnboardingReadiness({
      ...completeDraft,
      paymentModel: "setup_later"
    });
    expect(deferred.readiness.shop.status).toBe("needs_setup");
  });

  it("keeps Kiosk Ready blocked or incomplete without real team, chair, walk-in, session, rotation, and notification proof", () => {
    const incompleteShop = buildShopOwnerOnboardingReadiness({ ...completeDraft, addressLine1: "" });
    expect(incompleteShop.readiness.kiosk.status).toBe("blocked");

    const uiOnly = buildShopOwnerOnboardingReadiness(completeDraft);
    expect(uiOnly.readiness.shop.status).toBe("pass");
    expect(uiOnly.readiness.kiosk.status).toBe("needs_setup");
    expect(uiOnly.readiness.kiosk.missingRequirements.map((requirement) => requirement.label)).toEqual(expect.arrayContaining([
      "Activate shop before kiosk",
      "Activate chairs",
      "Confirm team eligibility",
      "Set walk-in mode",
      "Set kiosk session rules",
      "Choose rotation mode",
      "Set kiosk notifications"
    ]));
  });

  it("validates location, hours, chairs, and booking mode without faking unsupported modes", () => {
    expect(cleanShopUsername(" BVRB3R Ybor! ")).toBe("bvrb3rybor");
    expect(chairEstimateForRange("4_6")).toBe(6);
    expect(chairEstimateForRange("not_sure")).toBeNull();
    expect(hasCompleteShopLocation(completeDraft)).toBe(true);
    expect(hasCompleteShopLocation({ ...completeDraft, locationCaptureMethod: "city_first" })).toBe(false);
    expect(hasCompleteShopHours(completeDraft)).toBe(true);
    expect(hasCompleteShopHours({ ...completeDraft, hoursType: "set_later" })).toBe(false);
    expect(canUseShopBookingMode("pick_barber", completeDraft)).toBe(true);
    expect(canUseShopBookingMode("next_available", completeDraft)).toBe(false);
    expect(canUseShopBookingMode("shop_controlled", completeDraft)).toBe(false);
    expect(canUseShopBookingMode("both", completeDraft)).toBe(false);
  });

  it("keeps invite links public-safe and Home fallback prompts honest", () => {
    expect(getShopInviteLink(completeDraft)).toBe("/shop/bvrb3r-ybor/team");
    expect(getShopInviteLink({ shopName: "Draft Shop" })).toBe("/dashboard/owner/team");
    expect(getShopOwnerHomeFallbackPrompts({
      ...completeDraft,
      paymentModel: "setup_later",
      inviteSkipped: true,
      verificationPosture: "pending"
    })).toEqual(expect.arrayContaining([
      "Finish shop money setup.",
      "Invite your first barber.",
      "Prepare kiosk.",
      "Complete shop verification."
    ]));
  });

  it("uses only existing Shop Owner More subtitles and defines typed event hints only", () => {
    expect(usesOnlyApprovedShopOwnerMoreSubtitles()).toBe(true);
    expect(SHOP_OWNER_ONBOARDING_MORE_METADATA.map((entry) => entry.subtitle)).toEqual(expect.arrayContaining([
      "BVRB3R App Settings",
      "SHOP BUSINESS SETTINGS",
      "Payments & Banking",
      "Compliance & Security"
    ]));
    expect(SHOP_OWNER_ONBOARDING_MORE_METADATA.map((entry) => entry.subtitle)).not.toEqual(expect.arrayContaining([
      "Shop Profile",
      "Location",
      "Hours / Closures",
      "Kiosk",
      "Setup Checklist"
    ]));
    expect(SHOP_OWNER_ONBOARDING_EVENT_HINTS).toEqual(expect.arrayContaining([
      "shop_owner_setup_started",
      "shop_payment_model_deferred",
      "first_barber_invite_skipped",
      "shop_owner_onboarding_completed"
    ]));
  });
});
