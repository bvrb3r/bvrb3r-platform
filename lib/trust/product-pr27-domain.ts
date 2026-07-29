export const PR27_REQUIRED_SETUP_KEYS = [
  "public_profile",
  "services_prices",
  "license_verification",
  "stripe_payouts",
  "shop_link_or_independent"
] as const;

export const PR27_OPTIONAL_SETUP_KEYS = [
  "chairsync",
  "portfolio_culture",
  "chair_qr_nfc"
] as const;

export type Pr27SetupKey =
  | (typeof PR27_REQUIRED_SETUP_KEYS)[number]
  | (typeof PR27_OPTIONAL_SETUP_KEYS)[number];

export type Pr27SetupStatus = "to_do" | "in_review" | "done";

export type Pr27SetupEvidence = Partial<Record<Pr27SetupKey, Pr27SetupStatus>>;

export type Pr27SetupItem = {
  key: Pr27SetupKey;
  name: string;
  description: string;
  required: boolean;
  status: Pr27SetupStatus;
};

const SETUP_DEFINITIONS: ReadonlyArray<Omit<Pr27SetupItem, "status">> = [
  {
    key: "public_profile",
    name: "Public profile",
    description: "photo, bio, specialty — how clients find you",
    required: true
  },
  {
    key: "services_prices",
    name: "Services & prices",
    description: "your menu, your numbers — shown before any booking",
    required: true
  },
  {
    key: "license_verification",
    name: "License verification",
    description: "state license photo → review, usually same-day",
    required: true
  },
  {
    key: "stripe_payouts",
    name: "Payouts (Stripe)",
    description: "where your money lands — required before first charge",
    required: true
  },
  {
    key: "shop_link_or_independent",
    name: "Shop link or independent",
    description: "accept a shop invite, or run your own chair",
    required: true
  },
  {
    key: "chairsync",
    name: "ChairSync",
    description: "pull your Booksy/Square/theCut book in — optional, smart",
    required: false
  },
  {
    key: "portfolio_culture",
    name: "Portfolio & Culture",
    description: "post your work — profiles with photos book 3× more",
    required: false
  },
  {
    key: "chair_qr_nfc",
    name: "Chair QR / NFC",
    description: "your scannable chair for walk-up rebooking",
    required: false
  }
];

export function buildPr27BarberSetup(evidence: Pr27SetupEvidence) {
  const items: Pr27SetupItem[] = SETUP_DEFINITIONS.map((definition) => ({
    ...definition,
    status: evidence[definition.key] ?? "to_do"
  }));
  const requiredComplete = items
    .filter((item) => item.required)
    .every((item) => item.status === "done");
  const doneCount = items.filter((item) => item.status === "done").length;

  return {
    items,
    doneCount,
    totalCount: items.length,
    progressPercent: Math.round((doneCount / items.length) * 100),
    requiredComplete,
    canGoLive: requiredComplete,
    canReceiveBookings: requiredComplete,
    kioskEligible: requiredComplete,
    walkInEligible: requiredComplete
  };
}

export type Pr27DeletionEligibilityInput = {
  openBookingCount: number;
  typedConfirmation: string;
  challenge: string;
  submittedChallenge: string;
};

export type Pr27DeletionEligibility =
  | { allowed: true }
  | {
      allowed: false;
      code: "open_bookings" | "confirmation_mismatch" | "challenge_mismatch";
      message: string;
    };

export function resolvePr27DeletionEligibility(
  input: Pr27DeletionEligibilityInput
): Pr27DeletionEligibility {
  if (input.openBookingCount > 0) {
    return {
      allowed: false,
      code: "open_bookings",
      message: `Open bookings must be canceled or completed first — ${input.openBookingCount} upcoming ${input.openBookingCount === 1 ? "appointment" : "appointments"} found.`
    };
  }

  if (input.typedConfirmation.trim() !== "DELETE MY BVRB3R ACCOUNT") {
    return {
      allowed: false,
      code: "confirmation_mismatch",
      message: "Type DELETE MY BVRB3R ACCOUNT exactly."
    };
  }

  if (
    !input.challenge
    || input.submittedChallenge.trim().toUpperCase() !== input.challenge.trim().toUpperCase()
  ) {
    return {
      allowed: false,
      code: "challenge_mismatch",
      message: "The verification code does not match."
    };
  }

  return { allowed: true };
}

export type Pr27AccountLifecycleStatus =
  | "active"
  | "deactivated"
  | "deletion_grace"
  | "restored"
  | "deleted";

export function resolvePr27AccountLifecycle(input: {
  status: Pr27AccountLifecycleStatus;
  graceEndsAt?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const graceEndsAt = input.graceEndsAt ? new Date(input.graceEndsAt) : null;
  const graceExpired = input.status === "deletion_grace"
    && Boolean(graceEndsAt && graceEndsAt.getTime() <= now.getTime());

  return {
    status: graceExpired ? "deleted" as const : input.status,
    canRestore: input.status === "deletion_grace" && !graceExpired,
    profileVisible: input.status === "active" || input.status === "restored",
    notificationsEnabled: input.status === "active" || input.status === "restored",
    graceExpired
  };
}

export type Pr27CultureStrike = {
  id: string;
  issuedAt: string;
  status: "active" | "removed" | "expired";
};

export type Pr27CultureStanding = {
  activeStrikeCount: number;
  enforcement: "clear" | "warning" | "posting_pause" | "culture_ban";
  postingPausedUntil: string | null;
  bookingAndMoneyUnaffected: true;
};

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function resolvePr27CultureStanding(
  strikes: Pr27CultureStrike[],
  now = new Date()
): Pr27CultureStanding {
  const active = strikes.filter((strike) => {
    if (strike.status !== "active") return false;
    const issuedAt = new Date(strike.issuedAt);
    return Number.isFinite(issuedAt.getTime())
      && now.getTime() - issuedAt.getTime() < TWELVE_MONTHS_MS;
  });
  const latest = active
    .map((strike) => new Date(strike.issuedAt))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (active.length >= 3) {
    return {
      activeStrikeCount: active.length,
      enforcement: "culture_ban",
      postingPausedUntil: null,
      bookingAndMoneyUnaffected: true
    };
  }

  if (active.length === 2) {
    return {
      activeStrikeCount: 2,
      enforcement: "posting_pause",
      postingPausedUntil: latest
        ? new Date(latest.getTime() + SEVEN_DAYS_MS).toISOString()
        : null,
      bookingAndMoneyUnaffected: true
    };
  }

  return {
    activeStrikeCount: active.length,
    enforcement: active.length === 1 ? "warning" : "clear",
    postingPausedUntil: null,
    bookingAndMoneyUnaffected: true
  };
}

export function pr27ProfilesMutuallyHidden(
  leftProfileId: string,
  rightProfileId: string,
  blocks: Array<{ blockerProfileId: string; blockedProfileId: string; active?: boolean }>
) {
  return blocks.some((block) => (
    block.active !== false
    && (
      block.blockerProfileId === leftProfileId
      && block.blockedProfileId === rightProfileId
      || block.blockerProfileId === rightProfileId
      && block.blockedProfileId === leftProfileId
    )
  ));
}

export function resolvePr27AppealOutcome(input: {
  originalReviewerId: string;
  appealReviewerId: string;
  outcome: "upheld" | "denied";
}) {
  if (input.originalReviewerId === input.appealReviewerId) {
    return {
      allowed: false as const,
      code: "fresh_reviewer_required" as const
    };
  }

  return {
    allowed: true as const,
    restoreContent: input.outcome === "upheld",
    removeStrike: input.outcome === "upheld"
  };
}
