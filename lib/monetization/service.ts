import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";
import { canonicalAppointmentUuid, canonicalBarberUuid, canonicalClientUuid, canonicalLocationUuid } from "@/lib/booking/canonical-booking";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  buildPlatformEventIdempotencyKey,
  recordRequiredPlatformEvents,
  type PlatformEventInput
} from "@/lib/core/platform-events";
import { buildClientHistoryIntelligence } from "@/lib/engagement/intelligence";
import {
  buildBarberContributionViews,
  buildBarberRevenueIntelligence,
  buildPromotionPerformanceViews,
  buildSubscriptionPortfolioSummary,
  roundCurrency
} from "@/lib/monetization/domain";
import {
  buildMembershipPricingAdjustment,
  getClientMembershipPlan,
  listClientMembershipPlans
} from "@/lib/monetization/membership";
import type { LiveOperationsSnapshot } from "@/lib/operations/live-state";
import { isClientRole } from "@/lib/auth/roles";
import {
  cancelStripeMembershipSubscription,
  createStripeRecurringSubscription,
  createStripeBillingCustomer,
  createStripeMembershipCheckoutSession,
  retrieveStripeSubscription,
  retryStripeSubscriptionInvoice
} from "@/lib/stripe/billing";
import { StripeConnectError } from "@/lib/stripe/connect";
import { getPlatformSubscriptionPlan } from "@/lib/monetization/platform-subscriptions";
import { syncServerEntitlementFromStripeSubscription } from "@/lib/entitlements/stripe-webhook";
import { syncPr34SubscriptionInvoiceBalance } from "@/lib/billing/pr34-webhook";
import type { EngagementState } from "@/types/engagement";
import type {
  BarberRevenueIntelligenceView,
  ClientMembershipExecutionView,
  ClientMembershipValueView,
  OwnerMonetizationSummary,
  PromotionPerformanceView,
  SubscriptionBillingState,
  SubscriptionEntitlementStatus,
  SubscriptionPlanInterval,
  SubscriptionProvider,
  SubscriptionStatus,
  SubscriptionSubjectType,
  SubscriptionSummaryView
} from "@/types/monetization";
import type {
  BillingHistoryEventView,
  BillingHistoryView,
  BillingInvoiceStatus,
  BillingInvoiceView
} from "@/types/fintech";
import type { AppointmentStatus, UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type LocationRow = {
  id: string;
  reference_code: string | null;
  name: string;
  neighborhood: string;
  city: string;
  state: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string;
};

type BarberRow = {
  id: string;
  reference_code: string | null;
  profile_id: string;
};

type ClientRow = {
  id: string;
  reference_code: string | null;
  profile_id: string | null;
};

type StaffLocationRow = {
  location_id: string;
  profile_id: string;
};

type BillingSubscriptionRow = {
  id: string;
  subject_type: SubscriptionSubjectType;
  barber_id: string | null;
  shop_id: string | null;
  client_id: string | null;
  provider: SubscriptionProvider;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  provider_price_id: string | null;
  plan_code: string;
  plan_name: string;
  plan_interval: SubscriptionPlanInterval;
  unit_amount_cents: number;
  currency: string;
  subscription_status: SubscriptionStatus;
  billing_state: SubscriptionBillingState;
  entitlement_status: SubscriptionEntitlementStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at: string | null;
  last_invoiced_at: string | null;
  last_paid_at: string | null;
  retry_count: number;
  last_failed_at: string | null;
  next_retry_at: string | null;
  last_retry_requested_at: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string;
};

type BillingInvoiceHistoryRow = {
  id: string;
  subscription_id: string;
  client_id: string | null;
  provider_invoice_id: string;
  provider_subscription_id: string | null;
  status: BillingInvoiceStatus;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  invoice_created_at: string;
  invoice_due_at: string | null;
  paid_at: string | null;
  attempt_count: number;
  last_error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type BillingCustomerRow = {
  id: string;
  profile_id: string;
  provider: string;
  provider_customer_id: string;
  default_payment_method_id: string | null;
};

type PaymentRoutingRow = {
  appointment_id: string | null;
  platform_fee_amount: number | string;
  provider_fee_amount: number | string;
};

type PromotionRow = {
  id: string;
  shop_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
};

type PromotionRedemptionRow = {
  promotion_id: string;
  appointment_id: string | null;
  discount_amount: number | string;
};

type RevenueSnapshotAppointment = {
  id: string;
  clientId: string;
  clientName: string;
  barberId: string;
  barberName: string;
  serviceName: string;
  locationId: string;
  start: string;
  totalAmount: number;
  balanceDue: number;
  tipAmount: number;
  status: string;
};

const BILLING_SUBSCRIPTION_SELECT = [
  "id",
  "subject_type",
  "barber_id",
  "shop_id",
  "client_id",
  "provider",
  "provider_subscription_id",
  "provider_customer_id",
  "provider_price_id",
  "plan_code",
  "plan_name",
  "plan_interval",
  "unit_amount_cents",
  "currency",
  "subscription_status",
  "billing_state",
  "entitlement_status",
  "current_period_start",
  "current_period_end",
  "trial_ends_at",
  "cancel_at",
  "last_invoiced_at",
  "last_paid_at",
  "retry_count",
  "last_failed_at",
  "next_retry_at",
  "last_retry_requested_at",
  "metadata",
  "updated_at"
].join(", ");

const BILLING_INVOICE_SELECT = [
  "id",
  "subscription_id",
  "client_id",
  "provider_invoice_id",
  "provider_subscription_id",
  "status",
  "amount_due_cents",
  "amount_paid_cents",
  "currency",
  "hosted_invoice_url",
  "invoice_pdf_url",
  "invoice_created_at",
  "invoice_due_at",
  "paid_at",
  "attempt_count",
  "last_error",
  "metadata",
  "created_at",
  "updated_at"
].join(", ");

function numeric(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function formatShopLabel(location: Pick<LocationRow, "name" | "neighborhood" | "city" | "state">) {
  const area = [location.neighborhood, location.city].filter(Boolean).join(" / ");
  return area ? `${location.name} / ${area}` : [location.name, location.state].filter(Boolean).join(" / ");
}

function mapBillingInvoiceView(row: BillingInvoiceHistoryRow): BillingInvoiceView {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    providerInvoiceId: row.provider_invoice_id,
    status: row.status,
    amountDue: roundCurrency(row.amount_due_cents / 100),
    amountPaid: roundCurrency(row.amount_paid_cents / 100),
    currency: row.currency,
    hostedInvoiceUrl: row.hosted_invoice_url,
    invoicePdfUrl: row.invoice_pdf_url,
    invoiceCreatedAt: row.invoice_created_at,
    invoiceDueAt: row.invoice_due_at,
    paidAt: row.paid_at,
    attemptCount: row.attempt_count,
    lastError: row.last_error
  };
}

function fallbackShopLabel(locationId: string) {
  return locationId;
}

function fallbackBarberName(barberId: string) {
  return barberId;
}

function isPlatformSubscriptionSubjectType(
  value: SubscriptionSubjectType
): value is Extract<SubscriptionSubjectType, "barber" | "shop"> {
  return value === "barber" || value === "shop";
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function buildMembershipLifecycleEvents(input: {
  previous: BillingSubscriptionRow;
  next: BillingSubscriptionRow;
}): PlatformEventInput[] {
  const events: PlatformEventInput[] = [];
  const entityId = input.next.id;
  const relatedIds = {
    subscriptionId: input.next.id,
    clientId: input.next.client_id,
    providerSubscriptionId: input.next.provider_subscription_id,
    providerCustomerId: input.next.provider_customer_id
  };

  if (
    !["active", "trialing"].includes(input.previous.subscription_status)
    && ["active", "trialing"].includes(input.next.subscription_status)
  ) {
    events.push({
      eventType: "membership_started",
      entityType: "billing_subscription",
      entityId,
      actorId: input.next.client_id,
      actorRole: "client",
      source: "system",
      relatedIds,
      payload: {
        planCode: input.next.plan_code,
        planName: input.next.plan_name,
        subscriptionStatus: input.next.subscription_status,
        billingState: input.next.billing_state,
        entitlementStatus: input.next.entitlement_status
      },
      idempotencyKey: buildPlatformEventIdempotencyKey(["membership", entityId, "started", input.next.updated_at]),
      occurredAt: input.next.updated_at
    });
  }

  if (
    input.previous.subscription_status !== "cancelled"
    && input.next.subscription_status === "cancelled"
  ) {
    events.push({
      eventType: "membership_canceled",
      entityType: "billing_subscription",
      entityId,
      actorId: input.next.client_id,
      actorRole: "client",
      source: "system",
      relatedIds,
      payload: {
        planCode: input.next.plan_code,
        billingState: input.next.billing_state
      },
      idempotencyKey: buildPlatformEventIdempotencyKey(["membership", entityId, "canceled", input.next.updated_at]),
      occurredAt: input.next.updated_at
    });
  }

  if (
    input.previous.billing_state !== "past_due"
    && input.next.billing_state === "past_due"
  ) {
    events.push({
      eventType: "membership_past_due",
      entityType: "billing_subscription",
      entityId,
      actorId: input.next.client_id,
      actorRole: "client",
      source: "system",
      relatedIds,
      payload: {
        planCode: input.next.plan_code,
        subscriptionStatus: input.next.subscription_status,
        entitlementStatus: input.next.entitlement_status
      },
      idempotencyKey: buildPlatformEventIdempotencyKey(["membership", entityId, "past_due", input.next.updated_at]),
      occurredAt: input.next.updated_at
    });
  }

  return events;
}

export class MonetizationServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MonetizationServiceError";
    this.status = status;
  }
}

function getScopeLocationIds(snapshot: LiveOperationsSnapshot, locationIds: string[]) {
  if (locationIds.length) {
    return Array.from(new Set(locationIds));
  }

  const snapshotLocationIds = Array.from(new Set(snapshot.appointments.map((appointment) => appointment.locationId)));
  return snapshotLocationIds;
}

async function readLocationsByReference(supabase: SupabaseClient, locationIds: string[]) {
  if (!locationIds.length) {
    return new Map<string, LocationRow>();
  }

  const result = await supabase
    .from("locations")
    .select("id, reference_code, name, neighborhood, city, state")
    .in("id", locationIds.map((locationId) => canonicalLocationUuid(locationId)));

  if (result.error) {
    return new Map<string, LocationRow>();
  }

  const rows = (result.data ?? []) as LocationRow[];
  return new Map(
    rows.flatMap((row) => ([
      [row.id, row],
      [row.reference_code ?? row.id, row]
    ]))
  );
}

async function readBarbersForLocations(supabase: SupabaseClient, locationIds: string[]) {
  if (!locationIds.length) {
    return [] as Array<BarberRow & { profile: ProfileRow; locationIds: string[] }>;
  }

  const membershipsResult = await supabase
    .from("staff_locations")
    .select("location_id, profile_id")
    .in("location_id", locationIds.map((locationId) => canonicalLocationUuid(locationId)));

  if (membershipsResult.error) {
    return [];
  }

  const memberships = (membershipsResult.data ?? []) as StaffLocationRow[];
  const profileIds = Array.from(new Set(memberships.map((row) => row.profile_id)));
  if (!profileIds.length) {
    return [];
  }

  const [barbersResult, profilesResult] = await Promise.all([
    supabase
      .from("barbers")
      .select("id, reference_code, profile_id")
      .in("profile_id", profileIds),
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", profileIds)
  ]);

  if (barbersResult.error || profilesResult.error) {
    return [];
  }

  const profilesById = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((row) => [row.id, row]));
  const locationIdsByProfile = new Map<string, string[]>();
  for (const membership of memberships) {
    const refs = locationIdsByProfile.get(membership.profile_id) ?? [];
    const locationReference = locationIds.find((locationId) => canonicalLocationUuid(locationId) === membership.location_id) ?? membership.location_id;
    if (!refs.includes(locationReference)) {
      refs.push(locationReference);
      locationIdsByProfile.set(membership.profile_id, refs);
    }
  }

  return ((barbersResult.data ?? []) as BarberRow[])
    .map((barber) => {
      const profile = profilesById.get(barber.profile_id);
      if (!profile) {
        return null;
      }

      return {
        ...barber,
        profile,
        locationIds: locationIdsByProfile.get(barber.profile_id) ?? []
      };
    })
    .filter((row): row is BarberRow & { profile: ProfileRow; locationIds: string[] } => Boolean(row));
}

function createDefaultSubscriptionRow(input: {
  subjectType: SubscriptionSubjectType;
  subjectId: string;
  createdBy?: string | null;
}) {
  const now = new Date().toISOString();
  const clientPlan = getClientMembershipPlan("client_core_monthly");
  const platformPlan = isPlatformSubscriptionSubjectType(input.subjectType)
    ? getPlatformSubscriptionPlan(input.subjectType)
    : null;
  return {
    subject_type: input.subjectType,
    barber_id: input.subjectType === "barber" ? canonicalBarberUuid(input.subjectId) : null,
    shop_id: input.subjectType === "shop" ? canonicalLocationUuid(input.subjectId) : null,
    client_id: input.subjectType === "client" ? canonicalClientUuid(input.subjectId) : null,
    provider: "stripe_billing",
    provider_subscription_id: null,
    provider_customer_id: null,
    provider_price_id: null,
    plan_code: platformPlan?.planCode ?? clientPlan?.planCode ?? "client_core_monthly",
    plan_name: platformPlan?.planName ?? clientPlan?.planName ?? "Client Core",
    plan_interval: input.subjectType === "client"
      ? (clientPlan?.planInterval ?? "monthly")
      : platformPlan?.interval ?? "weekly",
    unit_amount_cents: input.subjectType === "client"
      ? Math.round((clientPlan?.unitAmount ?? 19) * 100)
      : Math.round((platformPlan?.unitAmount ?? 0) * 100),
    currency: "usd",
    subscription_status: "draft",
    billing_state: "not_started",
    entitlement_status: input.subjectType === "client" ? "locked" : "limited",
    current_period_start: null,
    current_period_end: null,
    trial_ends_at: null,
    cancel_at: null,
    last_invoiced_at: null,
    last_paid_at: null,
    metadata: {
      source: "phase19_monetization",
      billingCadence: input.subjectType === "client" ? (clientPlan?.planInterval ?? "monthly") : (platformPlan?.interval ?? "weekly"),
      autoChargeTarget: input.subjectType === "client" ? "membership" : "platform_subscription"
    },
    created_by: input.createdBy ?? null,
    created_at: now,
    updated_at: now
  };
}

async function ensureBillingSubscriptions(
  supabase: SupabaseClient,
  input: {
    shopIds: string[];
    barberIds: string[];
    clientIds?: string[];
    createdBy?: string | null;
  }
) {
  const existingRows = await readBillingSubscriptions(supabase, {
    shopIds: input.shopIds,
    barberIds: input.barberIds,
    clientIds: input.clientIds
  });
  const existingShopIds = new Set(existingRows.filter((row) => row.shop_id).map((row) => row.shop_id as string));
  const existingBarberIds = new Set(existingRows.filter((row) => row.barber_id).map((row) => row.barber_id as string));
  const existingClientIds = new Set(existingRows.filter((row) => row.client_id).map((row) => row.client_id as string));
  const inserts = [
    ...input.shopIds
      .filter((shopId) => !existingShopIds.has(canonicalLocationUuid(shopId)))
      .map((shopId) => createDefaultSubscriptionRow({ subjectType: "shop", subjectId: shopId, createdBy: input.createdBy })),
    ...input.barberIds
      .filter((barberId) => !existingBarberIds.has(canonicalBarberUuid(barberId)))
      .map((barberId) => createDefaultSubscriptionRow({ subjectType: "barber", subjectId: barberId, createdBy: input.createdBy })),
    ...(input.clientIds ?? [])
      .filter((clientId) => !existingClientIds.has(canonicalClientUuid(clientId)))
      .map((clientId) => createDefaultSubscriptionRow({ subjectType: "client", subjectId: clientId, createdBy: input.createdBy }))
  ];

  if (inserts.length) {
    const insertResult = await supabase.from("billing_subscriptions").insert(inserts);
    if (insertResult.error) {
      throw new MonetizationServiceError("Unable to create the canonical billing subscription row.", 500);
    }
  }

  return readBillingSubscriptions(supabase, {
    shopIds: input.shopIds,
    barberIds: input.barberIds,
    clientIds: input.clientIds
  });
}

async function readBillingSubscriptions(
  supabase: SupabaseClient,
  input: {
    shopIds: string[];
    barberIds: string[];
    clientIds?: string[];
  }
) {
  const shopUuids = input.shopIds.map((shopId) => canonicalLocationUuid(shopId));
  const barberUuids = input.barberIds.map((barberId) => canonicalBarberUuid(barberId));
  const clientUuids = (input.clientIds ?? []).map((clientId) => canonicalClientUuid(clientId));

  if (!shopUuids.length && !barberUuids.length && !clientUuids.length) {
    return [] as BillingSubscriptionRow[];
  }

  const filters = [
    shopUuids.length ? `shop_id.in.(${shopUuids.join(",")})` : null,
    barberUuids.length ? `barber_id.in.(${barberUuids.join(",")})` : null,
    clientUuids.length ? `client_id.in.(${clientUuids.join(",")})` : null
  ].filter(Boolean).join(",");
  const finalRowsResult = await supabase
    .from("billing_subscriptions")
    .select(BILLING_SUBSCRIPTION_SELECT)
    .or(filters);

  if (finalRowsResult.error) {
    throw new MonetizationServiceError("Unable to load canonical billing subscriptions.", 500);
  }

  return (finalRowsResult.data ?? []) as unknown as BillingSubscriptionRow[];
}

function toSubscriptionView(
  row: BillingSubscriptionRow,
  labels: {
    shopLabels: Map<string, string>;
    barberLabels: Map<string, string>;
    clientLabels?: Map<string, string>;
  }
) {
  const subjectId = row.subject_type === "shop"
    ? row.shop_id ?? "shop"
    : row.subject_type === "barber"
      ? row.barber_id ?? "barber"
      : row.client_id ?? "client";

  const displayName = row.subject_type === "shop"
    ? labels.shopLabels.get(row.shop_id ?? "") ?? row.shop_id ?? "Shop"
    : row.subject_type === "barber"
      ? labels.barberLabels.get(row.barber_id ?? "") ?? row.barber_id ?? "Barber"
      : labels.clientLabels?.get(row.client_id ?? "") ?? row.client_id ?? "Client membership";

  return {
    id: row.id,
    subjectType: row.subject_type,
    subjectId,
    displayName,
    provider: row.provider,
    providerSubscriptionId: row.provider_subscription_id ?? undefined,
    providerCustomerId: row.provider_customer_id ?? undefined,
    providerPriceId: row.provider_price_id ?? undefined,
    planCode: row.plan_code,
    planName: row.plan_name,
    planInterval: row.plan_interval,
    unitAmount: roundCurrency(row.unit_amount_cents / 100),
    currency: row.currency,
    subscriptionStatus: row.subscription_status,
    billingState: row.billing_state,
    entitlementStatus: row.entitlement_status,
    currentPeriodStart: row.current_period_start ?? undefined,
    currentPeriodEnd: row.current_period_end ?? undefined,
    trialEndsAt: row.trial_ends_at ?? undefined,
    cancelAt: row.cancel_at ?? undefined,
    lastInvoicedAt: row.last_invoiced_at ?? undefined,
    lastPaidAt: row.last_paid_at ?? undefined,
    updatedAt: row.updated_at
  } satisfies SubscriptionSummaryView;
}

function humanizeSubscriptionStatus(value: string) {
  return value.replaceAll("_", " ");
}

function buildClientMembershipPerkLabels(input: {
  pointsBalance: number;
  referralCredits: number;
  nextDueAt?: string | null;
  unlockedRewardCount: number;
  subscription: SubscriptionSummaryView;
}) {
  const perks = [
    `${input.pointsBalance} points active in your loyalty balance`,
    input.referralCredits
      ? `${input.referralCredits} referral credit${input.referralCredits === 1 ? "" : "s"} ready to influence the next visit`
      : "Referral rewards can stack into future visits",
    input.unlockedRewardCount
      ? `${input.unlockedRewardCount} reward${input.unlockedRewardCount === 1 ? "" : "s"} ready to claim`
      : "Keep booking to unlock the next reward tier"
  ];

  if (input.nextDueAt) {
    perks.push(`Your next recommended booking window is ${new Date(input.nextDueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
  }

  if (input.subscription.entitlementStatus === "enabled") {
    perks.push("Membership-backed booking perks are active");
  } else if (input.subscription.entitlementStatus === "limited") {
    perks.push("Membership value is building while setup completes");
  }

  return perks.slice(0, 4);
}

function getSubscriptionPriority(subscription: Pick<SubscriptionSummaryView, "subscriptionStatus" | "billingState" | "entitlementStatus"> | null | undefined) {
  if (!subscription) {
    return 0;
  }

  const statusScore = subscription.subscriptionStatus === "active"
    ? 5
    : subscription.subscriptionStatus === "trialing"
      ? 4
      : subscription.subscriptionStatus === "past_due"
        ? 3
        : subscription.subscriptionStatus === "cancelled"
          ? 1
          : 2;
  const entitlementScore = subscription.entitlementStatus === "enabled"
    ? 2
    : subscription.entitlementStatus === "limited"
      ? 1
      : 0;
  const billingScore = subscription.billingState === "current"
    ? 1
    : subscription.billingState === "pending"
      ? 0.5
      : 0;

  return statusScore + entitlementScore + billingScore;
}

function buildClientLabelMaps(clientId: string, clientName?: string) {
  return new Map<string, string>([
    [clientId, clientName ?? "Your BVRB3R membership"],
    [canonicalClientUuid(clientId), clientName ?? "Your BVRB3R membership"]
  ]);
}

function selectClientSubscriptionView(subscriptions: SubscriptionSummaryView[]) {
  return [...subscriptions].sort((left, right) =>
    getSubscriptionPriority(right) - getSubscriptionPriority(left)
    || right.unitAmount - left.unitAmount
    || left.planName.localeCompare(right.planName)
  )[0] ?? null;
}

function buildClientMembershipValueFromSubscription(input: {
  clientName?: string;
  pointsBalance: number;
  referralCredits: number;
  unlockedRewardCount: number;
  nextDueAt?: string | null;
  subscription: SubscriptionSummaryView;
}) {
  const activePlan = getClientMembershipPlan(input.subscription.planCode);
  const isActive = input.subscription.subscriptionStatus === "active" || input.subscription.subscriptionStatus === "trialing";
  const valueHeadline = isActive
    ? `${input.subscription.planName} is active`
    : `${input.subscription.planName} is ready to activate`;
  const valueMessage = isActive
    ? "Member pricing, loyalty acceleration, and recurring-client perks are now connected to your live booking flow."
    : "This membership plan is now tracked in canonical billing state, so you can activate member pricing and perks without leaving the client experience.";
  const pricingPerkLabel = activePlan?.perkLabels[0] ?? "Member pricing supported";

  return {
    subscriptionId: input.subscription.id,
    provider: input.subscription.provider,
    providerCustomerId: input.subscription.providerCustomerId,
    planCode: input.subscription.planCode,
    sourceLabel: input.clientName ?? "Your BVRB3R membership",
    planName: input.subscription.planName,
    subscriptionStatus: input.subscription.subscriptionStatus,
    billingState: input.subscription.billingState,
    entitlementStatus: input.subscription.entitlementStatus,
    valueHeadline,
    valueMessage,
    savingsMessage: isActive
      ? `Member pricing is active. ${pricingPerkLabel.toLowerCase()} now applies in booking when the subscription is current.`
      : `Activate ${input.subscription.planName} to unlock ${pricingPerkLabel.toLowerCase()} and stronger loyalty value.`,
    renewalMessage: input.subscription.currentPeriodEnd
      ? `Current period ends ${new Date(input.subscription.currentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`
      : input.subscription.cancelAt
        ? `Cancellation is set for ${new Date(input.subscription.cancelAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`
        : `Status ${humanizeSubscriptionStatus(input.subscription.subscriptionStatus)} | billing ${humanizeSubscriptionStatus(input.subscription.billingState)}.`,
    perkLabels: buildClientMembershipPerkLabels({
      pointsBalance: input.pointsBalance,
      referralCredits: input.referralCredits,
      nextDueAt: input.nextDueAt,
      unlockedRewardCount: input.unlockedRewardCount,
      subscription: input.subscription
    }),
    estimatedSavingsAmount: activePlan ? roundCurrency(Math.min(activePlan.unitAmount * 0.5, 10)) : undefined,
    pricingPerkLabel,
    canSubscribe: !isActive,
    canCancel: Boolean(input.subscription.providerSubscriptionId) && isActive
  } satisfies ClientMembershipValueView;
}

function buildFallbackClientMembershipExecution(input: {
  clientName?: string;
  pointsBalance: number;
  referralCredits: number;
  unlockedRewardCount: number;
  nextDueAt?: string | null;
}) {
  void input;
  const plans = listClientMembershipPlans();
  const activePlan = plans.find((plan) => plan.highlighted) ?? plans[0] ?? null;

  return {
    subscription: null,
    value: null,
    membershipStatus: "none",
    tier: "none",
    active: false,
    points: 0,
    plans,
    activePlan,
    pricingAdjustment: null,
    canSubscribe: true,
    canCancel: false
  } satisfies ClientMembershipExecutionView;
}

function promotionAvailabilityState(row: PromotionRow): PromotionPerformanceView["availabilityState"] {
  const now = new Date().toISOString();
  if (!row.is_active) {
    return "inactive";
  }
  if (row.starts_at > now) {
    return "scheduled";
  }
  if (row.ends_at < now) {
    return "expired";
  }
  return "active";
}

async function readPaymentRoutingRows(supabase: SupabaseClient, appointmentIds: string[]) {
  if (!appointmentIds.length) {
    return [] as PaymentRoutingRow[];
  }

  const result = await supabase
    .from("payment_routing_records")
    .select("appointment_id, platform_fee_amount, provider_fee_amount")
    .in("appointment_id", appointmentIds.map((appointmentId) => canonicalAppointmentUuid(appointmentId)));

  return (result.data ?? []) as PaymentRoutingRow[];
}

async function readPromotionPerformanceData(supabase: SupabaseClient, locationIds: string[]) {
  const locationUuids = locationIds.map((locationId) => canonicalLocationUuid(locationId));
  if (!locationUuids.length) {
    return {
      promotions: [] as PromotionRow[],
      redemptions: [] as PromotionRedemptionRow[]
    };
  }

  const promotionsResult = await supabase
    .from("promotions")
    .select("id, shop_id, name, code, is_active, starts_at, ends_at")
    .in("shop_id", locationUuids);

  const promotions = (promotionsResult.data ?? []) as PromotionRow[];
  if (!promotions.length) {
    return {
      promotions,
      redemptions: [] as PromotionRedemptionRow[]
    };
  }

  const redemptionsResult = await supabase
    .from("promotion_redemptions")
    .select("promotion_id, appointment_id, discount_amount")
    .in("promotion_id", promotions.map((promotion) => promotion.id));

  return {
    promotions,
    redemptions: (redemptionsResult.data ?? []) as PromotionRedemptionRow[]
  };
}

function buildRevenueAppointments(snapshot: LiveOperationsSnapshot) {
  const clientById = new Map(snapshot.clients.map((client) => [client.id, client]));
  return snapshot.appointments.map((appointment) => ({
    id: appointment.id,
    clientId: appointment.clientId,
    clientName: clientById.get(appointment.clientId)?.name ?? appointment.clientId,
    barberId: appointment.barberId,
    barberName: fallbackBarberName(appointment.barberId),
    serviceName: appointment.serviceId,
    locationId: appointment.locationId,
    start: appointment.start,
    totalAmount: appointment.totalAmount,
    balanceDue: appointment.balanceDue,
    tipAmount: appointment.tipAmount,
    status: appointment.status
  })) satisfies RevenueSnapshotAppointment[];
}

function buildAppointmentRevenueMap(appointments: RevenueSnapshotAppointment[]) {
  return new Map(appointments.map((appointment) => [canonicalAppointmentUuid(appointment.id), appointment.totalAmount]));
}

function buildShopLabelMaps(locationIds: string[], locationRows: Map<string, LocationRow>) {
  const shopLabels = new Map<string, string>();
  for (const locationId of locationIds) {
    const row = locationRows.get(locationId) ?? locationRows.get(canonicalLocationUuid(locationId));
    const label = row ? formatShopLabel(row) : fallbackShopLabel(locationId);
    shopLabels.set(locationId, label);
    shopLabels.set(canonicalLocationUuid(locationId), label);
  }
  return shopLabels;
}

function buildBarberLabelMaps(barberIds: string[], scopedBarbers: Array<BarberRow & { profile: ProfileRow; locationIds: string[] }>) {
  const barberLabels = new Map<string, string>();
  for (const barberId of barberIds) {
    const row = scopedBarbers.find((barber) => barber.reference_code === barberId || barber.id === canonicalBarberUuid(barberId));
    const label = row?.profile.full_name ?? fallbackBarberName(barberId);
    barberLabels.set(barberId, label);
    barberLabels.set(canonicalBarberUuid(barberId), label);
  }
  return barberLabels;
}

function getCompletedAppointmentsInScope(appointments: RevenueSnapshotAppointment[], locationIds: string[]) {
  const scoped = locationIds.length ? appointments.filter((appointment) => locationIds.includes(appointment.locationId)) : appointments;
  return scoped.filter((appointment) => appointment.status === "completed");
}

function computeGrowthMetrics(
  state: EngagementState,
  snapshot: LiveOperationsSnapshot,
  completedAppointments: RevenueSnapshotAppointment[]
) {
  const clientByEmail = new Map(snapshot.clients.map((client) => [client.email.toLowerCase(), client.id]));
  const loyaltyClientIds = new Set(state.loyaltyAccounts.filter((account) => account.pointsBalance > 0).map((account) => account.clientId));
  const referralClientIds = new Set(
    state.referralEvents
      .filter((event) => event.status === "completed" || event.status === "credited")
      .map((event) => clientByEmail.get(event.referredClientEmail.toLowerCase()))
      .filter((clientId): clientId is string => Boolean(clientId))
  );

  return {
    referralConversions: state.referralEvents.filter((event) => event.status === "completed" || event.status === "credited").length,
    referralConversionRevenue: roundCurrency(completedAppointments.filter((appointment) => referralClientIds.has(appointment.clientId)).reduce((sum, appointment) => sum + appointment.totalAmount, 0)),
    loyaltyParticipants: state.loyaltyAccounts.filter((account) => loyaltyClientIds.has(account.clientId)).length,
    loyaltyRedemptions: state.loyaltyTransactions.filter((transaction) => transaction.reason === "reward_redemption" && loyaltyClientIds.has(transaction.clientId)).length,
    loyaltyRevenue: roundCurrency(completedAppointments.filter((appointment) => loyaltyClientIds.has(appointment.clientId)).reduce((sum, appointment) => sum + appointment.totalAmount, 0))
  };
}

function computeRepeatClientRevenue(appointments: RevenueSnapshotAppointment[]) {
  const counts = new Map<string, number>();
  for (const appointment of appointments) {
    counts.set(appointment.clientId, (counts.get(appointment.clientId) ?? 0) + 1);
  }

  return roundCurrency(
    appointments
      .filter((appointment) => (counts.get(appointment.clientId) ?? 0) >= 2)
      .reduce((sum, appointment) => sum + appointment.totalAmount, 0)
  );
}

function computeRevenueAtRisk(state: EngagementState, snapshot: LiveOperationsSnapshot, locationIds: string[]) {
  const scopedAppointments = snapshot.appointments.filter((appointment) => !locationIds.length || locationIds.includes(appointment.locationId));
  const clientById = new Map(snapshot.clients.map((client) => [client.id, client]));
  const clientIds = Array.from(new Set(scopedAppointments.map((appointment) => appointment.clientId)));

  return roundCurrency(clientIds.reduce((sum, clientId) => {
    const client = clientById.get(clientId);
    if (!client) {
      return sum;
    }

    const appointments = scopedAppointments.filter((appointment) => appointment.clientId === clientId);
    const intelligence = buildClientHistoryIntelligence({ client, appointments, updatedAt: new Date().toISOString() });
    if (intelligence.activeAppointmentCount > 0 || (intelligence.churnRisk !== "high" && !intelligence.reengagementEligible)) {
      return sum;
    }

    const completed = appointments.filter((appointment) => appointment.status === "completed");
    if (!completed.length) {
      return sum;
    }

    const averageTicket = completed.reduce((ticketSum, appointment) => ticketSum + appointment.totalAmount, 0) / completed.length;
    return sum + averageTicket;
  }, 0));
}

async function syncOwnerSnapshots(
  supabase: SupabaseClient,
  input: {
    locationIds: string[];
    summary: OwnerMonetizationSummary;
    locationRevenueMap: Map<string, { grossRevenue: number; completedServices: number; appointmentCount: number; repeatClientRevenue: number }>;
  }
) {
  const now = new Date().toISOString();
  const locationRows = input.locationIds.map((locationId) => ({
    location_id: canonicalLocationUuid(locationId),
    gross_revenue: input.locationRevenueMap.get(locationId)?.grossRevenue ?? 0,
    completed_services: input.locationRevenueMap.get(locationId)?.completedServices ?? 0,
    appointment_count: input.locationRevenueMap.get(locationId)?.appointmentCount ?? 0,
    platform_fee_revenue: input.summary.revenue.platformFeeRevenue,
    processor_fee_visibility: input.summary.revenue.processorFeeVisibility,
    subscription_revenue: input.summary.revenue.subscriptionRevenue,
    promotion_discount_impact: input.summary.promotions.totalDiscountImpact,
    promotion_attributed_revenue: input.summary.promotions.attributedRevenue,
    repeat_client_revenue: input.locationRevenueMap.get(locationId)?.repeatClientRevenue ?? 0,
    retained_revenue_share: input.summary.revenue.retainedRevenueShare,
    revenue_at_risk: input.summary.revenue.revenueAtRisk,
    referral_conversion_count: input.summary.growth.referralConversions,
    referral_conversion_revenue: input.summary.growth.referralConversionRevenue,
    loyalty_participants: input.summary.growth.loyaltyParticipants,
    loyalty_redemptions: input.summary.growth.loyaltyRedemptions,
    loyalty_revenue: input.summary.growth.loyaltyRevenue,
    rebooking_influenced_revenue: input.summary.growth.rebookingInfluencedRevenue,
    top_offers: input.summary.promotions.topOffers,
    barber_contribution: input.summary.barberContribution,
    updated_at: now
  }));

  if (locationRows.length) {
    await supabase.from("location_monetization_snapshots").upsert(locationRows, { onConflict: "location_id" });
  }

  const promotionRows = input.summary.promotions.topOffers.map((offer) => ({
    promotion_id: offer.promotionId,
    shop_id: canonicalLocationUuid(offer.shopId),
    redemptions: offer.redemptions,
    discount_impact: offer.discountImpact,
    attributed_revenue: offer.attributedRevenue,
    net_revenue_after_discount: offer.netRevenueAfterDiscount,
    average_discount: offer.averageDiscount,
    updated_at: now
  }));

  if (promotionRows.length) {
    await supabase.from("promotion_performance_snapshots").upsert(promotionRows, { onConflict: "promotion_id" });
  }
}

async function syncBarberRevenueSnapshot(
  supabase: SupabaseClient,
  barberId: string,
  intelligence: BarberRevenueIntelligenceView,
  appointments: RevenueSnapshotAppointment[]
) {
  const now = new Date().toISOString();
  const grossRevenue = roundCurrency(
    appointments.filter((appointment) => appointment.status === "completed").reduce((sum, appointment) => sum + appointment.totalAmount, 0)
  );

  await supabase.from("barber_revenue_snapshots").upsert({
    barber_id: canonicalBarberUuid(barberId),
    gross_revenue: grossRevenue,
    week_revenue: intelligence.weekRevenue,
    month_revenue: intelligence.monthRevenue,
    repeat_client_revenue: intelligence.repeatClientRevenue,
    repeat_client_share: intelligence.repeatClientShare,
    outstanding_balance: intelligence.outstandingBalance,
    average_tip: intelligence.averageTip,
    top_clients: intelligence.topClients,
    service_mix: intelligence.serviceMix,
    trends: intelligence.trends,
    updated_at: now
  }, { onConflict: "barber_id" });
}

async function readClientIdentity(
  supabase: SupabaseClient,
  clientId: string
) {
  const clientResult = await supabase
    .from("clients")
    .select("id, reference_code, profile_id")
    .eq("id", canonicalClientUuid(clientId))
    .maybeSingle();

  if (clientResult.error) {
    throw new MonetizationServiceError("Unable to load the client membership profile.", 500);
  }

  if (!clientResult.data) {
    throw new MonetizationServiceError("Client membership profile not found.", 404);
  }

  const clientRow = clientResult.data as ClientRow;
  let profile: ProfileRow | null = null;

  if (clientRow.profile_id) {
    const profileResult = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", clientRow.profile_id)
      .maybeSingle();

    if (profileResult.error) {
      throw new MonetizationServiceError("Unable to load the client membership profile.", 500);
    }

    profile = (profileResult.data as ProfileRow | null) ?? null;
  }

  return {
    client: clientRow,
    profile
  };
}

function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "paused":
      return "paused";
    case "incomplete":
    case "incomplete_expired":
      return "draft";
    default:
      return "draft";
  }
}

function mapStripeBillingState(subscription: Stripe.Subscription): SubscriptionBillingState {
  if (subscription.cancel_at_period_end || subscription.status === "canceled") {
    return "cancelled";
  }

  if (subscription.status === "past_due" || subscription.status === "unpaid") {
    return "past_due";
  }

  if (subscription.status === "trialing" || subscription.status === "active") {
    return "current";
  }

  return "pending";
}

function mapStripeEntitlementStatus(subscription: Stripe.Subscription): SubscriptionEntitlementStatus {
  return subscription.status === "active" || subscription.status === "trialing"
    ? "enabled"
    : subscription.status === "past_due"
      ? "limited"
      : "locked";
}

function mapStripePlanInterval(interval: Stripe.Price.Recurring.Interval | null | undefined): SubscriptionPlanInterval {
  if (interval === "week") {
    return "weekly";
  }

  if (interval === "year") {
    return "annual";
  }

  if (interval === "month") {
    return "monthly";
  }

  return "custom";
}

async function upsertStripeBillingCustomerForProfile(input: {
  supabase: SupabaseClient;
  profileId: string;
  email: string;
  fullName: string;
  metadata: Record<string, string>;
  providerCustomerId?: string | null;
}) {
  const existingResult = await input.supabase
    .from("billing_customers")
    .select("id, profile_id, provider, provider_customer_id, default_payment_method_id")
    .eq("profile_id", input.profileId)
    .eq("provider", "stripe")
    .maybeSingle();

  if (existingResult.error) {
    throw new MonetizationServiceError("Unable to load the Stripe billing customer bridge.", 500);
  }

  if (existingResult.data) {
    return existingResult.data as BillingCustomerRow;
  }

  const providerCustomerId = input.providerCustomerId?.trim() || null;
  let customerId = providerCustomerId;
  if (!customerId) {
    let customer: Stripe.Customer;
    try {
      customer = await createStripeBillingCustomer({
        email: input.email,
        name: input.fullName,
        metadata: input.metadata
      });
    } catch (error) {
      if (error instanceof StripeConnectError) {
        throw new MonetizationServiceError(error.message, error.status);
      }
      throw error;
    }
    customerId = customer.id;
  }

  const insertResult = await input.supabase
    .from("billing_customers")
    .insert({
      profile_id: input.profileId,
      provider: "stripe",
      provider_customer_id: customerId,
      default_payment_method_id: null
    })
    .select("id, profile_id, provider, provider_customer_id, default_payment_method_id")
    .single();

  if (insertResult.error) {
    throw new MonetizationServiceError("Unable to persist the Stripe billing customer bridge.", 500);
  }

  return insertResult.data as BillingCustomerRow;
}

async function resolvePlatformSubscriptionSubject(input: {
  supabase: SupabaseClient;
  row: BillingSubscriptionRow;
}) {
  if (input.row.subject_type === "barber") {
    const barberResult = await input.supabase
      .from("barbers")
      .select("id, reference_code, profile_id, profiles!inner(id, full_name, email)")
      .eq("id", input.row.barber_id!)
      .maybeSingle();

    if (barberResult.error || !barberResult.data) {
      throw new MonetizationServiceError("Unable to resolve the barber billing subject.", 500);
    }

    const barber = barberResult.data as unknown as {
      id: string;
      reference_code: string | null;
      profile_id: string;
      profiles: { id: string; full_name: string | null; email: string };
    };
    return {
      subjectType: "barber" as const,
      subjectReference: barber.reference_code ?? barber.id,
      profileId: barber.profile_id,
      fullName: barber.profiles.full_name ?? barber.profiles.email,
      email: barber.profiles.email
    };
  }

  const ownerResult = await input.supabase
    .from("staff_locations")
    .select("profile_id, profiles!inner(id, full_name, email, role)")
    .eq("location_id", input.row.shop_id!)
    .order("created_at", { ascending: true });

  if (ownerResult.error) {
    throw new MonetizationServiceError("Unable to resolve the shop billing subject.", 500);
  }

  const ownerRow = ((ownerResult.data ?? []) as unknown as Array<{
    profile_id: string;
    profiles: { id: string; full_name: string | null; email: string; role: string };
  }>).find((row) => row.profiles.role === "owner")
    ?? ((ownerResult.data ?? []) as unknown as Array<{
      profile_id: string;
      profiles: { id: string; full_name: string | null; email: string; role: string };
    }>)[0];

  if (!ownerRow) {
    throw new MonetizationServiceError("No shop billing profile is available for recurring billing execution.", 409);
  }

  return {
    subjectType: "shop" as const,
    subjectReference: input.row.shop_id!,
    profileId: ownerRow.profile_id,
    fullName: ownerRow.profiles.full_name ?? ownerRow.profiles.email,
    email: ownerRow.profiles.email
  };
}

async function syncPlatformSubscriptionRowFromStripe(
  supabase: SupabaseClient,
  input: {
    row: BillingSubscriptionRow;
    subscription: Stripe.Subscription;
    providerCustomerId?: string | null;
    billingStateOverride?: SubscriptionBillingState;
    lastInvoiceAt?: string | null;
    lastPaidAt?: string | null;
    retryCount?: number;
    lastFailedAt?: string | null;
    nextRetryAt?: string | null;
    lastRetryRequestedAt?: string | null;
  }
) {
  const firstItem = input.subscription.items.data[0];
  const price = firstItem?.price;
  if (!isPlatformSubscriptionSubjectType(input.row.subject_type)) {
    throw new MonetizationServiceError("Platform subscription sync only supports barber and shop subjects.", 500);
  }
  const configuredPlan = getPlatformSubscriptionPlan(input.row.subject_type);
  const updatedAt = new Date().toISOString();
  const effectiveBillingState = input.billingStateOverride ?? mapStripeBillingState(input.subscription);
  const isPastDue = effectiveBillingState === "past_due";

  const updateResult = await supabase
    .from("billing_subscriptions")
    .update({
      provider: "stripe_billing",
      provider_subscription_id: input.subscription.id,
      provider_customer_id: input.providerCustomerId ?? (
        typeof input.subscription.customer === "string"
          ? input.subscription.customer
          : input.subscription.customer?.id ?? input.row.provider_customer_id
      ),
      provider_price_id: price?.id ?? input.row.provider_price_id,
      plan_code: configuredPlan.planCode,
      plan_name: configuredPlan.planName,
      plan_interval: mapStripePlanInterval(price?.recurring?.interval) ?? configuredPlan.interval,
      unit_amount_cents: typeof price?.unit_amount === "number"
        ? price.unit_amount
        : Math.round(configuredPlan.unitAmount * 100),
      currency: price?.currency ?? configuredPlan.currency,
      subscription_status: mapStripeSubscriptionStatus(input.subscription.status),
      billing_state: effectiveBillingState,
      entitlement_status: mapStripeEntitlementStatus(input.subscription),
      current_period_start: input.subscription.current_period_start
        ? new Date(input.subscription.current_period_start * 1000).toISOString()
        : input.row.current_period_start,
      current_period_end: input.subscription.current_period_end
        ? new Date(input.subscription.current_period_end * 1000).toISOString()
        : input.row.current_period_end,
      trial_ends_at: input.subscription.trial_end
        ? new Date(input.subscription.trial_end * 1000).toISOString()
        : null,
      cancel_at: input.subscription.cancel_at
        ? new Date(input.subscription.cancel_at * 1000).toISOString()
        : null,
      last_invoiced_at: input.lastInvoiceAt ?? input.row.last_invoiced_at,
      last_paid_at: input.lastPaidAt ?? input.row.last_paid_at,
      retry_count: isPastDue ? (input.retryCount ?? input.row.retry_count ?? 0) : 0,
      last_failed_at: isPastDue ? (input.lastFailedAt ?? input.row.last_failed_at) : null,
      next_retry_at: isPastDue ? (input.nextRetryAt ?? input.row.next_retry_at) : null,
      last_retry_requested_at: input.lastRetryRequestedAt ?? (isPastDue ? input.row.last_retry_requested_at : null),
      updated_at: updatedAt,
      metadata: {
        ...(input.row.metadata ?? {}),
        billingCadence: configuredPlan.interval
      }
    })
    .eq("id", input.row.id)
    .select(BILLING_SUBSCRIPTION_SELECT)
    .single();

  if (updateResult.error) {
    throw new MonetizationServiceError("Unable to sync the platform subscription state.", 500);
  }

  return updateResult.data as unknown as BillingSubscriptionRow;
}

async function markPlatformSubscriptionPastDue(
  supabase: SupabaseClient,
  row: BillingSubscriptionRow,
  input: {
    reason: string;
    nextRetryAt?: string | null;
    incrementRetry?: boolean;
  }
) {
  const now = new Date().toISOString();
  const nextRetryAt = input.nextRetryAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const updateResult = await supabase
    .from("billing_subscriptions")
    .update({
      subscription_status: "past_due",
      billing_state: "past_due",
      entitlement_status: "limited",
      last_failed_at: now,
      next_retry_at: nextRetryAt,
      retry_count: input.incrementRetry ? (row.retry_count ?? 0) + 1 : (row.retry_count ?? 0),
      updated_at: now,
      metadata: {
        ...(row.metadata ?? {}),
        lastError: input.reason
      }
    })
    .eq("id", row.id)
    .select(BILLING_SUBSCRIPTION_SELECT)
    .single();

  if (updateResult.error) {
    throw new MonetizationServiceError("Unable to persist the platform subscription past-due state.", 500);
  }

  return updateResult.data as unknown as BillingSubscriptionRow;
}

async function syncClientSubscriptionRowFromStripe(
  supabase: SupabaseClient,
  input: {
    clientReference?: string | null;
    providerCustomerId?: string | null;
    subscription: Stripe.Subscription;
    billingStateOverride?: SubscriptionBillingState;
    lastInvoiceAt?: string | null;
    lastPaidAt?: string | null;
  }
) {
  const clientReference = input.clientReference?.trim() || input.subscription.metadata.clientReference || null;
  if (!clientReference) {
    throw new MonetizationServiceError("Stripe billing sync is missing the client reference.", 400);
  }

  const rawSubscriptions = await ensureBillingSubscriptions(supabase, {
    shopIds: [],
    barberIds: [],
    clientIds: [clientReference]
  });
  const existing = rawSubscriptions.find((row) => row.client_id === canonicalClientUuid(clientReference) && row.subject_type === "client");
  if (!existing) {
    throw new MonetizationServiceError("Unable to resolve the canonical client subscription row.", 500);
  }

  const firstItem = input.subscription.items.data[0];
  const price = firstItem?.price;
  const planCode = input.subscription.metadata.planCode
    || price?.metadata?.planCode
    || existing.plan_code;
  const configuredPlan = getClientMembershipPlan(planCode);
  const interval = price?.recurring?.interval === "year"
    ? "annual"
    : configuredPlan?.planInterval ?? "monthly";
  const unitAmountCents = typeof price?.unit_amount === "number"
    ? price.unit_amount
    : configuredPlan
      ? Math.round(configuredPlan.unitAmount * 100)
      : existing.unit_amount_cents;
  const currentPeriodStart = input.subscription.items.data[0]
    ? new Date(input.subscription.current_period_start * 1000).toISOString()
    : existing.current_period_start;
  const currentPeriodEnd = input.subscription.items.data[0]
    ? new Date(input.subscription.current_period_end * 1000).toISOString()
    : existing.current_period_end;
  const cancelAt = input.subscription.cancel_at
    ? new Date(input.subscription.cancel_at * 1000).toISOString()
    : null;
  const trialEndsAt = input.subscription.trial_end
    ? new Date(input.subscription.trial_end * 1000).toISOString()
    : null;
  const updatedAt = new Date().toISOString();

  const updateResult = await supabase
    .from("billing_subscriptions")
    .update({
      provider: "stripe_billing",
      provider_subscription_id: input.subscription.id,
      provider_customer_id: input.providerCustomerId ?? (
        typeof input.subscription.customer === "string"
          ? input.subscription.customer
          : input.subscription.customer?.id ?? existing.provider_customer_id
      ),
      provider_price_id: price?.id ?? existing.provider_price_id,
      plan_code: configuredPlan?.planCode ?? planCode,
      plan_name: configuredPlan?.planName ?? existing.plan_name,
      plan_interval: interval,
      unit_amount_cents: unitAmountCents,
      currency: price?.currency ?? existing.currency,
      subscription_status: mapStripeSubscriptionStatus(input.subscription.status),
      billing_state: input.billingStateOverride ?? mapStripeBillingState(input.subscription),
      entitlement_status: mapStripeEntitlementStatus(input.subscription),
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      trial_ends_at: trialEndsAt,
      cancel_at: cancelAt,
      last_invoiced_at: input.lastInvoiceAt ?? existing.last_invoiced_at,
      last_paid_at: input.lastPaidAt ?? existing.last_paid_at,
      updated_at: updatedAt
    })
    .eq("id", existing.id)
    .select(BILLING_SUBSCRIPTION_SELECT)
    .single();

  if (updateResult.error) {
    throw new MonetizationServiceError("Unable to sync the client subscription state.", 500);
  }

  const nextRow = updateResult.data as unknown as BillingSubscriptionRow;
  const lifecycleEvents = buildMembershipLifecycleEvents({
    previous: existing,
    next: nextRow
  });
  if (lifecycleEvents.length) {
    await recordRequiredPlatformEvents(supabase, lifecycleEvents);
  }

  return nextRow;
}

function buildClientMembershipExecutionFromSubscription(input: {
  clientId: string;
  clientName?: string;
  pointsBalance: number;
  referralCredits: number;
  unlockedRewardCount: number;
  nextDueAt?: string | null;
  subscription: SubscriptionSummaryView;
}) {
  const plans = listClientMembershipPlans();
  const activePlan = plans.find((plan) => plan.planCode === input.subscription.planCode) ?? plans.find((plan) => plan.highlighted) ?? plans[0] ?? null;
  const pricingAdjustment = activePlan
    ? buildMembershipPricingAdjustment(input.subscription, activePlan.unitAmount)
    : null;
  const value = buildClientMembershipValueFromSubscription({
    clientName: input.clientName,
    pointsBalance: input.pointsBalance,
    referralCredits: input.referralCredits,
    unlockedRewardCount: input.unlockedRewardCount,
    nextDueAt: input.nextDueAt,
    subscription: input.subscription
  });

  return {
    subscription: input.subscription,
    value,
    membershipStatus: input.subscription.subscriptionStatus,
    tier: input.subscription.planName || input.subscription.planCode || "none",
    active: input.subscription.subscriptionStatus === "active" || input.subscription.subscriptionStatus === "trialing",
    points: input.pointsBalance,
    plans,
    activePlan,
    pricingAdjustment,
    canSubscribe: value.canSubscribe ?? false,
    canCancel: value.canCancel ?? false
  } satisfies ClientMembershipExecutionView;
}

export async function readActiveClientMembershipSubscription(
  clientId: string,
  supabaseOverride?: SupabaseClient | null
) {
  const supabase = supabaseOverride ?? getSupabase();
  if (!supabase) {
    return null;
  }

  const rawSubscriptions = await readBillingSubscriptions(supabase, {
    shopIds: [],
    barberIds: [],
    clientIds: [clientId]
  });
  const subscription = selectClientSubscriptionView(
    rawSubscriptions
      .filter((row) => row.subject_type === "client" && row.client_id === canonicalClientUuid(clientId))
      .map((row) => toSubscriptionView(row, {
        shopLabels: new Map<string, string>(),
        barberLabels: new Map<string, string>(),
        clientLabels: buildClientLabelMaps(clientId)
      }))
  );

  return subscription;
}

export async function buildClientMembershipExecutionSummary(input: {
  clientId: string;
  clientName?: string;
  pointsBalance: number;
  referralCredits: number;
  unlockedRewardCount: number;
  nextDueAt?: string | null;
  supabaseOverride?: SupabaseClient | null;
}): Promise<ClientMembershipExecutionView> {
  const supabase = input.supabaseOverride ?? getSupabase();
  if (!supabase) {
    return buildFallbackClientMembershipExecution({
      clientName: input.clientName,
      pointsBalance: input.pointsBalance,
      referralCredits: input.referralCredits,
      unlockedRewardCount: input.unlockedRewardCount,
      nextDueAt: input.nextDueAt
    });
  }

  const rawSubscriptions = await readBillingSubscriptions(supabase, {
    shopIds: [],
    barberIds: [],
    clientIds: [input.clientId]
  });
  const subscription = selectClientSubscriptionView(
    rawSubscriptions
      .filter((row) => row.subject_type === "client" && row.client_id === canonicalClientUuid(input.clientId))
      .map((row) => toSubscriptionView(row, {
        shopLabels: new Map<string, string>(),
        barberLabels: new Map<string, string>(),
        clientLabels: buildClientLabelMaps(input.clientId, input.clientName)
      }))
  );

  if (!subscription) {
    return buildFallbackClientMembershipExecution({
      clientName: input.clientName,
      pointsBalance: input.pointsBalance,
      referralCredits: input.referralCredits,
      unlockedRewardCount: input.unlockedRewardCount,
      nextDueAt: input.nextDueAt
    });
  }

  return buildClientMembershipExecutionFromSubscription({
    clientId: input.clientId,
    clientName: input.clientName,
    pointsBalance: input.pointsBalance,
    referralCredits: input.referralCredits,
    unlockedRewardCount: input.unlockedRewardCount,
    nextDueAt: input.nextDueAt,
    subscription
  });
}

export async function createClientMembershipSubscriptionSession(input: {
  user: UserAccount;
  planCode: string;
}) {
  if (!isClientRole(input.user.role) || !input.user.clientId) {
    throw new MonetizationServiceError("Only clients can start a membership subscription.", 403);
  }
  const clientId = input.user.clientId;

  const supabase = getSupabase();
  if (!supabase) {
    throw new MonetizationServiceError("Membership execution requires Supabase and Stripe configuration.", 503);
  }

  const plan = getClientMembershipPlan(input.planCode);
  if (!plan) {
    throw new MonetizationServiceError("Selected membership plan is not available.", 404);
  }

  const identity = await readClientIdentity(supabase, clientId);
  const rawSubscriptions = await ensureBillingSubscriptions(supabase, {
    shopIds: [],
    barberIds: [],
    clientIds: [clientId],
    createdBy: identity.profile?.id ?? null
  });
  const existing = rawSubscriptions.find((row) => row.subject_type === "client" && row.client_id === canonicalClientUuid(clientId));
  if (!existing) {
    throw new MonetizationServiceError("Unable to resolve the client membership subscription row.", 500);
  }

  if (["active", "trialing", "past_due"].includes(existing.subscription_status) && existing.provider_subscription_id) {
    throw new MonetizationServiceError("A client membership subscription is already active or awaiting billing attention.", 409);
  }

  let providerCustomerId = existing.provider_customer_id;
  if (!providerCustomerId) {
    try {
      const customer = await createStripeBillingCustomer({
        email: identity.profile?.email ?? input.user.email,
        name: identity.profile?.full_name ?? input.user.name,
        metadata: {
          clientReference: clientId,
          role: "client"
        }
      });
      providerCustomerId = customer.id;
    } catch (error) {
      if (error instanceof StripeConnectError) {
        throw new MonetizationServiceError(error.message, error.status);
      }
      throw error;
    }
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await createStripeMembershipCheckoutSession({
      customerId: providerCustomerId,
      clientReference: clientId,
      clientEmail: identity.profile?.email ?? input.user.email,
      planCode: plan.planCode
    });
  } catch (error) {
    if (error instanceof StripeConnectError) {
      throw new MonetizationServiceError(error.message, error.status);
    }
    throw error;
  }

  const updateResult = await supabase
    .from("billing_subscriptions")
    .update({
      provider: "stripe_billing",
      provider_customer_id: providerCustomerId,
      provider_price_id: `inline:${plan.planCode}`,
      plan_code: plan.planCode,
      plan_name: plan.planName,
      plan_interval: plan.planInterval,
      unit_amount_cents: Math.round(plan.unitAmount * 100),
      billing_state: "pending",
      updated_at: new Date().toISOString()
    })
    .eq("id", existing.id);

  if (updateResult.error) {
    throw new MonetizationServiceError("Unable to persist the client membership checkout state.", 500);
  }

  return {
    checkoutUrl: session.url,
    sessionId: session.id
  };
}

export async function cancelClientMembershipSubscription(input: {
  user: UserAccount;
}) {
  if (!isClientRole(input.user.role) || !input.user.clientId) {
    throw new MonetizationServiceError("Only clients can cancel a membership subscription.", 403);
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new MonetizationServiceError("Membership execution requires Supabase and Stripe configuration.", 503);
  }

  const subscription = await readActiveClientMembershipSubscription(input.user.clientId, supabase);
  if (!subscription?.providerSubscriptionId) {
    throw new MonetizationServiceError("There is no active Stripe membership subscription to cancel.", 409);
  }

  let stripeSubscription: Stripe.Subscription;
  try {
    stripeSubscription = await cancelStripeMembershipSubscription(subscription.providerSubscriptionId);
  } catch (error) {
    if (error instanceof StripeConnectError) {
      throw new MonetizationServiceError(error.message, error.status);
    }
    throw error;
  }

  const row = await syncClientSubscriptionRowFromStripe(supabase, {
    clientReference: input.user.clientId,
    providerCustomerId: subscription.providerCustomerId ?? null,
    subscription: stripeSubscription
  });

  return toSubscriptionView(row, {
    shopLabels: new Map<string, string>(),
    barberLabels: new Map<string, string>(),
    clientLabels: buildClientLabelMaps(input.user.clientId, input.user.name)
  });
}

async function readLatestClientSubscriptionView(clientId: string, clientName?: string) {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }

  const rawSubscriptions = await readBillingSubscriptions(supabase, {
    shopIds: [],
    barberIds: [],
    clientIds: [clientId]
  });

  return rawSubscriptions
    .filter((row) => row.subject_type === "client" && row.client_id === canonicalClientUuid(clientId))
    .map((row) => toSubscriptionView(row, {
      shopLabels: new Map<string, string>(),
      barberLabels: new Map<string, string>(),
      clientLabels: buildClientLabelMaps(clientId, clientName)
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
}

async function readClientBillingInvoiceRows(supabase: SupabaseClient, clientId: string) {
  const result = await supabase
    .from("billing_invoice_history")
    .select(BILLING_INVOICE_SELECT)
    .eq("client_id", canonicalClientUuid(clientId))
    .order("invoice_created_at", { ascending: false });

  if (result.error) {
    throw new MonetizationServiceError("Unable to load billing invoices.", 500);
  }

  return ((result.data ?? []) as unknown as BillingInvoiceHistoryRow[]);
}

function buildBillingHistoryItems(
  subscription: SubscriptionSummaryView | null,
  invoices: BillingInvoiceView[]
): BillingHistoryEventView[] {
  const items: BillingHistoryEventView[] = invoices.map((invoice) => ({
    id: `billing-history:${invoice.id}`,
    type:
      invoice.status === "paid"
        ? "invoice_paid"
        : invoice.status === "failed" || invoice.status === "past_due"
          ? "invoice_failed"
          : "invoice_opened",
    status: invoice.status,
    label:
      invoice.status === "paid"
        ? "Invoice paid"
        : invoice.status === "failed" || invoice.status === "past_due"
          ? "Invoice needs attention"
          : "Invoice opened",
    occurredAt: invoice.paidAt ?? invoice.invoiceCreatedAt,
    amount: invoice.amountDue,
    invoiceId: invoice.id,
    metadata: {
      hostedInvoiceUrl: invoice.hostedInvoiceUrl ?? null
    }
  }));

  if (subscription) {
    items.unshift({
      id: `billing-history:subscription:${subscription.id}`,
      type: subscription.subscriptionStatus === "cancelled" ? "subscription_cancelled" : "subscription_updated",
      status: subscription.subscriptionStatus,
      label: subscription.subscriptionStatus === "cancelled" ? "Subscription cancelled" : "Subscription updated",
      occurredAt: subscription.updatedAt,
      amount: subscription.unitAmount,
      metadata: {
        billingState: subscription.billingState,
        entitlementStatus: subscription.entitlementStatus,
        planCode: subscription.planCode
      }
    });
  }

  return items.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

export async function readClientBillingHistory(input: {
  user: UserAccount;
}): Promise<BillingHistoryView> {
  if (input.user.role !== "client" || !input.user.clientId) {
    throw new MonetizationServiceError("Only clients can view billing history.", 403);
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new MonetizationServiceError("Billing history requires Supabase and Stripe configuration.", 503);
  }

  const [subscription, invoiceRows] = await Promise.all([
    readLatestClientSubscriptionView(input.user.clientId, input.user.name),
    readClientBillingInvoiceRows(supabase, input.user.clientId)
  ]);
  const invoices = invoiceRows.map(mapBillingInvoiceView);
  const recoveryInvoice = invoices.find((invoice) => invoice.status === "failed" || invoice.status === "past_due") ?? null;

  return {
    subscription,
    invoices,
    history: buildBillingHistoryItems(subscription, invoices),
    recoveryInvoice
  };
}

export async function readClientBillingInvoices(input: {
  user: UserAccount;
}) {
  const history = await readClientBillingHistory(input);
  return history.invoices;
}

export async function requestClientBillingRetry(input: {
  user: UserAccount;
}) {
  const history = await readClientBillingHistory(input);
  const recoveryInvoice = history.recoveryInvoice;
  if (!recoveryInvoice?.hostedInvoiceUrl) {
    throw new MonetizationServiceError("There is no recoverable invoice waiting for payment.", 409);
  }

  const supabase = getSupabase();
  if (!supabase) {
    throw new MonetizationServiceError("Billing retry requires Supabase and Stripe configuration.", 503);
  }

  const updateResult = await supabase
    .from("billing_invoice_history")
    .update({
      metadata: {
        retry_requested_at: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", recoveryInvoice.id);

  if (updateResult.error) {
    throw new MonetizationServiceError("Unable to persist the billing retry request.", 500);
  }

  return {
    recoveryUrl: recoveryInvoice.hostedInvoiceUrl,
    invoice: recoveryInvoice
  };
}

async function readPlatformBillingSubscriptions(supabase: SupabaseClient) {
  const [barbersResult, locationsResult] = await Promise.all([
    supabase.from("barbers").select("id"),
    supabase.from("locations").select("id")
  ]);

  if (barbersResult.error || locationsResult.error) {
    throw new MonetizationServiceError("Unable to load platform subscription scope.", 500);
  }

  const barberIds = ((barbersResult.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  const shopIds = ((locationsResult.data ?? []) as Array<{ id: string }>).map((row) => row.id);
  return ensureBillingSubscriptions(supabase, {
    shopIds,
    barberIds
  });
}

export async function processPlatformSubscriptionBilling(referenceAt = new Date().toISOString()) {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      processed: 0,
      activated: 0,
      synced: 0,
      pastDue: 0,
      retried: 0
    };
  }

  const rows = (await readPlatformBillingSubscriptions(supabase)).filter((row) => row.subject_type === "barber" || row.subject_type === "shop");
  let activated = 0;
  let synced = 0;
  let pastDue = 0;
  let retried = 0;

  for (const row of rows) {
    try {
      const subject = await resolvePlatformSubscriptionSubject({
        supabase,
        row
      });
      const billingCustomer = await upsertStripeBillingCustomerForProfile({
        supabase,
        profileId: subject.profileId,
        email: subject.email,
        fullName: subject.fullName,
        providerCustomerId: row.provider_customer_id,
        metadata: {
          subjectType: row.subject_type,
          subjectReference: subject.subjectReference
        }
      });

      if (!billingCustomer.default_payment_method_id?.trim()) {
        await markPlatformSubscriptionPastDue(supabase, row, {
          reason: "A default Stripe payment method is required for recurring platform billing."
        });
        pastDue += 1;
        continue;
      }

      if (!row.provider_subscription_id) {
        if (!isPlatformSubscriptionSubjectType(row.subject_type)) {
          continue;
        }
        const plan = getPlatformSubscriptionPlan(row.subject_type);
        try {
          const subscription = await createStripeRecurringSubscription({
            customerId: billingCustomer.provider_customer_id,
            defaultPaymentMethodId: billingCustomer.default_payment_method_id,
            planCode: plan.planCode,
            planName: plan.planName,
            unitAmount: plan.unitAmount,
            currency: plan.currency,
            interval: plan.interval === "weekly" ? "week" : "month",
            metadata: {
              subjectType: row.subject_type,
              subjectReference: subject.subjectReference,
              planCode: plan.planCode
            },
            idempotencyKey: `platform-subscription:${row.subject_type}:${subject.subjectReference}:${plan.planCode}`
          });
          await syncPlatformSubscriptionRowFromStripe(supabase, {
            row,
            providerCustomerId: billingCustomer.provider_customer_id,
            subscription
          });
          activated += 1;
          synced += 1;
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Stripe recurring billing could not be created.";
          await markPlatformSubscriptionPastDue(supabase, row, {
            reason,
            incrementRetry: true
          });
          pastDue += 1;
        }
        continue;
      }

      try {
        let liveSubscription = await retrieveStripeSubscription(row.provider_subscription_id);
        if (
          (row.billing_state === "past_due" || row.subscription_status === "past_due")
          && (!row.next_retry_at || row.next_retry_at <= referenceAt)
        ) {
          const retriedInvoice = await retryStripeSubscriptionInvoice(row.provider_subscription_id).catch(() => null);
          retried += 1;
          if (retriedInvoice) {
            liveSubscription = await retrieveStripeSubscription(row.provider_subscription_id);
          }
          await syncPlatformSubscriptionRowFromStripe(supabase, {
            row,
            providerCustomerId: billingCustomer.provider_customer_id,
            subscription: liveSubscription,
            lastRetryRequestedAt: new Date().toISOString(),
            nextRetryAt: retriedInvoice ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            retryCount: retriedInvoice ? row.retry_count : row.retry_count + 1,
            lastFailedAt: retriedInvoice ? row.last_failed_at : new Date().toISOString()
          });
        } else {
          await syncPlatformSubscriptionRowFromStripe(supabase, {
            row,
            providerCustomerId: billingCustomer.provider_customer_id,
            subscription: liveSubscription
          });
        }
        synced += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Stripe recurring billing sync failed.";
        await markPlatformSubscriptionPastDue(supabase, row, {
          reason,
          incrementRetry: true
        });
        pastDue += 1;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Platform subscription subject resolution failed.";
      await markPlatformSubscriptionPastDue(supabase, row, {
        reason,
        incrementRetry: false
      });
      pastDue += 1;
    }
  }

  return {
    processed: rows.length,
    activated,
    synced,
    pastDue,
    retried
  };
}

async function resolvePlatformSubscriptionRowForStripe(
  supabase: SupabaseClient,
  input: {
    providerSubscriptionId?: string | null;
    subjectType?: string | null;
    subjectReference?: string | null;
  }
) {
  if (input.providerSubscriptionId) {
    const byProviderId = await supabase
      .from("billing_subscriptions")
      .select(BILLING_SUBSCRIPTION_SELECT)
      .eq("provider_subscription_id", input.providerSubscriptionId)
      .maybeSingle();

    if (byProviderId.error) {
      throw new MonetizationServiceError("Unable to resolve the Stripe billing subscription row.", 500);
    }

    if (byProviderId.data) {
      return byProviderId.data as unknown as BillingSubscriptionRow;
    }
  }

  if (!(input.subjectType === "barber" || input.subjectType === "shop") || !input.subjectReference?.trim()) {
    return null;
  }

  const rawRows = await ensureBillingSubscriptions(supabase, {
    shopIds: input.subjectType === "shop" ? [input.subjectReference] : [],
    barberIds: input.subjectType === "barber" ? [input.subjectReference] : []
  });

  return rawRows.find((row) =>
    row.subject_type === input.subjectType
    && (
      (input.subjectType === "barber" && row.barber_id === canonicalBarberUuid(input.subjectReference!))
      || (input.subjectType === "shop" && row.shop_id === canonicalLocationUuid(input.subjectReference!))
    )
  ) ?? null;
}

async function syncBillingInvoiceHistoryRow(input: {
  supabase: SupabaseClient;
  subscriptionRow: BillingSubscriptionRow | null;
  clientReference?: string | null;
  invoice: Stripe.Invoice;
  status: BillingInvoiceStatus;
}) {
  const clientId = input.subscriptionRow?.client_id
    ?? (input.clientReference ? canonicalClientUuid(input.clientReference) : null);
  const invoiceId = typeof input.invoice.id === "string" ? input.invoice.id : `invoice-${Date.now()}`;

  const result = await input.supabase
    .from("billing_invoice_history")
    .upsert({
      id: `billing-invoice-${invoiceId}`,
      subscription_id: input.subscriptionRow?.id ?? input.invoice.subscription?.toString() ?? `subscription:${invoiceId}`,
      client_id: clientId,
      provider_invoice_id: invoiceId,
      provider_subscription_id: typeof input.invoice.subscription === "string"
        ? input.invoice.subscription
        : input.invoice.subscription?.id ?? null,
      status: input.status,
      amount_due_cents: input.invoice.amount_due ?? 0,
      amount_paid_cents: input.invoice.amount_paid ?? 0,
      currency: input.invoice.currency ?? "usd",
      hosted_invoice_url: input.invoice.hosted_invoice_url ?? null,
      invoice_pdf_url: input.invoice.invoice_pdf ?? null,
      invoice_created_at: input.invoice.created
        ? new Date(input.invoice.created * 1000).toISOString()
        : new Date().toISOString(),
      invoice_due_at: input.invoice.due_date
        ? new Date(input.invoice.due_date * 1000).toISOString()
        : null,
      paid_at: input.invoice.status_transitions?.paid_at
        ? new Date(input.invoice.status_transitions.paid_at * 1000).toISOString()
        : null,
      attempt_count: input.invoice.attempt_count ?? 0,
      last_error: input.invoice.last_finalization_error?.message ?? null,
      metadata: {
        invoiceStatus: input.invoice.status ?? null
      },
      updated_at: new Date().toISOString()
    }, { onConflict: "provider_invoice_id" });

  if (result.error) {
    throw new MonetizationServiceError("Unable to persist billing invoice history.", 500);
  }
}

export async function processStripeBillingWebhookEvent(event: Stripe.Event) {
  const supabase = getSupabase();
  if (!supabase) {
    return { handled: false };
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== "subscription" || !session.subscription) {
      return { handled: false };
    }

    const subscription = await retrieveStripeSubscription(typeof session.subscription === "string" ? session.subscription : session.subscription.id);
    const entitlementSync = await syncServerEntitlementFromStripeSubscription({
      supabase,
      subscription,
      session,
      eventId: event.id
    });
    if (entitlementSync.handled) {
      return { handled: true };
    }

    await syncClientSubscriptionRowFromStripe(supabase, {
      clientReference: session.client_reference_id ?? session.metadata?.clientReference ?? null,
      providerCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
      subscription
    });
    return { handled: true };
  }

  if (
    event.type === "customer.subscription.created"
    || event.type === "customer.subscription.updated"
    || event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const entitlementSync = await syncServerEntitlementFromStripeSubscription({
      supabase,
      subscription,
      eventId: event.id
    });
    if (entitlementSync.handled) {
      return { handled: true };
    }

    const platformRow = await resolvePlatformSubscriptionRowForStripe(supabase, {
      providerSubscriptionId: subscription.id,
      subjectType: subscription.metadata.subjectType ?? null,
      subjectReference: subscription.metadata.subjectReference ?? null
    });
    if (platformRow && (platformRow.subject_type === "barber" || platformRow.subject_type === "shop")) {
      await syncPlatformSubscriptionRowFromStripe(supabase, {
        row: platformRow,
        providerCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
        subscription
      });
      return { handled: true };
    }

    await syncClientSubscriptionRowFromStripe(supabase, {
      clientReference: subscription.metadata.clientReference ?? null,
      providerCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
      subscription
    });
    return { handled: true };
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id;
    if (!subscriptionId) {
      return { handled: false };
    }

    const subscription = await retrieveStripeSubscription(subscriptionId);
    const entitlementSync = await syncServerEntitlementFromStripeSubscription({
      supabase,
      subscription,
      eventId: event.id
    });
    if (entitlementSync.handled) {
      await syncPr34SubscriptionInvoiceBalance({
        supabase,
        invoice,
        subscription,
        entitlement: entitlementSync,
        eventType: event.type
      });
      return { handled: true };
    }

    const platformRow = await resolvePlatformSubscriptionRowForStripe(supabase, {
      providerSubscriptionId: subscriptionId,
      subjectType: subscription.metadata.subjectType ?? null,
      subjectReference: subscription.metadata.subjectReference ?? null
    });
    const lastInvoiceAt = invoice.created ? new Date(invoice.created * 1000).toISOString() : null;
    const lastPaidAt = event.type === "invoice.paid" && invoice.status_transitions.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
      : null;
    const row = platformRow && (platformRow.subject_type === "barber" || platformRow.subject_type === "shop")
      ? await syncPlatformSubscriptionRowFromStripe(supabase, {
          row: platformRow,
          providerCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
          subscription,
          billingStateOverride: event.type === "invoice.payment_failed" ? "past_due" : "current",
          lastInvoiceAt,
          lastPaidAt,
          lastFailedAt: event.type === "invoice.payment_failed" ? new Date().toISOString() : null,
          nextRetryAt: event.type === "invoice.payment_failed" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null
        })
      : await syncClientSubscriptionRowFromStripe(supabase, {
          clientReference: subscription.metadata.clientReference ?? null,
          providerCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null,
          subscription,
          billingStateOverride: event.type === "invoice.payment_failed" ? "past_due" : "current",
          lastInvoiceAt,
          lastPaidAt
        });
    await syncBillingInvoiceHistoryRow({
      supabase,
      subscriptionRow: row,
      clientReference: subscription.metadata.clientReference ?? null,
      invoice,
      status: event.type === "invoice.payment_failed" ? "failed" : "paid"
    });
    return { handled: true };
  }

  return { handled: false };
}

export async function buildOwnerMonetizationSummary(input: {
  state: EngagementState;
  snapshot: LiveOperationsSnapshot;
  locationIds: string[];
}): Promise<OwnerMonetizationSummary> {
  const supabase = getSupabase();
  const scopedLocationIds = getScopeLocationIds(input.snapshot, input.locationIds);
  const locationRows = supabase ? await readLocationsByReference(supabase, scopedLocationIds) : new Map<string, LocationRow>();
  const scopedAppointments = buildRevenueAppointments(input.snapshot).filter((appointment) => scopedLocationIds.includes(appointment.locationId));
  const completedAppointments = getCompletedAppointmentsInScope(scopedAppointments, scopedLocationIds);
  const grossRevenue = roundCurrency(completedAppointments.reduce((sum, appointment) => sum + appointment.totalAmount, 0));
  const repeatClientRevenue = computeRepeatClientRevenue(completedAppointments);
  const revenueAtRisk = computeRevenueAtRisk(input.state, input.snapshot, scopedLocationIds);
  const locationRevenueMap = new Map<string, { grossRevenue: number; completedServices: number; appointmentCount: number; repeatClientRevenue: number }>();

  for (const locationId of scopedLocationIds) {
    const locationCompleted = completedAppointments.filter((appointment) => appointment.locationId === locationId);
    locationRevenueMap.set(locationId, {
      grossRevenue: roundCurrency(locationCompleted.reduce((sum, appointment) => sum + appointment.totalAmount, 0)),
      completedServices: locationCompleted.length,
      appointmentCount: scopedAppointments.filter((appointment) => appointment.locationId === locationId).length,
      repeatClientRevenue: computeRepeatClientRevenue(locationCompleted)
    });
  }

  let platformFeeRevenue = 0;
  let processorFeeVisibility = 0;
  let subscriptionRows: SubscriptionSummaryView[] = [];
  let topOffers: PromotionPerformanceView[] = [];
  let totalPromotionRedemptions = 0;
  let totalPromotionDiscountImpact = 0;
  let totalPromotionAttributedRevenue = 0;
  const appointmentPlatformFeeMap = new Map(scopedAppointments.map((appointment) => [appointment.id, 0]));

  if (supabase) {
    const scopedBarbers = await readBarbersForLocations(supabase, scopedLocationIds);
    const barberIds = Array.from(new Set(scopedBarbers.map((barber) => barber.reference_code ?? barber.id)));
    const rawSubscriptions = await ensureBillingSubscriptions(supabase, {
      shopIds: scopedLocationIds,
      barberIds
    });
    const shopLabels = buildShopLabelMaps(scopedLocationIds, locationRows);
    const barberLabels = buildBarberLabelMaps(barberIds, scopedBarbers);
    subscriptionRows = rawSubscriptions
      .map((row) => toSubscriptionView(row, { shopLabels, barberLabels }))
      .sort((left, right) =>
        left.subjectType.localeCompare(right.subjectType)
        || right.unitAmount - left.unitAmount
        || left.displayName.localeCompare(right.displayName)
      );

    const routingRows = await readPaymentRoutingRows(supabase, scopedAppointments.map((appointment) => appointment.id));
    for (const row of routingRows) {
      const appointmentId = scopedAppointments.find((appointment) => canonicalAppointmentUuid(appointment.id) === row.appointment_id)?.id;
      if (appointmentId) {
        appointmentPlatformFeeMap.set(
          appointmentId,
          roundCurrency((appointmentPlatformFeeMap.get(appointmentId) ?? 0) + numeric(row.platform_fee_amount))
        );
      }
    }
    platformFeeRevenue = roundCurrency(routingRows.reduce((sum, row) => sum + numeric(row.platform_fee_amount), 0));
    processorFeeVisibility = roundCurrency(routingRows.reduce((sum, row) => sum + numeric(row.provider_fee_amount), 0));

    const promotionData = await readPromotionPerformanceData(supabase, scopedLocationIds);
    const redemptionsByPromotion = new Map<string, PromotionRedemptionRow[]>();
    for (const redemption of promotionData.redemptions) {
      const rows = redemptionsByPromotion.get(redemption.promotion_id) ?? [];
      rows.push(redemption);
      redemptionsByPromotion.set(redemption.promotion_id, rows);
    }
    const appointmentRevenueById = buildAppointmentRevenueMap(scopedAppointments);
    const promotionViews = buildPromotionPerformanceViews(
      promotionData.promotions.map((promotion) => ({
        promotionId: promotion.id,
        promotionName: promotion.name,
        promotionCode: promotion.code ?? undefined,
        shopId: locationRows.get(promotion.shop_id)?.reference_code ?? scopedLocationIds.find((locationId) => canonicalLocationUuid(locationId) === promotion.shop_id) ?? promotion.shop_id,
        shopLabel: shopLabels.get(promotion.shop_id) ?? fallbackShopLabel(promotion.shop_id),
        availabilityState: promotionAvailabilityState(promotion),
        redemptions: (redemptionsByPromotion.get(promotion.id) ?? []).map((redemption) => ({
          appointmentId: redemption.appointment_id ?? undefined,
          discountAmount: numeric(redemption.discount_amount)
        }))
      })),
      appointmentRevenueById
    );
    topOffers = promotionViews.slice(0, 5);
    totalPromotionRedemptions = promotionViews.reduce((sum, offer) => sum + offer.redemptions, 0);
    totalPromotionDiscountImpact = roundCurrency(promotionViews.reduce((sum, offer) => sum + offer.discountImpact, 0));
    totalPromotionAttributedRevenue = roundCurrency(promotionViews.reduce((sum, offer) => sum + offer.attributedRevenue, 0));
  }

  const subscriptionSummary = buildSubscriptionPortfolioSummary(subscriptionRows);
  const growthMetrics = computeGrowthMetrics(input.state, input.snapshot, completedAppointments);
  const retainedRevenueShare = grossRevenue > 0
    ? roundCurrency((repeatClientRevenue / grossRevenue) * 100)
    : 0;
  const barberContribution = buildBarberContributionViews(scopedAppointments, appointmentPlatformFeeMap);
  const summary = {
    revenue: {
      grossRevenue,
      platformFeeRevenue,
      processorFeeVisibility,
      subscriptionRevenue: subscriptionSummary.subscriptionRevenue,
      repeatClientRevenue,
      retainedRevenueShare,
      revenueAtRisk
    },
    subscriptions: {
      ...subscriptionSummary,
      rows: subscriptionRows
    },
    promotions: {
      totalRedemptions: totalPromotionRedemptions,
      totalDiscountImpact: totalPromotionDiscountImpact,
      attributedRevenue: totalPromotionAttributedRevenue,
      topOffers
    },
    growth: {
      ...growthMetrics,
      rebookingInfluencedRevenue: repeatClientRevenue
    },
    barberContribution
  } satisfies OwnerMonetizationSummary;

  if (supabase) {
    await syncOwnerSnapshots(supabase, {
      locationIds: scopedLocationIds,
      summary,
      locationRevenueMap
    });
  }

  return summary;
}

export async function buildClientMembershipValueSummary(input: {
  clientId?: string;
  clientName?: string;
  favoriteBarberId?: string;
  favoriteBarberName?: string;
  favoriteShopId?: string;
  favoriteShopLabel?: string;
  pointsBalance: number;
  referralCredits: number;
  unlockedRewardCount: number;
  nextDueAt?: string | null;
}): Promise<ClientMembershipValueView | null> {
  if (!input.clientId) {
    return buildFallbackClientMembershipExecution({
      clientName: input.clientName,
      pointsBalance: input.pointsBalance,
      referralCredits: input.referralCredits,
      unlockedRewardCount: input.unlockedRewardCount,
      nextDueAt: input.nextDueAt
    }).value;
  }

  const execution = await buildClientMembershipExecutionSummary({
    clientId: input.clientId,
    clientName: input.clientName,
    pointsBalance: input.pointsBalance,
    referralCredits: input.referralCredits,
    unlockedRewardCount: input.unlockedRewardCount,
    nextDueAt: input.nextDueAt
  });

  return execution.value;
}

export async function buildBarberRevenueIntelligenceSummary(input: {
  user: UserAccount;
  businessDate: string;
  appointments: Array<{
    id: string;
    clientId: string;
    start: string;
    totalAmount: number;
    balanceDue: number;
    status: string;
    financial: { tipAmount: number };
    display: { clientName: string; serviceName: string };
  }>;
}): Promise<BarberRevenueIntelligenceView> {
  const supabase = getSupabase();
  let subscription: SubscriptionSummaryView | null = null;

  if (supabase && input.user.barberId) {
    const rawSubscriptions = await ensureBillingSubscriptions(supabase, {
      shopIds: [],
      barberIds: [input.user.barberId]
    });
    const subscriptionRow = rawSubscriptions.find((row) => row.barber_id === canonicalBarberUuid(input.user.barberId!)) ?? rawSubscriptions[0];
    if (subscriptionRow) {
      const labelMap = new Map<string, string>([
        [input.user.barberId, input.user.name],
        [canonicalBarberUuid(input.user.barberId), input.user.name]
      ]);
      subscription = toSubscriptionView(subscriptionRow, {
        shopLabels: new Map<string, string>(),
        barberLabels: labelMap
      });
    }
  }

  const mappedAppointments = input.appointments.map((appointment) => ({
    id: appointment.id,
    clientId: appointment.clientId,
    clientName: appointment.display.clientName,
    barberId: input.user.barberId ?? "barber",
    barberName: input.user.name,
    serviceName: appointment.display.serviceName,
    locationId: "",
    start: appointment.start,
    totalAmount: appointment.totalAmount,
    balanceDue: appointment.balanceDue,
    tipAmount: appointment.financial.tipAmount,
    status: appointment.status as AppointmentStatus
  }));

  const summary = buildBarberRevenueIntelligence(mappedAppointments, input.businessDate, subscription);

  if (supabase && input.user.barberId) {
    await syncBarberRevenueSnapshot(supabase, input.user.barberId, summary, mappedAppointments);
  }

  return summary;
}
