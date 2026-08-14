import type { RoadRole } from "@/lib/road/catalog";

export const ROAD_SETUP_STATUSES = ["complete", "action_required", "pending_review"] as const;

export type RoadSetupStatus = (typeof ROAD_SETUP_STATUSES)[number];

export type RoadSetupCheck = {
  achievementKey: string;
  status: RoadSetupStatus;
  reason: string;
  observedAt: string | null;
};

export type RoadSetupAction = {
  href: string;
  actionLabel: string;
  pendingLabel?: string;
  pendingHref?: string;
  reasonActions?: Readonly<Record<string, {
    href: string;
    actionLabel: string;
  }>>;
};

const CLIENT_SETUP_ACTIONS = {
  "client.account_created": {
    href: "/onboarding",
    actionLabel: "Repair account"
  },
  "client.contact_verified": {
    href: "/verify-contact",
    actionLabel: "Verify contact"
  },
  "client.username_claimed": {
    href: "/dashboard/client/public-profile",
    actionLabel: "Choose username"
  },
  "client.guest_visits_claimed": {
    href: "/dashboard/client/guest-history",
    actionLabel: "Open guest history"
  },
  "client.profile_completed": {
    href: "/onboarding/client/profile",
    actionLabel: "Finish client setup",
    reasonActions: {
      add_client_profile_photo: {
        href: "/dashboard/client/public-profile",
        actionLabel: "Add profile photo"
      },
      finish_client_onboarding_profile_and_preferences: {
        href: "/onboarding/client/profile",
        actionLabel: "Finish client setup"
      },
      repair_client_profile_projection: {
        href: "/onboarding/client/profile",
        actionLabel: "Repair client setup"
      }
    }
  },
  "client.payment_method_saved": {
    href: "/dashboard/client/more?section=wallet",
    actionLabel: "Add payment method"
  }
} as const satisfies Record<string, RoadSetupAction>;

const BARBER_SETUP_ACTIONS = {
  "barber.account_created": {
    href: "/onboarding",
    actionLabel: "Repair account"
  },
  "barber.username_claimed": {
    href: "/dashboard/barber/profile",
    actionLabel: "Choose username"
  },
  "barber.contact_verified": {
    href: "/verify-contact",
    actionLabel: "Verify contact"
  },
  "barber.license_verified": {
    href: "/onboarding/barber/verification",
    actionLabel: "Submit license",
    pendingLabel: "View review status"
  },
  "barber.payout_connected": {
    href: "/dashboard/barber/payouts",
    actionLabel: "Finish payouts",
    pendingLabel: "View payout status"
  },
  "barber.menu_built": {
    href: "/dashboard/barber/services",
    actionLabel: "Build service menu"
  },
  "barber.availability_published": {
    href: "/dashboard/barber/more?section=availability",
    actionLabel: "Set availability"
  },
  "barber.profile_published": {
    href: "/dashboard/barber/setup",
    actionLabel: "Review launch blockers",
    reasonActions: {
      complete_marketplace_eligibility_photo_and_three_portfolio_posts: {
        href: "/dashboard/barber/setup",
        actionLabel: "Finish marketplace setup"
      }
    }
  }
} as const satisfies Record<string, RoadSetupAction>;

const OWNER_SETUP_ACTIONS = {
  "owner.account_created": {
    href: "/onboarding",
    actionLabel: "Repair account"
  },
  "owner.contact_verified": {
    href: "/verify-contact",
    actionLabel: "Verify contact"
  },
  "owner.shop_identity_completed": {
    href: "/dashboard/owner/public-profile",
    actionLabel: "Complete shop identity"
  },
  "owner.shop_hours_set": {
    href: "/dashboard/owner/settings?section=hours",
    actionLabel: "Set shop hours"
  },
  "owner.business_verified": {
    href: "/onboarding/owner/verification",
    actionLabel: "Submit verification",
    pendingLabel: "View review status"
  },
  "owner.stripe_connected": {
    href: "/onboarding/owner/verification",
    actionLabel: "Finish Stripe setup",
    pendingLabel: "View payout status"
  },
  "owner.policies_published": {
    href: "/dashboard/owner/settings?section=policies",
    actionLabel: "Publish policies"
  },
  "owner.shop_profile_published": {
    href: "/dashboard/owner/settings?section=profile",
    actionLabel: "Verify search location",
    pendingHref: "/activation-status",
    pendingLabel: "View approval status"
  }
} as const satisfies Record<string, RoadSetupAction>;

export const ROAD_SETUP_ACTIONS: Record<RoadRole, Readonly<Record<string, RoadSetupAction>>> = {
  client_user: CLIENT_SETUP_ACTIONS,
  barber_user: BARBER_SETUP_ACTIONS,
  shop_owner_user: OWNER_SETUP_ACTIONS
};

export function getRoadSetupAction(
  role: RoadRole,
  achievementKey: string,
  reason?: string | null
): RoadSetupAction | null {
  const action = ROAD_SETUP_ACTIONS[role][achievementKey] ?? null;
  if (!action || !reason) return action;
  const reasonAction = action.reasonActions?.[reason];
  return reasonAction ? { ...action, ...reasonAction } : action;
}

export function getRoadSetupAchievementKeys(role: RoadRole) {
  return Object.keys(ROAD_SETUP_ACTIONS[role]);
}

export function isRoadSetupStatus(value: unknown): value is RoadSetupStatus {
  return typeof value === "string" && ROAD_SETUP_STATUSES.includes(value as RoadSetupStatus);
}

const ROAD_SETUP_REASON_COPY: Readonly<Record<string, string>> = {
  account_projection_missing: "Your signed-in account is not linked to its role record yet.",
  verify_email_and_phone: "Verify both your email address and phone number.",
  public_username_missing: "Choose an available public username.",
  public_username_mismatch: "Your username registry and public profile do not match yet.",
  guest_history_unresolved: "Claim the secure visit link sent by the shop, or wait while we confirm there is no guest history to merge.",
  profile_incomplete: "Finish the required profile details and preferences.",
  finish_client_onboarding_profile_and_preferences: "Finish both client profile and preference onboarding steps.",
  add_client_profile_photo: "Add a real profile photo to finish your client setup.",
  repair_client_profile_projection: "Your client setup records need repair before this can complete.",
  payment_method_missing: "Add a valid payment method after the provider confirms it.",
  license_verification_required: "Submit current license evidence for review.",
  license_review_pending: "Your license evidence is still under review.",
  payout_setup_required: "Finish live payout onboarding and clear every provider requirement.",
  service_menu_incomplete: "Publish at least three bookable services with a price and duration.",
  availability_not_published: "Publish valid working hours for an active independent chair or approved shop location.",
  public_profile_not_ready: "Complete your public profile and booking visibility requirements.",
  publish_availability_for_freelance_or_approved_shop_location: "Publish valid working hours for an independent chair or a mutually approved shop location.",
  complete_marketplace_eligibility_photo_and_three_portfolio_posts: "Clear every marketplace launch blocker, add a profile photo, and publish at least three portfolio posts.",
  shop_identity_incomplete: "Finish the shop's real public identity, contact details, address, username, and photo.",
  shop_hours_missing: "Publish at least one valid opening interval.",
  business_verification_required: "Submit current business evidence for review.",
  business_review_pending: "Your business evidence is still under review.",
  stripe_setup_required: "Finish live Stripe onboarding and clear every payout requirement.",
  policies_missing: "Publish real client-facing shop policies.",
  shop_profile_not_ready: "Complete the shop profile and its operational marketplace requirements.",
  complete_verified_search_location_and_username: "Verify the shop's public map location so it can appear in marketplace search."
};

export function formatRoadSetupReason(reason: string) {
  const normalized = reason.trim();
  if (!normalized) {
    return "Current server records still need attention.";
  }

  const known = ROAD_SETUP_REASON_COPY[normalized];
  if (known) {
    return known;
  }

  if (/^[a-z0-9_-]+$/.test(normalized)) {
    const words = normalized.replaceAll("_", " ").replaceAll("-", " ");
    return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
  }

  return normalized;
}
