import { CLIENT_MORE_SUBTITLES } from "@/lib/onboarding/requirements";
import { buildOnboardingReadiness } from "@/lib/onboarding/readiness";
import type {
  MoreSubtitle,
  OnboardingReadinessContext,
  OnboardingReadinessResult
} from "@/lib/onboarding/types";

export const CLIENT_SERVICE_INTEREST_VALUES = [
  "haircut",
  "haircut_beard",
  "beard",
  "line_up",
  "kids_cut",
  "full_service",
  "not_sure_yet"
] as const;

export const CLIENT_BOOKING_TIMING_VALUES = [
  "today",
  "tomorrow",
  "this_week",
  "this_weekend",
  "next_available",
  "just_browsing"
] as const;

export const CLIENT_SEARCH_PRIORITY_VALUES = [
  "soonest_available",
  "closest_to_me",
  "highest_rated",
  "best_portfolio",
  "my_price_range",
  "someone_i_already_know"
] as const;

export const CLIENT_FIRST_BOOKING_MISSION_VALUES = [
  "find_first_cut",
  "enter_client_home"
] as const;

export type ClientServiceInterest = (typeof CLIENT_SERVICE_INTEREST_VALUES)[number];
export type ClientBookingTiming = (typeof CLIENT_BOOKING_TIMING_VALUES)[number];
export type ClientSearchPriority = (typeof CLIENT_SEARCH_PRIORITY_VALUES)[number];
export type ClientFirstBookingMission = (typeof CLIENT_FIRST_BOOKING_MISSION_VALUES)[number];

export type ClientOption<TValue extends string> = {
  value: TValue;
  label: string;
  routeSeed?: string;
};

export const CLIENT_SERVICE_INTEREST_OPTIONS: readonly ClientOption<ClientServiceInterest>[] = [
  { value: "haircut", label: "Haircut", routeSeed: "haircuts" },
  { value: "haircut_beard", label: "Haircut + Beard", routeSeed: "haircut beard" },
  { value: "beard", label: "Beard", routeSeed: "beard" },
  { value: "line_up", label: "Line-up", routeSeed: "line up" },
  { value: "kids_cut", label: "Kids cut", routeSeed: "kids cuts" },
  { value: "full_service", label: "Full service", routeSeed: "full service" },
  { value: "not_sure_yet", label: "Not sure yet" }
];

export const CLIENT_BOOKING_TIMING_OPTIONS: readonly ClientOption<ClientBookingTiming>[] = [
  { value: "today", label: "Today", routeSeed: "today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "this_week", label: "This week" },
  { value: "this_weekend", label: "This weekend" },
  { value: "next_available", label: "Next available" },
  { value: "just_browsing", label: "Just browsing" }
];

export const CLIENT_SEARCH_PRIORITY_OPTIONS: readonly ClientOption<ClientSearchPriority>[] = [
  { value: "soonest_available", label: "Soonest available" },
  { value: "closest_to_me", label: "Closest to me" },
  { value: "highest_rated", label: "Highest rated / Best reviews" },
  { value: "best_portfolio", label: "Work I like / Best portfolio" },
  { value: "my_price_range", label: "My price range" },
  { value: "someone_i_already_know", label: "Someone I already know" }
];

export const CLIENT_FIRST_BOOKING_MISSION_OPTIONS: readonly ClientOption<ClientFirstBookingMission>[] = [
  { value: "find_first_cut", label: "Find My First Cut" },
  { value: "enter_client_home", label: "Enter Client Home" }
];

export const CLIENT_ONBOARDING_EVENT_HINTS = [
  "guest_surface_viewed",
  "guest_filter_selected",
  "guest_profile_clicked",
  "guest_shop_clicked",
  "guest_booking_attempted",
  "guest_join_clicked",
  "client_setup_started",
  "client_service_interest_selected",
  "client_booking_timing_selected",
  "client_search_priority_selected",
  "client_first_booking_mission_viewed",
  "client_home_handoff_completed",
  "client_onboarding_completed",
  "first_action_clicked"
] as const;

export const CLIENT_ONBOARDING_MORE_METADATA = [
  moreMetadata("Service Interest", "BVRB3R App Settings", "Preferences"),
  moreMetadata("Booking Timing", "BVRB3R App Settings", "Preferences"),
  moreMetadata("Search Priority", "BVRB3R App Settings", "Preferences"),
  moreMetadata("First Booking Mission", "BVRB3R App Settings", "Preferences"),
  moreMetadata("Favorites/follows", "BVRB3R App Settings", "Saved / Favorites"),
  moreMetadata("Payment method", "Payments & Banking", "Wallet / Billing"),
  moreMetadata("Receipts", "Payments & Banking", "Transactions"),
  moreMetadata("Legal/trust rules", "Compliance & Security", "Legal"),
  moreMetadata("Phone/email/security", "Compliance & Security", "Account security")
] as const;

export type ClientProfileReadinessInput = {
  authenticated?: boolean;
  role?: string | null;
  fullName?: string | null;
  username?: string | null;
  usernameAvailable?: boolean;
  email?: string | null;
  phone?: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  trustRulesAccepted?: boolean;
};

export type ClientPreferenceInput = {
  serviceInterest?: ClientServiceInterest | "";
  bookingTiming?: ClientBookingTiming | "";
  searchPriority?: ClientSearchPriority | "";
  firstBookingMission?: ClientFirstBookingMission | "";
};

const SERVICE_CATEGORY_BY_INTEREST: Partial<Record<ClientServiceInterest, string>> = {
  haircut: "haircuts",
  haircut_beard: "haircut beard",
  beard: "beard",
  line_up: "line up",
  kids_cut: "kids cuts",
  full_service: "full service"
};

function moreMetadata(setting: string, subtitle: MoreSubtitle, destination: string) {
  return { setting, subtitle, destination };
}

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasFullContactProof(profile: ClientProfileReadinessInput) {
  return hasText(profile.email) && hasText(profile.phone);
}

export function buildClientOnboardingReadiness(
  profile: ClientProfileReadinessInput,
  booking?: OnboardingReadinessContext["booking"]
): OnboardingReadinessResult {
  const hasUsernameProof = profile.usernameAvailable === true && hasText(profile.username);
  const hasContactProof = hasFullContactProof(profile);

  return buildOnboardingReadiness({
    authenticated: profile.authenticated ?? true,
    authMethodConnected: profile.authenticated ?? true,
    role: profile.role ?? "client_user",
    name: profile.fullName,
    username: hasUsernameProof ? profile.username : "",
    email: hasContactProof ? profile.email : "",
    phone: hasContactProof ? profile.phone : "",
    emailVerified: profile.emailVerified,
    phoneVerified: profile.phoneVerified,
    termsAccepted: profile.trustRulesAccepted === true,
    trustRulesAccepted: profile.trustRulesAccepted === true,
    booking
  });
}

export function getClientFirstBookingHref(preferences: ClientPreferenceInput): string {
  if (preferences.firstBookingMission === "enter_client_home") {
    return "/dashboard/client";
  }

  const params = new URLSearchParams({
    entry: "client_onboarding",
    source: "client_onboarding",
    type: "barbers"
  });

  const category = preferences.serviceInterest
    ? SERVICE_CATEGORY_BY_INTEREST[preferences.serviceInterest]
    : undefined;
  if (category) {
    params.set("category", category);
  }

  if (preferences.bookingTiming === "today") {
    params.set("availability", "today");
  }

  if (preferences.searchPriority === "highest_rated") {
    params.set("rating", "4.5");
  }

  if (preferences.searchPriority === "closest_to_me") {
    params.set("priority", "nearby");
  }

  if (preferences.searchPriority === "someone_i_already_know") {
    params.set("q", "");
  }

  return `/discover?${params.toString()}`;
}

export function getClientOptionLabel<TValue extends string>(
  value: TValue | "" | undefined,
  options: readonly ClientOption<TValue>[]
) {
  return options.find((option) => option.value === value)?.label ?? "";
}

export function isAllowedClientServiceInterest(value: string): value is ClientServiceInterest {
  return CLIENT_SERVICE_INTEREST_VALUES.includes(value as ClientServiceInterest);
}

export function isAllowedClientBookingTiming(value: string): value is ClientBookingTiming {
  return CLIENT_BOOKING_TIMING_VALUES.includes(value as ClientBookingTiming);
}

export function isAllowedClientSearchPriority(value: string): value is ClientSearchPriority {
  return CLIENT_SEARCH_PRIORITY_VALUES.includes(value as ClientSearchPriority);
}

export function isAllowedClientFirstBookingMission(value: string): value is ClientFirstBookingMission {
  return CLIENT_FIRST_BOOKING_MISSION_VALUES.includes(value as ClientFirstBookingMission);
}

export function usesOnlyApprovedClientMoreSubtitles() {
  const allowed = new Set<string>(CLIENT_MORE_SUBTITLES);
  return CLIENT_ONBOARDING_MORE_METADATA.every((entry) => allowed.has(entry.subtitle));
}
