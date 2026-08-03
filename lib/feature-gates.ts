export const FEATURE_GATE_REASONS = {
  building: {
    color: "#C4F24E",
    copy: "Still being built",
    tooltip: "This feature is still being built. We’ll open this door when it is ready."
  },
  plan: {
    color: "#D9B461",
    copy: "Part of Pro",
    tooltip: "Your current plan does not open this door yet."
  },
  debug: {
    color: "#FF9B9B",
    copy: "Being looked at — back soon",
    tooltip: "We are fixing this feature before it opens again."
  },
  staged: {
    color: "rgba(245, 241, 232, 0.58)",
    copy: "Opening soon",
    tooltip: "This feature is ready for a staged opening."
  }
} as const;

export type FeatureGateReason = keyof typeof FEATURE_GATE_REASONS;
export type FeatureGateScale = "card" | "row" | "button";

export type FeatureGateDefinition = {
  reason: FeatureGateReason;
  since: string;
  owner: string;
  note: string;
};

export const GATES = {
  "client.home.group_booking": {
    reason: "building",
    since: "PR28",
    owner: "Booking",
    note: "Group booking remains visible as a future booking shape."
  },
  "culture.creator_tools": {
    reason: "building",
    since: "PR28",
    owner: "Culture",
    note: "Creator tools open after the core Culture safety loop is established."
  },
  "barber.analytics.city_benchmarks": {
    reason: "building",
    since: "PR28",
    owner: "Barber Intelligence",
    note: "City benchmarks need sufficient privacy-safe cohort data."
  },
  "owner.analytics.forecasting": {
    reason: "plan",
    since: "PR28",
    owner: "Owner Intelligence",
    note: "Forecasting belongs to the verified Pro owner plan."
  },
  "kiosk.analytics.multi_device_compare": {
    reason: "building",
    since: "PR28",
    owner: "Kiosk",
    note: "Multi-device comparison is not part of the first kiosk analytics release."
  },
  "client.analytics.style_history": {
    reason: "building",
    since: "PR28",
    owner: "Client Intelligence",
    note: "Style history opens after durable client-controlled media history."
  },
  "queue.smart_overbook": {
    reason: "debug",
    since: "PR28",
    owner: "Queue",
    note: "Smart overbook stays closed until capacity safeguards are proven."
  },
  "owner.floor.auto_rebalance": {
    reason: "building",
    since: "PR28",
    owner: "Owner Operations",
    note: "Auto-rebalance must preserve booked-client and payment ownership."
  },
  "rent.autopilot": {
    reason: "building",
    since: "PR28",
    owner: "Rent Operations",
    note: "Rent autopilot remains closed while manual rent evidence is the source of truth."
  },
  "reports.custom_builder": {
    reason: "plan",
    since: "PR28",
    owner: "Reporting",
    note: "Custom report building belongs to Pro."
  },
  "owner.reports.custom_builder": {
    reason: "plan",
    since: "PR28",
    owner: "Owner Reporting",
    note: "Custom owner report building belongs to Pro."
  },
  "messages.broadcasts": {
    reason: "plan",
    since: "PR28",
    owner: "Messaging",
    note: "Broadcast messages belong to Pro and remain consent-bound."
  },
  "barber.checkout.saved_cards": {
    reason: "building",
    since: "PR28",
    owner: "Checkout",
    note: "Saved-card checkout opens only after provider-backed payment-method truth."
  },
  "kiosk.shop.loyalty_check_in": {
    reason: "staged",
    since: "PR28",
    owner: "Kiosk",
    note: "Shop-kiosk loyalty check-in is opening in a staged release."
  },
  "kiosk.barber.loyalty_check_in": {
    reason: "staged",
    since: "PR28",
    owner: "Kiosk",
    note: "Barber-kiosk loyalty check-in is opening in a staged release."
  },
  "client.future.concierge": {
    reason: "building",
    since: "PR32",
    owner: "Client Road",
    note: "Concierge booking requires a complete server-owned booking and provider loop."
  },
  "client.future.retail_marketplace": {
    reason: "building",
    since: "PR32",
    owner: "Client Road",
    note: "Retail marketplace is distinct from live barber and shop discovery."
  },
  "client.future.family_profiles": {
    reason: "building",
    since: "PR32",
    owner: "Client Road",
    note: "Family profiles require dependent identity, consent, and payment ownership."
  },
  "client.future.open_chair_alerts": {
    reason: "building",
    since: "PR32",
    owner: "Client Road",
    note: "Open-chair alerts require server delivery caps and live eligibility truth."
  },
  "barber.future.memberships": {
    reason: "building",
    since: "PR32",
    owner: "Barber Road",
    note: "Barber memberships require complete recurring billing lifecycle truth."
  },
  "barber.future.tax_1099_pack": {
    reason: "building",
    since: "PR32",
    owner: "Barber Road",
    note: "1099 generation remains closed until reporting and review are production-ready."
  },
  "barber.future.waitlist_auto_fill": {
    reason: "building",
    since: "PR32",
    owner: "Barber Road",
    note: "Automatic waitlist fills require consent, conflict protection, and delivery proof."
  },
  "barber.future.retail_split": {
    reason: "building",
    since: "PR32",
    owner: "Barber Road",
    note: "Retail settlement requires explicit product ownership and payout routing."
  },
  "owner.future.tax_1099_pack": {
    reason: "building",
    since: "PR32",
    owner: "Owner Road",
    note: "Shop tax-document generation remains closed pending reporting review."
  },
  "owner.future.shift_scheduler": {
    reason: "building",
    since: "PR32",
    owner: "Owner Road",
    note: "Shift scheduling cannot overwrite barber availability or booked appointments."
  },
  "owner.future.marketing_blasts": {
    reason: "plan",
    since: "PR32",
    owner: "Owner Road",
    note: "Marketing broadcasts remain consent-bound and plan-gated."
  },
  "owner.future.inventory": {
    reason: "building",
    since: "PR32",
    owner: "Owner Road",
    note: "Inventory requires product, location, adjustment, and audit truth."
  }
} as const satisfies Record<string, FeatureGateDefinition>;

export type FeatureGateKey = keyof typeof GATES;

export type FeatureFlagRow = {
  key: string;
  reason: FeatureGateReason;
  enabled: boolean;
  plan_required: string | null;
};

export function isFeatureGateReason(value: unknown): value is FeatureGateReason {
  return typeof value === "string" && value in FEATURE_GATE_REASONS;
}

export function applyFeatureFlagRows(rows: FeatureFlagRow[]) {
  const overrides = new Map(rows.map((row) => [row.key, row]));

  return Object.fromEntries(
    Object.entries(GATES).map(([key, definition]) => {
      const override = overrides.get(key);
      return [
        key,
        {
          ...definition,
          reason: override && isFeatureGateReason(override.reason) ? override.reason : definition.reason,
          enabled: override?.enabled ?? false,
          planRequired: override?.plan_required ?? null
        }
      ];
    })
  ) as Record<FeatureGateKey, FeatureGateDefinition & { enabled: boolean; planRequired: string | null }>;
}
