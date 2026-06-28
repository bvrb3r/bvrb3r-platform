import { BARBER_MORE_SUBTITLES } from "@/lib/onboarding/requirements";
import { buildOnboardingReadiness, isCanonicalPublicAccountRole } from "@/lib/onboarding/readiness";
import type { MoreSubtitle, OnboardingReadinessResult } from "@/lib/onboarding/types";

export const BARBER_ONBOARDING_STEP_VALUES = [
  "preview",
  "identity",
  "specialty",
  "work_setup",
  "first_service",
  "price_duration",
  "schedule",
  "booking_mode",
  "payment_lane",
  "booking_link",
  "invite_first_client",
  "home_handoff"
] as const;

export type BarberOnboardingStep = (typeof BARBER_ONBOARDING_STEP_VALUES)[number];

export const BARBER_SPECIALTY_VALUES = ["fades", "beards", "lineups", "kids_cuts", "designs", "full_service"] as const;
export type BarberSpecialty = (typeof BARBER_SPECIALTY_VALUES)[number];

export const BARBER_SERVICE_VALUES = ["haircut", "haircut_beard", "lineup", "kids_cut", "custom_service"] as const;
export type BarberServiceChoice = (typeof BARBER_SERVICE_VALUES)[number];

export const BARBER_BOOKING_MODE_VALUES = ["instant", "request", "shop_controlled", "invite_link_only"] as const;
export type BarberBookingMode = (typeof BARBER_BOOKING_MODE_VALUES)[number];

export const BARBER_PAYMENT_LANE_VALUES = ["bvrb3r_pay", "square_growth", "setup_later"] as const;
export type BarberPaymentLane = (typeof BARBER_PAYMENT_LANE_VALUES)[number];

export type BarberOnboardingDraft = {
  role?: string | null;
  authenticated?: boolean;
  barberRecordId?: string | null;
  displayName?: string;
  publicUsername?: string;
  usernameAvailable?: boolean;
  email?: string | null;
  phone?: string | null;
  city?: string;
  state?: string;
  profilePhotoUrl?: string | null;
  specialties?: BarberSpecialty[];
  primarySpecialty?: BarberSpecialty | "";
  workSetupPreference?: "add_now" | "basics_first" | "skip_for_now" | "";
  portfolioImageCount?: number;
  firstServiceName?: string;
  firstServiceCategory?: BarberServiceChoice | "";
  servicePriceCents?: number | null;
  serviceDurationMinutes?: number | null;
  currency?: "USD";
  availableDays?: string[];
  startTime?: string;
  endTime?: string;
  bufferMinutes?: number;
  timezone?: string;
  bookingMode?: BarberBookingMode | "";
  paymentLane?: BarberPaymentLane | "";
  providerTruthConnected?: boolean;
  providerPayoutStatus?: "ready" | "enabled" | "verified" | "incomplete" | "blocked" | "unknown" | null;
  identityVerified?: boolean;
  payoutTermsAccepted?: boolean;
  inviteSkipped?: boolean;
  bookingLinkCopied?: boolean;
};

export const BARBER_ONBOARDING_EVENT_HINTS = [
  "barber_setup_started",
  "barber_public_identity_viewed",
  "barber_public_identity_completed",
  "barber_specialty_selected",
  "barber_work_setup_started",
  "barber_first_service_created",
  "barber_price_duration_completed",
  "barber_schedule_completed",
  "barber_booking_mode_selected",
  "barber_payment_lane_selected",
  "barber_payment_lane_deferred",
  "barber_booking_link_generated",
  "barber_booking_link_copied",
  "barber_first_client_invite_viewed",
  "barber_invite_sent",
  "barber_invite_skipped",
  "barber_home_handoff_completed",
  "barber_onboarding_completed"
] as const;

export const BARBER_ONBOARDING_MORE_METADATA = [
  moreMetadata("Public Identity", "BVRB3R App Settings", "Top ID Card -> Edit Public Profile -> Identity"),
  moreMetadata("Specialty", "BVRB3R App Settings", "Top ID Card -> Edit Public Profile -> Specialties"),
  moreMetadata("Work Setup / Portfolio", "BVRB3R App Settings", "Top ID Card -> Edit Public Profile -> Portfolio"),
  moreMetadata("First Service", "Barber Business Settings", "Service Library"),
  moreMetadata("Price / Duration", "Barber Business Settings", "Service Library"),
  moreMetadata("Schedule", "Barber Business Settings", "Hours"),
  moreMetadata("Booking Mode", "Barber Business Settings", "Booking Rules"),
  moreMetadata("Payment Lane", "Payments & Banking", "Stripe Connect / Barber Payouts"),
  moreMetadata("Booking Link", "BVRB3R App Settings", "Top ID Card -> Edit Public Profile -> Booking Link"),
  moreMetadata("Invite First Client", "Barber Business Settings", "Performance"),
  moreMetadata("Identity Verification", "Compliance & Security", "Identity Verification"),
  moreMetadata("License Verification", "Compliance & Security", "License Verification")
] as const;

export const BARBER_BOOKING_MODE_OPTIONS = [
  { value: "instant", label: "Instant booking", supported: true },
  { value: "request", label: "Request to book", supported: false },
  { value: "shop_controlled", label: "Shop-controlled flow", supported: false },
  { value: "invite_link_only", label: "Invite-link only", supported: true }
] as const;

export const BARBER_PAYMENT_LANE_OPTIONS = [
  {
    value: "bvrb3r_pay",
    label: "BVRB3R Pay",
    detail: "Use BVRB3R checkout, tips, records, and payout setup."
  },
  {
    value: "square_growth",
    label: "Square Growth Mode",
    detail: "Keep Square payments and sync BVRB3R appointments."
  },
  {
    value: "setup_later",
    label: "Set up later",
    detail: "Start with your profile and booking link first."
  }
] as const;

export function normalizeBarberOnboardingStep(value?: string | null): BarberOnboardingStep {
  return BARBER_ONBOARDING_STEP_VALUES.includes(value as BarberOnboardingStep)
    ? value as BarberOnboardingStep
    : "preview";
}

export function getNextBarberOnboardingStep(step: BarberOnboardingStep): BarberOnboardingStep {
  const index = BARBER_ONBOARDING_STEP_VALUES.indexOf(step);
  return BARBER_ONBOARDING_STEP_VALUES[Math.min(index + 1, BARBER_ONBOARDING_STEP_VALUES.length - 1)] ?? "home_handoff";
}

export function cleanBarberUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 32);
}

export function dollarsToCents(value: string | number) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  }

  const cleaned = value.trim().replace(/[$,]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

export function validateServiceDurationMinutes(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 10 && parsed <= 480 ? parsed : null;
}

export function hasValidSchedule(input: Pick<BarberOnboardingDraft, "availableDays" | "startTime" | "endTime" | "timezone">) {
  if (!input.availableDays?.length || !input.startTime || !input.endTime || !input.timezone) {
    return false;
  }

  return input.startTime < input.endTime;
}

export function canUseBookingMode(mode: BarberBookingMode | "", draft: BarberOnboardingDraft) {
  if (!mode) return false;
  const businessReadyCore = hasText(draft.firstServiceName)
    && typeof draft.servicePriceCents === "number"
    && draft.servicePriceCents >= 0
    && typeof draft.serviceDurationMinutes === "number"
    && hasValidSchedule(draft);

  if (mode === "instant") return businessReadyCore;
  if (mode === "invite_link_only") return businessReadyCore;
  return false;
}

export function getBarberBookingLink(input: Pick<BarberOnboardingDraft, "publicUsername" | "firstServiceName" | "servicePriceCents" | "serviceDurationMinutes" | "availableDays" | "startTime" | "endTime" | "timezone">) {
  if (!hasText(input.publicUsername)) {
    return { href: null, reason: "Public username is needed before the booking link can be generated." };
  }

  if (!hasText(input.firstServiceName) || typeof input.servicePriceCents !== "number" || typeof input.serviceDurationMinutes !== "number") {
    return { href: null, reason: "Add a real service with price and duration before sharing a booking link." };
  }

  if (!hasValidSchedule(input)) {
    return { href: null, reason: "Set open times before clients can book your page." };
  }

  return { href: `/barber/${input.publicUsername}`, reason: null };
}

export function getBarberHomeFallbackPrompts(draft: BarberOnboardingDraft) {
  const prompts: string[] = [];
  if (!hasText(draft.firstServiceName)) prompts.push("Add your first service.");
  if (!hasValidSchedule(draft)) prompts.push("Set your schedule.");
  if (draft.workSetupPreference === "skip_for_now" || !draft.portfolioImageCount) prompts.push("Add your first work.");
  if (draft.paymentLane === "setup_later" || !draft.paymentLane) prompts.push("Finish payout/payment setup.");
  if (draft.inviteSkipped) prompts.push("Invite your first client.");
  if (draft.identityVerified !== true) prompts.push("Complete verification.");
  return prompts;
}

export function buildBarberOnboardingReadiness(draft: BarberOnboardingDraft): OnboardingReadinessResult {
  const canonicalRole = draft.role === "barber_user" ? "barber_user" : draft.role;
  const usernameReady = draft.usernameAvailable === true && hasText(draft.publicUsername);
  const serviceReady = hasText(draft.firstServiceName);
  const priceReady = typeof draft.servicePriceCents === "number" && draft.servicePriceCents >= 0;
  const durationReady = typeof draft.serviceDurationMinutes === "number" && draft.serviceDurationMinutes >= 10;
  const scheduleReady = hasValidSchedule(draft);
  const bookingModeReady = Boolean(draft.bookingMode && canUseBookingMode(draft.bookingMode, draft));
  const provider = draft.paymentLane === "bvrb3r_pay"
    ? "stripe"
    : draft.paymentLane === "square_growth"
      ? "square"
      : null;

  return buildOnboardingReadiness({
    authenticated: draft.authenticated ?? true,
    authMethodConnected: draft.authenticated ?? true,
    role: canonicalRole,
    name: draft.displayName,
    username: usernameReady ? draft.publicUsername : "",
    email: draft.email,
    phone: draft.phone,
    termsAccepted: true,
    trustRulesAccepted: true,
    barberBusiness: {
      barberRecordId: draft.barberRecordId,
      displayName: draft.displayName,
      username: usernameReady ? draft.publicUsername : "",
      profilePhotoUrl: draft.profilePhotoUrl,
      safeProfilePlaceholderAllowed: true,
      specialties: draft.specialties,
      activeServiceCount: serviceReady && priceReady && durationReady ? 1 : 0,
      hasPrice: priceReady,
      hasDuration: durationReady,
      hasSchedule: scheduleReady,
      bookingMode: bookingModeReady ? draft.bookingMode : null
    },
    payout: {
      paymentLaneSelected: Boolean(draft.paymentLane),
      provider,
      providerTruthConnected: draft.providerTruthConnected === true,
      frontendOnly: draft.providerTruthConnected !== true,
      identityVerified: draft.identityVerified === true,
      providerPayoutStatus: draft.providerPayoutStatus ?? "unknown",
      termsAccepted: draft.payoutTermsAccepted === true
    }
  });
}

export function isAllowedBarberOnboardingRole(role: string | null | undefined) {
  return role === "barber_user" && isCanonicalPublicAccountRole(role);
}

export function usesOnlyApprovedBarberMoreSubtitles() {
  const allowed = new Set<string>(BARBER_MORE_SUBTITLES);
  return BARBER_ONBOARDING_MORE_METADATA.every((entry) => allowed.has(entry.subtitle));
}

function moreMetadata(setting: string, subtitle: MoreSubtitle, destination: string) {
  return { setting, subtitle, destination };
}

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}
