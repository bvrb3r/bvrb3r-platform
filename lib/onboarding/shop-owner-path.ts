import { SHOP_OWNER_MORE_SUBTITLES } from "@/lib/onboarding/requirements";
import { buildOnboardingReadiness, isCanonicalPublicAccountRole } from "@/lib/onboarding/readiness";
import type { MoreSubtitle, OnboardingReadinessResult } from "@/lib/onboarding/types";

export const SHOP_OWNER_ONBOARDING_STEP_VALUES = [
  "preview",
  "access",
  "authority",
  "identity",
  "shop_preview",
  "location",
  "hours",
  "chair_count",
  "operating_model",
  "booking_mode",
  "payment_model",
  "policies",
  "invite_first_barber",
  "home_handoff"
] as const;

export type ShopOwnerOnboardingStep = (typeof SHOP_OWNER_ONBOARDING_STEP_VALUES)[number];

export const OWNER_AUTHORITY_VALUES = ["owner", "manager", "opening_shop", "setup_for_owner"] as const;
export type OwnerAuthorityType = (typeof OWNER_AUTHORITY_VALUES)[number];

export const SHOP_HOURS_TYPE_VALUES = ["standard", "custom", "set_later"] as const;
export type ShopHoursType = (typeof SHOP_HOURS_TYPE_VALUES)[number];

export const SHOP_CHAIR_RANGE_VALUES = ["1_3", "4_6", "7_10", "11_plus", "not_sure"] as const;
export type ShopChairRange = (typeof SHOP_CHAIR_RANGE_VALUES)[number];

export const SHOP_OPERATING_MODEL_VALUES = ["booth_rent", "commission", "mixed", "owner_operated"] as const;
export type ShopOperatingModel = (typeof SHOP_OPERATING_MODEL_VALUES)[number];

export const SHOP_BOOKING_MODE_VALUES = ["pick_barber", "next_available", "shop_controlled", "both"] as const;
export type ShopBookingMode = (typeof SHOP_BOOKING_MODE_VALUES)[number];

export const SHOP_PAYMENT_MODEL_VALUES = ["barber_direct", "commission_bvrb3r_pay", "booth_rent_tracking", "setup_later"] as const;
export type ShopPaymentModel = (typeof SHOP_PAYMENT_MODEL_VALUES)[number];

export const SHOP_POLICY_VALUES = ["standard", "custom", "set_later"] as const;
export type ShopPolicyChoice = (typeof SHOP_POLICY_VALUES)[number];

export type ShopOwnerOnboardingDraft = {
  role?: string | null;
  authenticated?: boolean;
  ownerName?: string | null;
  email?: string | null;
  phone?: string | null;
  shopRecordId?: string | null;
  shopName?: string;
  shopDisplayName?: string;
  shopUsername?: string;
  usernameAvailable?: boolean;
  publicDescription?: string;
  ownerAuthorityType?: OwnerAuthorityType | "";
  authorityRequiresReview?: boolean;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  locationCaptureMethod?: "full_address" | "current_location" | "city_first" | "";
  locationCompleted?: boolean;
  locationPermissionDenied?: boolean;
  hoursType?: ShopHoursType | "";
  availableDays?: string[];
  startTime?: string;
  endTime?: string;
  timezone?: string;
  hoursCompleted?: boolean;
  chairRange?: ShopChairRange | "";
  estimatedChairCount?: number | null;
  activeChairCount?: number | null;
  operatingModel?: ShopOperatingModel | "";
  bookingMode?: ShopBookingMode | "";
  paymentModel?: ShopPaymentModel | "";
  providerTruthConnected?: boolean;
  shopMoneySetupStatus?: "ready" | "needs_review" | "not_connected" | "deferred" | "unknown" | null;
  policiesChoice?: ShopPolicyChoice | "";
  policiesAccepted?: boolean;
  inviteEmail?: string;
  inviteSkipped?: boolean;
  inviteCopied?: boolean;
  shopActive?: boolean;
  chairsActive?: boolean;
  teamEligible?: boolean;
  walkInModeSet?: boolean;
  sessionRules?: boolean;
  rotationMode?: boolean;
  notificationSetup?: boolean;
  verificationPosture?: "verified" | "approved" | "active" | "pending" | "blocked" | "unknown" | null;
};

export const SHOP_OWNER_ONBOARDING_EVENT_HINTS = [
  "shop_owner_setup_started",
  "owner_authority_selected",
  "shop_identity_completed",
  "shop_preview_viewed",
  "shop_location_completed",
  "shop_hours_completed",
  "shop_chair_count_completed",
  "shop_operating_model_selected",
  "shop_booking_mode_selected",
  "shop_payment_model_selected",
  "shop_payment_model_deferred",
  "shop_policies_completed",
  "shop_policies_deferred",
  "first_barber_invite_viewed",
  "first_barber_invite_sent",
  "first_barber_invite_skipped",
  "owner_home_handoff_completed",
  "shop_owner_onboarding_completed"
] as const;

export const SHOP_OWNER_ONBOARDING_MORE_METADATA = [
  moreMetadata("Owner Authority", "Compliance & Security", "Business Verification"),
  moreMetadata("Shop Identity", "BVRB3R App Settings", "Top ID Card -> Public Profile"),
  moreMetadata("Shop Preview", "BVRB3R App Settings", "Top ID Card -> Public Profile"),
  moreMetadata("Location", "BVRB3R App Settings", "Top ID Card -> Public Profile -> Location"),
  moreMetadata("Hours", "SHOP BUSINESS SETTINGS", "Shop Hours"),
  moreMetadata("Chair Count", "SHOP BUSINESS SETTINGS", "Kiosk Settings"),
  moreMetadata("Operating Model", "SHOP BUSINESS SETTINGS", "Booth Rent, Commission & Fees"),
  moreMetadata("Booking Mode", "SHOP BUSINESS SETTINGS", "Kiosk Settings"),
  moreMetadata("Payment Model", "SHOP BUSINESS SETTINGS", "Booth Rent, Commission & Fees"),
  moreMetadata("Owner Payouts", "Payments & Banking", "Stripe Connect / Owner Payouts"),
  moreMetadata("Policies", "SHOP BUSINESS SETTINGS", "Shop Policies"),
  moreMetadata("Invite First Barber", "SHOP BUSINESS SETTINGS", "Team & Roles"),
  moreMetadata("Owner Home Handoff", "SHOP BUSINESS SETTINGS", "Performance")
] as const;

export const SHOP_BOOKING_MODE_OPTIONS = [
  { value: "pick_barber", label: "Pick a barber", supported: true },
  { value: "next_available", label: "Next available", supported: false },
  { value: "shop_controlled", label: "Shop-controlled routing", supported: false },
  { value: "both", label: "Both", supported: false }
] as const;

export const SHOP_PAYMENT_MODEL_OPTIONS = [
  { value: "barber_direct", label: "Barber direct", detail: "Barbers collect directly; owner service-money readiness is not implied." },
  { value: "commission_bvrb3r_pay", label: "Commission through BVRB3R Pay", detail: "Requires server/provider proof before money readiness can pass." },
  { value: "booth_rent_tracking", label: "Booth rent tracking", detail: "Tracks posture only; collection automation is not implied." },
  { value: "setup_later", label: "Set up later", detail: "Continue setup while money readiness stays incomplete." }
] as const;

export function normalizeShopOwnerOnboardingStep(value?: string | null): ShopOwnerOnboardingStep {
  return SHOP_OWNER_ONBOARDING_STEP_VALUES.includes(value as ShopOwnerOnboardingStep)
    ? value as ShopOwnerOnboardingStep
    : "preview";
}

export function getNextShopOwnerOnboardingStep(step: ShopOwnerOnboardingStep): ShopOwnerOnboardingStep {
  const index = SHOP_OWNER_ONBOARDING_STEP_VALUES.indexOf(step);
  return SHOP_OWNER_ONBOARDING_STEP_VALUES[Math.min(index + 1, SHOP_OWNER_ONBOARDING_STEP_VALUES.length - 1)] ?? "home_handoff";
}

export function cleanShopUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 32);
}

export function authorityRequiresReview(value: OwnerAuthorityType | "" | undefined) {
  return value === "manager" || value === "setup_for_owner";
}

export function chairEstimateForRange(value: ShopChairRange | "" | undefined) {
  if (value === "1_3") return 3;
  if (value === "4_6") return 6;
  if (value === "7_10") return 10;
  if (value === "11_plus") return 11;
  return null;
}

export function hasCompleteShopLocation(draft: ShopOwnerOnboardingDraft) {
  if (draft.locationCaptureMethod === "city_first") {
    return false;
  }
  return hasText(draft.addressLine1) && hasText(draft.city) && hasText(draft.state) && hasText(draft.zipCode);
}

export function hasCompleteShopHours(draft: ShopOwnerOnboardingDraft) {
  if (draft.hoursType === "set_later") return false;
  if (draft.hoursType === "standard") return Boolean(draft.timezone);
  return Boolean(draft.availableDays?.length && draft.startTime && draft.endTime && draft.timezone && draft.startTime < draft.endTime);
}

export function canUseShopBookingMode(mode: ShopBookingMode | "" | undefined, draft: ShopOwnerOnboardingDraft) {
  if (!mode) return false;
  const coreReady = hasCompleteShopLocation(draft)
    && hasCompleteShopHours(draft)
    && typeof draft.estimatedChairCount === "number"
    && draft.estimatedChairCount > 0;
  return mode === "pick_barber" && coreReady;
}

export function getShopInviteLink(input: Pick<ShopOwnerOnboardingDraft, "shopUsername" | "shopName">) {
  const username = cleanShopUsername(input.shopUsername ?? "");
  if (username) {
    return `/shop/${username}/team`;
  }

  return `/dashboard/owner/team`;
}

export function getShopOwnerHomeFallbackPrompts(draft: ShopOwnerOnboardingDraft) {
  const prompts: string[] = [];
  if (!hasCompleteShopLocation(draft)) prompts.push("Add shop location.");
  if (!hasCompleteShopHours(draft)) prompts.push("Set shop hours.");
  if (!draft.policiesAccepted) prompts.push("Finish shop policies.");
  if (draft.paymentModel === "setup_later" || !draft.paymentModel) prompts.push("Finish shop money setup.");
  if (draft.inviteSkipped || draft.teamEligible !== true) prompts.push("Invite your first barber.");
  if (
    !canUseShopBookingMode(draft.bookingMode, draft)
    || draft.shopActive !== true
    || draft.chairsActive !== true
    || draft.teamEligible !== true
    || draft.walkInModeSet !== true
    || draft.sessionRules !== true
    || draft.rotationMode !== true
    || draft.notificationSetup !== true
  ) prompts.push("Prepare kiosk.");
  if (!["verified", "approved", "active"].includes(draft.verificationPosture ?? "")) prompts.push("Complete shop verification.");
  return prompts;
}

export function buildShopOwnerOnboardingReadiness(draft: ShopOwnerOnboardingDraft): OnboardingReadinessResult {
  const usernameReady = draft.usernameAvailable === true && hasText(draft.shopUsername);
  const ownerAuthority = Boolean(draft.ownerAuthorityType && !authorityRequiresReview(draft.ownerAuthorityType));
  const locationReady = hasCompleteShopLocation(draft);
  const hoursReady = hasCompleteShopHours(draft);
  const chairCount = typeof draft.estimatedChairCount === "number" ? draft.estimatedChairCount : 0;
  const bookingModeReady = Boolean(draft.bookingMode && canUseShopBookingMode(draft.bookingMode, draft));
  const paymentModelReady = Boolean(draft.paymentModel && draft.paymentModel !== "setup_later");
  const provider = draft.paymentModel === "commission_bvrb3r_pay" ? "stripe" : draft.paymentModel ? "shop_model_selected" : null;

  return buildOnboardingReadiness({
    authenticated: draft.authenticated ?? true,
    authMethodConnected: draft.authenticated ?? true,
    role: draft.role,
    name: draft.ownerName ?? draft.shopDisplayName ?? draft.shopName,
    username: usernameReady ? draft.shopUsername : "",
    email: draft.email,
    phone: draft.phone,
    termsAccepted: true,
    trustRulesAccepted: true,
    shop: {
      ownerAuthority,
      shopRecordId: draft.shopRecordId,
      shopName: draft.shopName,
      shopUsername: usernameReady ? draft.shopUsername : "",
      location: locationReady ? [draft.addressLine1, draft.city, draft.state, draft.zipCode].filter(Boolean).join(", ") : null,
      hours: hoursReady ? formatHoursLabel(draft) : null,
      chairCount,
      operatingModel: draft.operatingModel || null,
      bookingMode: bookingModeReady ? draft.bookingMode : null,
      policiesAccepted: draft.policiesAccepted === true,
      paymentModel: paymentModelReady ? draft.paymentModel : null,
      verificationPosture: draft.verificationPosture ?? "unknown"
    },
    payout: {
      paymentLaneSelected: Boolean(draft.paymentModel && draft.paymentModel !== "setup_later"),
      provider,
      providerTruthConnected: draft.providerTruthConnected === true,
      frontendOnly: draft.providerTruthConnected !== true,
      identityVerified: ["verified", "approved", "active"].includes(draft.verificationPosture ?? ""),
      providerPayoutStatus: draft.shopMoneySetupStatus === "ready" ? "ready" : "unknown",
      termsAccepted: false
    },
    kiosk: {
      shopActive: draft.shopActive === true,
      chairsActive: draft.chairsActive === true,
      teamEligible: draft.teamEligible === true,
      bookingModeSet: bookingModeReady,
      walkInModeSet: draft.walkInModeSet === true,
      sessionRules: draft.sessionRules === true,
      rotationMode: draft.rotationMode === true,
      notificationSetup: draft.notificationSetup === true
    }
  });
}

export function isAllowedShopOwnerOnboardingRole(role: string | null | undefined) {
  return role === "shop_owner_user" && isCanonicalPublicAccountRole(role);
}

export function usesOnlyApprovedShopOwnerMoreSubtitles() {
  const allowed = new Set<string>(SHOP_OWNER_MORE_SUBTITLES);
  return SHOP_OWNER_ONBOARDING_MORE_METADATA.every((entry) => allowed.has(entry.subtitle));
}

function formatHoursLabel(draft: ShopOwnerOnboardingDraft) {
  if (draft.hoursType === "standard") return `Standard shop hours ${draft.timezone ?? ""}`.trim();
  return `${draft.availableDays?.join(", ")} ${draft.startTime}-${draft.endTime} ${draft.timezone}`;
}

function moreMetadata(setting: string, subtitle: MoreSubtitle, destination: string) {
  return { setting, subtitle, destination };
}

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}
