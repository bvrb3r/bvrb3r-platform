export const PR36_HEAD_START_HOURS = 24 as const;

export type Pr36LaunchStatus = "prelaunch" | "launch_scheduled" | "paused" | "canceled";
export type Pr36LaunchPhase = "prelaunch" | "scheduled" | "waitlist_head_start" | "live" | "paused" | "canceled";
export type Pr36BookingAccess = "closed" | "waitlist_only" | "public";

export type Pr36LaunchConfigRow = {
  shop_id: string;
  opening_at: string;
  chair_capacity: number;
  head_start_hours: number;
  status: string;
  page_visits: number;
  version: number;
  go_live_approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Pr36LaunchEvidence = {
  identity: {
    approved: boolean;
    name: string | null;
    publicUsername: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
  stripe: {
    connected: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    onboardingStatus: string | null;
    payoutReadinessStatus: string | null;
  };
  policies: {
    published: boolean;
  };
  hours: {
    published: boolean;
  };
  team: {
    foundingChairCount: number;
    chairCapacity: number;
  };
  kiosk: {
    enabled: boolean;
    paired: boolean;
    tested: boolean;
  };
};

export type Pr36LaunchCheckKey = "identity" | "stripe" | "policies" | "hours" | "team" | "kiosk";

export type Pr36LaunchCheck = {
  key: Pr36LaunchCheckKey;
  label: string;
  detail: string;
  green: boolean;
  href: string;
  action: string;
};

export type Pr36FoundingBarber = {
  profileId: string;
  name: string;
  username: string;
  href: string;
};

export type Pr36PublicPrelaunch = {
  shopId: string;
  slug: string;
  name: string;
  addressLine: string;
  openingAt: string;
  bookingHeadStartAt: string;
  phase: Pr36LaunchPhase;
  waitlistCount: number;
  viewerPosition: number | null;
  foundingTeam: Pr36FoundingBarber[];
  foundingChairCount: number;
  chairCapacity: number;
  joinChairHref: string;
  publicShopHref: string;
  paymentAllowed: boolean;
};

export type Pr36OwnerLaunchConsole = {
  configured: boolean;
  shopId: string;
  slug: string;
  name: string;
  openingAt: string | null;
  bookingHeadStartAt: string | null;
  status: Pr36LaunchStatus | "not_configured";
  phase: Pr36LaunchPhase | "not_configured";
  version: number;
  waitlistCount: number;
  foundingChairCount: number;
  chairCapacity: number;
  pageVisits: number;
  checks: Pr36LaunchCheck[];
  allGreen: boolean;
  canGoLive: boolean;
  goLiveReason: string | null;
  publicPageHref: string;
};

function validText(value: string | null | undefined, minimum = 1) {
  return Boolean(value?.trim() && value.trim().length >= minimum);
}

function asTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function pr36BookingHeadStartAt(openingAt: string) {
  const timestamp = asTimestamp(openingAt);
  if (timestamp === null) return null;
  return new Date(timestamp - PR36_HEAD_START_HOURS * 60 * 60 * 1000).toISOString();
}

export function resolvePr36LaunchPhase(
  config: Pick<Pr36LaunchConfigRow, "opening_at" | "status" | "go_live_approved_at">,
  now = new Date()
): Pr36LaunchPhase {
  if (config.status === "paused") return "paused";
  if (config.status === "canceled") return "canceled";
  if (config.status !== "launch_scheduled" || !config.go_live_approved_at) return "prelaunch";

  const openingAt = asTimestamp(config.opening_at);
  if (openingAt === null) return "prelaunch";
  const nowTimestamp = now.getTime();
  if (nowTimestamp >= openingAt) return "live";
  if (nowTimestamp >= openingAt - PR36_HEAD_START_HOURS * 60 * 60 * 1000) return "waitlist_head_start";
  return "scheduled";
}

export function resolvePr36BookingAccess(input: {
  config: Pick<Pr36LaunchConfigRow, "opening_at" | "status" | "go_live_approved_at">;
  viewerWaitlisted: boolean;
  now?: Date;
}): Pr36BookingAccess {
  const phase = resolvePr36LaunchPhase(input.config, input.now);
  if (phase === "live") return "public";
  if (phase === "waitlist_head_start" && input.viewerWaitlisted) return "waitlist_only";
  return "closed";
}

export function pr36PaymentAllowed(
  config: Pick<Pr36LaunchConfigRow, "opening_at" | "status" | "go_live_approved_at">,
  now = new Date()
) {
  return resolvePr36LaunchPhase(config, now) === "live";
}

export function buildPr36LaunchChecklist(evidence: Pr36LaunchEvidence): Pr36LaunchCheck[] {
  const identityGreen = evidence.identity.approved
    && validText(evidence.identity.name, 2)
    && validText(evidence.identity.publicUsername, 2)
    && validText(evidence.identity.address, 3)
    && validText(evidence.identity.city, 2)
    && validText(evidence.identity.state, 2);
  const stripeGreen = evidence.stripe.connected
    && evidence.stripe.chargesEnabled
    && evidence.stripe.payoutsEnabled
    && evidence.stripe.onboardingStatus === "verified"
    && evidence.stripe.payoutReadinessStatus === "ready";
  const teamGreen = evidence.team.chairCapacity > 0
    && evidence.team.foundingChairCount >= evidence.team.chairCapacity;
  const kioskGreen = evidence.kiosk.enabled && evidence.kiosk.paired && evidence.kiosk.tested;

  return [
    {
      key: "identity",
      label: "Shop identity & address verified",
      detail: identityGreen ? "Public identity and business approval are verified." : "Finish the public identity, address, username, and business approval.",
      green: identityGreen,
      href: "/shop/verify",
      action: identityGreen ? "View" : "Verify"
    },
    {
      key: "stripe",
      label: "Stripe connected",
      detail: stripeGreen ? "Stripe confirms charges and payouts are ready." : "Finish Stripe Connect onboarding and payout readiness.",
      green: stripeGreen,
      href: "/shop/money",
      action: stripeGreen ? "View" : "Connect"
    },
    {
      key: "policies",
      label: "Policies published",
      detail: evidence.policies.published ? "Client-facing shop policies are stored." : "Publish the shop policies clients must accept.",
      green: evidence.policies.published,
      href: "/shop/policies",
      action: evidence.policies.published ? "View" : "Publish"
    },
    {
      key: "hours",
      label: "Opening hours set",
      detail: evidence.hours.published ? "Public hours are stored for opening week." : "Set public and opening-week hours.",
      green: evidence.hours.published,
      href: "/shop/identity",
      action: evidence.hours.published ? "View" : "Set hours"
    },
    {
      key: "team",
      label: `Founding team — ${evidence.team.foundingChairCount} / ${evidence.team.chairCapacity} chairs claimed`,
      detail: teamGreen ? "Every founding chair has an active barber relationship." : `${Math.max(0, evidence.team.chairCapacity - evidence.team.foundingChairCount)} founding chair${Math.max(0, evidence.team.chairCapacity - evidence.team.foundingChairCount) === 1 ? "" : "s"} still open.`,
      green: teamGreen,
      href: "/shop/team",
      action: teamGreen ? "View" : "Invite"
    },
    {
      key: "kiosk",
      label: "Kiosk paired & tested",
      detail: kioskGreen ? "The shop kiosk is enabled, labeled, and server-verified." : "Pair, label, enable, and verify the launch kiosk.",
      green: kioskGreen,
      href: "/shop/kiosk",
      action: kioskGreen ? "View" : "Pair"
    }
  ];
}

export function allPr36LaunchChecksGreen(checks: Pr36LaunchCheck[]) {
  return checks.length === 6 && checks.every((check) => check.green);
}

export function formatPr36WaitlistPosition(position: number | null) {
  if (!position || position < 1) return null;
  const remainder100 = position % 100;
  const suffix = remainder100 >= 11 && remainder100 <= 13
    ? "th"
    : position % 10 === 1
      ? "st"
      : position % 10 === 2
        ? "nd"
        : position % 10 === 3
          ? "rd"
          : "th";
  return `${position}${suffix}`;
}
