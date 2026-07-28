import { describe, expect, it } from "vitest";
import {
  BARBER_ONBOARDING_EVENT_HINTS,
  BARBER_ONBOARDING_MORE_METADATA,
  buildBarberOnboardingReadiness,
  canUseBookingMode,
  cleanBarberUsername,
  dollarsToCents,
  getBarberBookingLink,
  getBarberHomeFallbackPrompts,
  hasValidSchedule,
  isAllowedBarberOnboardingRole,
  usesOnlyApprovedBarberMoreSubtitles,
  validateServiceDurationMinutes,
  type BarberOnboardingDraft
} from "@/lib/onboarding/barber-path";
import { RETIRED_REVENUE_SHARE_ACCOUNT_ROLE } from "@/lib/doctrine/legacy-data-aliases";

const completeDraft: BarberOnboardingDraft = {
  authenticated: true,
  role: "barber_user",
  barberRecordId: "barber-wave-private-id",
  displayName: "Wave Carter",
  publicUsername: "wave",
  usernameAvailable: true,
  email: "wave@example.com",
  phone: "8135550102",
  specialties: ["fades"],
  firstServiceName: "Signature Cut",
  servicePriceCents: 4500,
  serviceDurationMinutes: 45,
  availableDays: ["Monday", "Tuesday"],
  startTime: "09:00",
  endTime: "17:00",
  timezone: "America/New_York",
  bookingMode: "instant",
  paymentLane: "bvrb3r_pay",
  providerTruthConnected: false,
  providerPayoutStatus: "unknown",
  identityVerified: false,
  payoutTermsAccepted: false
};

describe("barber onboarding readiness path", () => {
  it("allows only the canonical Barber role for public onboarding", () => {
    expect(isAllowedBarberOnboardingRole("barber_user")).toBe(true);
    expect(isAllowedBarberOnboardingRole("freelance_barber")).toBe(false);
    expect(isAllowedBarberOnboardingRole("booth_rent_barber")).toBe(false);
    expect(isAllowedBarberOnboardingRole(RETIRED_REVENUE_SHARE_ACCOUNT_ROLE)).toBe(false);
    expect(isAllowedBarberOnboardingRole("shop_owner_user")).toBe(false);

    const forbidden = buildBarberOnboardingReadiness({
      ...completeDraft,
      role: "freelance_barber"
    });

    expect(forbidden.roleScope).toBe("unknown");
    expect(forbidden.readiness.account.status).toBe("blocked");
    expect(forbidden.canEnterDashboard).toBe(false);
  });

  it("keeps Barber Business Ready gated until service, price, duration, schedule, and booking mode exist", () => {
    const missing = buildBarberOnboardingReadiness({
      authenticated: true,
      role: "barber_user",
      displayName: "Wave Carter",
      publicUsername: "wave",
      usernameAvailable: true,
      email: "wave@example.com",
      phone: "8135550102"
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

    const ready = buildBarberOnboardingReadiness(completeDraft);
    expect(ready.readiness.barberBusiness.status).toBe("pass");
  });

  it("does not fake Payout Ready from selected frontend payment lanes", () => {
    const bvrb3rPay = buildBarberOnboardingReadiness(completeDraft);

    expect(bvrb3rPay.readiness.payout.status).toBe("needs_review");
    expect(bvrb3rPay.readiness.payout.proofConnected).toBe(false);

    const squareGrowth = buildBarberOnboardingReadiness({
      ...completeDraft,
      paymentLane: "square_growth",
      providerTruthConnected: false
    });
    expect(squareGrowth.readiness.payout.status).toBe("needs_review");

    const providerReady = buildBarberOnboardingReadiness({
      ...completeDraft,
      providerTruthConnected: true,
      providerPayoutStatus: "ready",
      identityVerified: true,
      payoutTermsAccepted: true
    });
    expect(providerReady.readiness.payout.status).toBe("pass");
  });

  it("validates booking mode only from connected service and schedule metadata", () => {
    expect(canUseBookingMode("request", completeDraft)).toBe(false);
    expect(canUseBookingMode("shop_controlled", completeDraft)).toBe(false);
    expect(canUseBookingMode("instant", completeDraft)).toBe(true);
    expect(canUseBookingMode("invite_link_only", completeDraft)).toBe(true);
    expect(canUseBookingMode("instant", { ...completeDraft, startTime: "17:00", endTime: "09:00" })).toBe(false);
  });

  it("generates public booking links without leaking private record ids", () => {
    expect(getBarberBookingLink(completeDraft)).toEqual({
      href: "/barber/wave",
      reason: null
    });
    expect(getBarberBookingLink({ ...completeDraft, publicUsername: "" }).reason).toMatch(/Public username/i);
    expect(getBarberBookingLink({ ...completeDraft, firstServiceName: "" }).reason).toMatch(/real service/i);
    expect(getBarberBookingLink({ ...completeDraft, availableDays: [] }).reason).toMatch(/open times/i);
  });

  it("keeps helper conversions and fallback prompts honest", () => {
    expect(cleanBarberUsername(" Wave Carter! ")).toBe("wavecarter");
    expect(dollarsToCents("$45.50")).toBe(4550);
    expect(validateServiceDurationMinutes("45")).toBe(45);
    expect(validateServiceDurationMinutes("8")).toBeNull();
    expect(hasValidSchedule(completeDraft)).toBe(true);
    expect(hasValidSchedule({ ...completeDraft, startTime: "17:00", endTime: "09:00" })).toBe(false);

    expect(getBarberHomeFallbackPrompts({
      ...completeDraft,
      workSetupPreference: "skip_for_now",
      paymentLane: "setup_later",
      inviteSkipped: true
    })).toEqual(expect.arrayContaining([
      "Add your first work.",
      "Finish payout/payment setup.",
      "Invite your first client.",
      "Complete verification."
    ]));
  });

  it("keeps More metadata inside approved Barber subtitles and defines event hints only", () => {
    expect(usesOnlyApprovedBarberMoreSubtitles()).toBe(true);
    expect(BARBER_ONBOARDING_MORE_METADATA.map((entry) => entry.subtitle)).toEqual(expect.arrayContaining([
      "BVRB3R App Settings",
      "Barber Business Settings",
      "Payments & Banking",
      "Compliance & Security"
    ]));
    expect(BARBER_ONBOARDING_MORE_METADATA.map((entry) => entry.subtitle)).not.toEqual(expect.arrayContaining([
      "Portfolio Settings",
      "Booking Preferences",
      "Setup Checklist"
    ]));
    expect(BARBER_ONBOARDING_EVENT_HINTS).toEqual(expect.arrayContaining([
      "barber_setup_started",
      "barber_booking_link_generated",
      "barber_home_handoff_completed",
      "barber_onboarding_completed"
    ]));
  });
});
