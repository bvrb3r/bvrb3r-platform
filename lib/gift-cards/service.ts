import "server-only";

import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type Stripe from "stripe";
import type { BookingEngineActor } from "@/lib/booking/engine";
import { executeNotificationAttempt } from "@/lib/engagement/live-delivery";
import { toNotificationDeliveryRecord } from "@/lib/engagement/delivery";
import {
  giftCardPurchaseSchema,
  type GiftCardPurchaseInput
} from "@/lib/gift-cards/domain";
import { runtimeConfig } from "@/lib/config/runtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeConnectClient, StripeConnectError } from "@/lib/stripe/connect";
import { getStripeBillingPublishableKey } from "@/lib/stripe/pr34-billing";
import type { NotificationDeliveryAttemptRecord } from "@/types/mobile";
import type { EngagementNotificationRecord } from "@/types/engagement";

type SupabaseAdmin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export class GiftCardServiceError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "gift_card_request_failed"
  ) {
    super(message);
    this.name = "GiftCardServiceError";
  }
}

function requireSupabase(): SupabaseAdmin {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new GiftCardServiceError(
      "Gift cards are temporarily unavailable because live balance truth cannot be reached.",
      503,
      "gift_card_unavailable"
    );
  }
  return supabase;
}

function token() {
  return randomBytes(32).toString("base64url");
}

function requireGiftCardClaimSecret(secret = process.env.GIFT_CARD_CLAIM_SECRET ?? "") {
  const normalized = secret.trim();
  if (normalized.length < 32) {
    throw new GiftCardServiceError(
      "Gift-card claim delivery is not configured.",
      503,
      "gift_card_claim_secret_missing"
    );
  }
  return normalized;
}

/**
 * A claim credential must be recoverable by the verified Stripe webhook even
 * when the buyer closes the browser after payment. It is therefore derived
 * from the server-only secret and the preallocated purchase UUID; the database
 * still stores only its SHA-256 digest.
 */
export function deriveGiftCardClaimToken(
  purchaseId: string,
  secret = process.env.GIFT_CARD_CLAIM_SECRET ?? ""
) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(purchaseId)) {
    throw new GiftCardServiceError("Gift-card purchase identity is invalid.", 400, "gift_purchase_id_invalid");
  }
  return `gct_${createHmac("sha256", requireGiftCardClaimSecret(secret))
    .update(`bvrb3r:gift-claim:v1:${purchaseId}`, "utf8")
    .digest("base64url")}`;
}

export function hashGiftCardToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function buyerActorKey(actor: BookingEngineActor) {
  if (actor.profileId) {
    return `profile:${actor.profileId}`;
  }
  if (!actor.sessionKey) {
    throw new GiftCardServiceError("A protected purchase session is required.", 401, "purchase_session_required");
  }
  return `session:${hashGiftCardToken(actor.sessionKey)}`;
}

function maskDestination(value: string, channel: "email" | "sms") {
  if (channel === "email") {
    const [local, domain] = value.split("@");
    return `${local.slice(0, 2)}***@${domain ?? "***"}`;
  }
  const digits = value.replace(/\D/g, "");
  return `***-***-${digits.slice(-4)}`;
}

async function resolveScope(
  supabase: SupabaseAdmin,
  input: Pick<GiftCardPurchaseInput, "scopeType" | "scopeId">
) {
  if (input.scopeType === "platform") {
    return { scopeLabel: "Any chair on BVRB3R", barberId: null, shopId: null };
  }

  if (input.scopeType === "barber") {
    const barber = await supabase.from("barbers").select("id, profile_id")
      .eq("id", input.scopeId)
      .eq("app_approval_status", "approved")
      .maybeSingle();
    if (barber.error || !barber.data) {
      throw new GiftCardServiceError("That barber is not available for a scoped gift card.", 404, "barber_not_found");
    }
    const profile = await supabase.from("profiles").select("full_name").eq("id", barber.data.profile_id).maybeSingle();
    return {
      scopeLabel: profile.data?.full_name ? `${profile.data.full_name} only` : "One verified barber",
      barberId: barber.data.id as string,
      shopId: null
    };
  }

  const shop = await supabase.from("locations").select("id, reference_code, name").eq("id", input.scopeId).maybeSingle();
  if (shop.error || !shop.data?.reference_code) {
    throw new GiftCardServiceError("That shop is not available for a scoped gift card.", 404, "shop_not_found");
  }
  const approved = await supabase.from("shops").select("id")
    .eq("id", shop.data.reference_code)
    .eq("app_approval_status", "approved")
    .maybeSingle();
  if (approved.error || !approved.data) {
    throw new GiftCardServiceError("That shop is not available for a scoped gift card.", 404, "shop_not_found");
  }
  return { scopeLabel: shop.data.name as string, barberId: null, shopId: shop.data.id as string };
}

export type GiftCardPaymentSession = {
  purchaseId: string;
  purchaseToken: string;
  claimToken: string;
  clientSecret: string;
  publishableKey: string;
  amountCents: number;
  currency: "usd";
  scopeLabel: string;
};

export async function readGiftCardScopeCatalog() {
  const supabase = requireSupabase();
  const [barbersResult, approvedShopsResult] = await Promise.all([
    supabase.from("barbers").select("id, profile_id").eq("app_approval_status", "approved").limit(300),
    supabase.from("shops").select("id").eq("app_approval_status", "approved").limit(300)
  ]);
  if (barbersResult.error || approvedShopsResult.error) {
    throw new GiftCardServiceError("Gift card destinations could not be verified.", 503);
  }
  const approvedShopReferences = (approvedShopsResult.data ?? []).map((shop) => shop.id as string);
  const shopsResult = approvedShopReferences.length
    ? await supabase.from("locations").select("id, name, city, state").in("reference_code", approvedShopReferences).limit(300)
    : { data: [], error: null };
  if (shopsResult.error) {
    throw new GiftCardServiceError("Gift card shop destinations could not be verified.", 503);
  }
  const barbers = (barbersResult.data ?? []) as Array<{ id: string; profile_id: string }>;
  const profilesResult = barbers.length
    ? await supabase.from("profiles").select("id, full_name").in("id", barbers.map((barber) => barber.profile_id))
    : { data: [], error: null };
  if (profilesResult.error) {
    throw new GiftCardServiceError("Gift card barber destinations could not be verified.", 503);
  }
  const names = new Map((profilesResult.data ?? []).map((profile) => [profile.id as string, profile.full_name as string]));
  return {
    barbers: barbers.map((barber) => ({ id: barber.id, label: names.get(barber.profile_id) ?? "Verified barber" })),
    shops: (shopsResult.data ?? []).map((shop) => ({
      id: shop.id as string,
      label: `${shop.name as string}${shop.city ? ` · ${shop.city as string}, ${shop.state as string}` : ""}`
    }))
  };
}

export async function createGiftCardPaymentSession(input: {
  actor: BookingEngineActor;
  payload: GiftCardPurchaseInput;
}): Promise<GiftCardPaymentSession> {
  const payload = giftCardPurchaseSchema.parse(input.payload);
  const supabase = requireSupabase();
  const actorKey = buyerActorKey(input.actor);
  const existing = await supabase
    .from("gift_card_purchase_attempts")
    .select("id, status")
    .eq("buyer_actor_key", actorKey)
    .eq("idempotency_key", payload.idempotencyKey)
    .maybeSingle();
  if (existing.data) {
    throw new GiftCardServiceError(
      "This purchase is already initialized. Continue the open Stripe payment form instead of starting it again.",
      409,
      "purchase_already_initialized"
    );
  }

  const scope = await resolveScope(supabase, payload);
  const purchaseId = randomUUID();
  const purchaseToken = token();
  const claimToken = deriveGiftCardClaimToken(purchaseId);
  const purchase = await supabase.from("gift_card_purchase_attempts").insert({
    id: purchaseId,
    buyer_actor_key: actorKey,
    buyer_profile_id: input.actor.profileId,
    purchase_token_hash: hashGiftCardToken(purchaseToken),
    claim_token_hash: hashGiftCardToken(claimToken),
    idempotency_key: payload.idempotencyKey,
    amount_cents: payload.amountCents,
    currency: "usd",
    scope_type: payload.scopeType,
    scope_barber_id: scope.barberId,
    scope_shop_id: scope.shopId,
    scope_label: scope.scopeLabel,
    sender_name: payload.senderName,
    recipient_name: payload.recipientName,
    recipient_email: payload.recipientEmail?.toLowerCase() ?? null,
    recipient_phone: payload.recipientPhone ?? null,
    delivery_channel: payload.deliveryChannel,
    message: payload.message,
    status: "creating"
  }).select("id").single();
  if (purchase.error || !purchase.data?.id) {
    throw new GiftCardServiceError("The gift purchase could not be initialized.", 503);
  }

  if (purchase.data.id !== purchaseId) {
    throw new GiftCardServiceError("The gift purchase identity could not be verified.", 503);
  }
  try {
    const intent = await getStripeConnectClient().paymentIntents.create({
      amount: payload.amountCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      description: `BVRB3R gift card · ${scope.scopeLabel}`,
      metadata: {
        purpose: "pr36_gift_card_purchase",
        purchaseId,
        scopeType: payload.scopeType,
        scopeId: payload.scopeId ?? "platform"
      }
    }, { idempotencyKey: `pr36-gift:${actorKey}:${payload.idempotencyKey}`.slice(0, 255) });

    if (!intent.client_secret) {
      throw new GiftCardServiceError("Stripe did not return a usable payment session.", 503, "stripe_session_missing");
    }
    const updated = await supabase.from("gift_card_purchase_attempts").update({
      stripe_payment_intent_id: intent.id,
      status: "requires_payment",
      updated_at: new Date().toISOString()
    }).eq("id", purchaseId).eq("status", "creating");
    if (updated.error) {
      throw new GiftCardServiceError("The Stripe session could not be bound to this gift.", 503);
    }

    return {
      purchaseId,
      purchaseToken,
      claimToken,
      clientSecret: intent.client_secret,
      publishableKey: getStripeBillingPublishableKey(),
      amountCents: payload.amountCents,
      currency: "usd",
      scopeLabel: scope.scopeLabel
    };
  } catch (error) {
    await supabase.from("gift_card_purchase_attempts").update({
      status: "failed",
      updated_at: new Date().toISOString()
    }).eq("id", purchaseId).eq("status", "creating");
    if (error instanceof GiftCardServiceError || error instanceof StripeConnectError) throw error;
    throw new GiftCardServiceError("Stripe could not initialize this gift card payment.", 503, "stripe_unavailable");
  }
}

type PurchaseRow = {
  id: string;
  buyer_actor_key: string;
  amount_cents: number;
  currency: string;
  scope_label: string;
  sender_name: string;
  recipient_name: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  delivery_channel: "email" | "sms";
  message: string;
  stripe_payment_intent_id: string | null;
  gift_card_id: string | null;
  status: string;
};

async function deliverGiftClaim(input: {
  supabase: SupabaseAdmin;
  purchase: PurchaseRow;
  claimToken: string;
}) {
  const destination = input.purchase.delivery_channel === "email"
    ? input.purchase.recipient_email
    : input.purchase.recipient_phone;
  if (!destination) {
    return { status: "failed" as const, provider: "missing_destination", claimUrl: null };
  }

  const claimUrl = new URL("/gift-cards", runtimeConfig.appUrl);
  claimUrl.searchParams.set("claim", input.claimToken);
  const now = new Date().toISOString();
  const notification: EngagementNotificationRecord = {
    id: `gift-${input.purchase.id}`,
    userEmail: destination,
    role: "client_user",
    channel: input.purchase.delivery_channel,
    type: "booking_alert",
    title: `${input.purchase.sender_name} sent you a BVRB3R gift card`,
    body: `${input.purchase.message || "A fresh cut is waiting for you."} Claim it securely from this message. It never expires and covers services only.`,
    status: "queued",
    createdAt: now
  };
  const delivery = toNotificationDeliveryRecord(notification);
  delivery.destination = destination;
  delivery.metadata.webUrl = claimUrl.toString();
  const attempt: NotificationDeliveryAttemptRecord = {
    id: `attempt-${delivery.id}-1`,
    deliveryId: delivery.id,
    notificationId: notification.id,
    channel: delivery.channel,
    provider: delivery.provider,
    status: "queued",
    userEmail: destination,
    destination,
    attemptNumber: 1,
    deepLinkUrl: claimUrl.toString(),
    metadata: { purchaseId: input.purchase.id, giftCardId: input.purchase.gift_card_id },
    createdAt: now,
    updatedAt: now
  };
  const result = await executeNotificationAttempt({ notification, delivery, attempt });
  const deliveryStatus = result.status === "retrying" ? "retrying" : result.status;
  await input.supabase.from("gift_card_deliveries").upsert({
    purchase_id: input.purchase.id,
    channel: input.purchase.delivery_channel,
    destination_masked: maskDestination(destination, input.purchase.delivery_channel),
    provider: result.provider,
    provider_message_id: result.providerMessageId ?? null,
    status: deliveryStatus,
    attempt_count: 1,
    last_error: result.errorMessage ?? null,
    delivered_at: result.status === "delivered" ? result.executedAt ?? now : null,
    updated_at: now
  }, { onConflict: "purchase_id,channel" });
  return { status: result.status, provider: result.provider, claimUrl: claimUrl.toString() };
}

export async function confirmGiftCardPayment(input: {
  actor: BookingEngineActor;
  purchaseId: string;
  purchaseToken: string;
  claimToken: string;
}) {
  const supabase = requireSupabase();
  const actorKey = buyerActorKey(input.actor);
  const purchaseResult = await supabase.from("gift_card_purchase_attempts")
    .select("id, buyer_actor_key, amount_cents, currency, scope_label, sender_name, recipient_name, recipient_email, recipient_phone, delivery_channel, message, stripe_payment_intent_id, gift_card_id, status")
    .eq("id", input.purchaseId)
    .eq("purchase_token_hash", hashGiftCardToken(input.purchaseToken))
    .eq("claim_token_hash", hashGiftCardToken(input.claimToken))
    .maybeSingle();
  if (purchaseResult.error || !purchaseResult.data || purchaseResult.data.buyer_actor_key !== actorKey) {
    throw new GiftCardServiceError("This gift purchase could not be found.", 404, "purchase_not_found");
  }
  const purchase = purchaseResult.data as PurchaseRow;
  if (!purchase.stripe_payment_intent_id) {
    throw new GiftCardServiceError("This gift has no Stripe payment to verify.", 409, "stripe_intent_missing");
  }

  const intent = await getStripeConnectClient().paymentIntents.retrieve(purchase.stripe_payment_intent_id);
  if (
    intent.status !== "succeeded"
    || intent.amount !== purchase.amount_cents
    || intent.currency !== purchase.currency
    || intent.metadata.purchaseId !== purchase.id
    || intent.metadata.purpose !== "pr36_gift_card_purchase"
  ) {
    throw new GiftCardServiceError(
      "Stripe has not verified this exact gift card payment yet.",
      409,
      "stripe_payment_not_verified"
    );
  }

  await supabase.from("gift_card_purchase_attempts").update({
    status: purchase.gift_card_id ? "activated" : "paid",
    stripe_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq("id", purchase.id).eq("stripe_payment_intent_id", intent.id);

  const code = token();
  const activation = await supabase.rpc("pr36_activate_gift_card_purchase", {
    p_purchase_id: purchase.id,
    p_purchase_token_hash: hashGiftCardToken(input.purchaseToken),
    p_claim_token_hash: hashGiftCardToken(input.claimToken),
    p_code_hash: hashGiftCardToken(code),
    p_code_last4: code.slice(-4)
  });
  const activated = activation.data as { outcome?: string; giftCardId?: string; alreadyActivated?: boolean } | null;
  if (activation.error || activated?.outcome !== "activated" || !activated.giftCardId) {
    throw new GiftCardServiceError(
      "Stripe was verified, but gift activation needs review. No second charge was created.",
      503,
      "gift_activation_needs_review"
    );
  }

  purchase.gift_card_id = activated.giftCardId;
  purchase.status = "activated";
  const delivery = await deliverGiftClaim({ supabase, purchase, claimToken: input.claimToken });
  return {
    giftCardId: activated.giftCardId,
    amountCents: purchase.amount_cents,
    currency: purchase.currency,
    scopeLabel: purchase.scope_label,
    delivery: {
      status: delivery.status,
      provider: delivery.provider,
      claimUrl: delivery.status === "delivered" ? null : delivery.claimUrl,
      explanation: delivery.status === "delivered"
        ? `Sent by ${purchase.delivery_channel}.`
        : "The card is active, but provider delivery is not proven. Copy the secure claim link instead."
    },
    doctrine: { neverExpires: true, serviceOnly: true, tipsCovered: false, barberPaidFull: true }
  };
}

/**
 * Durable Stripe hook for the shared verified webhook dispatcher. It activates
 * paid value even if the browser disappears after Stripe succeeds. Delivery is
 * intentionally left for the buyer-bound confirmation path because only that
 * path still possesses the one-time plaintext claim token.
 */
export async function processGiftCardStripeEvent(event: Stripe.Event) {
  if (!["payment_intent.succeeded", "payment_intent.payment_failed", "payment_intent.canceled"].includes(event.type)) {
    return { handled: false } as const;
  }
  const intent = event.data.object as Stripe.PaymentIntent;
  if (intent.metadata.purpose !== "pr36_gift_card_purchase" || !intent.metadata.purchaseId) {
    return { handled: false } as const;
  }
  const supabase = requireSupabase();
  const purchaseResult = await supabase.from("gift_card_purchase_attempts")
    .select("id, buyer_actor_key, amount_cents, currency, scope_label, sender_name, recipient_name, recipient_email, recipient_phone, delivery_channel, message, stripe_payment_intent_id, purchase_token_hash, claim_token_hash, gift_card_id, status")
    .eq("id", intent.metadata.purchaseId)
    .eq("stripe_payment_intent_id", intent.id)
    .maybeSingle();
  if (purchaseResult.error || !purchaseResult.data) {
    throw new GiftCardServiceError("Stripe gift-card metadata did not match a purchase.", 409, "gift_webhook_mismatch");
  }
  const purchase = purchaseResult.data as PurchaseRow & {
    purchase_token_hash: string;
    claim_token_hash: string;
  };
  if (event.type !== "payment_intent.succeeded") {
    await supabase.from("gift_card_purchase_attempts").update({
      status: "failed",
      updated_at: new Date().toISOString()
    }).eq("id", purchase.id).is("gift_card_id", null);
    return { handled: true, status: "failed" as const };
  }
  if (intent.amount !== purchase.amount_cents || intent.currency !== purchase.currency) {
    await supabase.from("gift_card_purchase_attempts").update({
      status: "needs_review",
      updated_at: new Date().toISOString()
    }).eq("id", purchase.id);
    throw new GiftCardServiceError("Stripe gift-card amount or currency did not match.", 409, "gift_webhook_amount_mismatch");
  }
  const claimToken = deriveGiftCardClaimToken(purchase.id);
  if (hashGiftCardToken(claimToken) !== purchase.claim_token_hash) {
    await supabase.from("gift_card_purchase_attempts").update({
      status: "needs_review",
      updated_at: new Date().toISOString()
    }).eq("id", purchase.id);
    throw new GiftCardServiceError(
      "Gift-card claim authority no longer matches this purchase.",
      503,
      "gift_claim_authority_mismatch"
    );
  }
  await supabase.from("gift_card_purchase_attempts").update({
    status: purchase.gift_card_id ? "activated" : "paid",
    stripe_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq("id", purchase.id).eq("stripe_payment_intent_id", intent.id);
  if (!purchase.gift_card_id) {
    const code = token();
    const activation = await supabase.rpc("pr36_activate_gift_card_purchase", {
      p_purchase_id: purchase.id,
      p_purchase_token_hash: purchase.purchase_token_hash,
      p_claim_token_hash: purchase.claim_token_hash,
      p_code_hash: hashGiftCardToken(code),
      p_code_last4: code.slice(-4)
    });
    if (activation.error || (activation.data as { outcome?: string } | null)?.outcome !== "activated") {
      throw new GiftCardServiceError("Stripe succeeded, but webhook activation needs review.", 503, "gift_webhook_activation_failed");
    }
    purchase.gift_card_id = (activation.data as { giftCardId?: string } | null)?.giftCardId ?? null;
  }
  const delivery = await deliverGiftClaim({ supabase, purchase, claimToken });
  return {
    handled: true,
    status: "activated" as const,
    deliveryStatus: delivery.status
  };
}

export async function claimGiftCard(input: { profileId: string; claimToken: string }) {
  const supabase = requireSupabase();
  const result = await supabase.rpc("pr36_claim_gift_card", {
    p_claim_token_hash: hashGiftCardToken(input.claimToken),
    p_profile_id: input.profileId
  });
  const data = result.data as { outcome?: string; reason?: string; giftCardId?: string; balanceCents?: number; currency?: string } | null;
  if (result.error || data?.outcome !== "claimed") {
    throw new GiftCardServiceError(
      data?.reason === "gift_card_already_claimed" ? "This gift card is already claimed by another account." : "This gift card could not be claimed.",
      data?.reason === "gift_card_already_claimed" ? 409 : 404,
      data?.reason ?? "gift_claim_failed"
    );
  }
  return data;
}

export async function redeemGiftCardBalance(input: {
  profileId: string;
  appointmentId: string;
  idempotencyKey: string;
}) {
  const supabase = requireSupabase();
  const result = await supabase.rpc("pr36_apply_gift_balance", {
    p_profile_id: input.profileId,
    p_appointment_id: input.appointmentId,
    p_idempotency_key: input.idempotencyKey
  });
  const data = result.data as { outcome?: string; reason?: string; appliedCents?: number; tipAppliedCents?: number } | null;
  if (result.error || data?.outcome !== "applied") {
    throw new GiftCardServiceError(
      data?.reason === "no_eligible_service_balance"
        ? "No eligible service balance is available for this appointment. Tips remain separate."
        : "Gift balance could not be applied to that appointment.",
      data?.reason === "appointment_not_found" ? 404 : 409,
      data?.reason ?? "gift_redemption_failed"
    );
  }
  return data;
}

export async function applyEligibleGiftBalanceAtCheckout(input: {
  profileId: string;
  appointmentId: string;
}) {
  const supabase = requireSupabase();
  const result = await supabase.rpc("pr36_apply_gift_balance", {
    p_profile_id: input.profileId,
    p_appointment_id: input.appointmentId,
    p_idempotency_key: `auto-checkout:${input.appointmentId}`
  });
  const data = result.data as {
    outcome?: string;
    reason?: string;
    appliedCents?: number;
    tipAppliedCents?: number;
    serviceOnly?: boolean;
  } | null;
  if (result.error) {
    throw new GiftCardServiceError(
      "Gift balance could not be verified before checkout.",
      503,
      "gift_checkout_preflight_failed"
    );
  }
  if (data?.outcome === "not_applied" && data.reason === "no_eligible_service_balance") {
    return { appliedCents: 0, tipAppliedCents: 0, serviceOnly: true, outcome: "not_applied" as const };
  }
  if (data?.outcome !== "applied") {
    throw new GiftCardServiceError(
      "Gift balance could not be safely applied to this checkout.",
      data?.reason === "appointment_not_found" ? 404 : 409,
      data?.reason ?? "gift_checkout_application_failed"
    );
  }
  return {
    appliedCents: Number(data.appliedCents ?? 0),
    tipAppliedCents: Number(data.tipAppliedCents ?? 0),
    serviceOnly: data.serviceOnly === true,
    outcome: "applied" as const
  };
}

export async function readGiftCardWallet(profileId: string) {
  const supabase = requireSupabase();
  const cardsResult = await supabase.from("gift_cards")
    .select("id, code_last4, balance_cents, initial_balance_cents, currency, scope_type, scope_barber_id, scope_shop_id, status, purchased_at, claimed_at")
    .eq("claimed_by_profile_id", profileId)
    .order("purchased_at", { ascending: false });
  if (cardsResult.error) {
    throw new GiftCardServiceError("Gift balance could not be loaded.", 503);
  }
  const cards = (cardsResult.data ?? []) as Array<Record<string, unknown>>;
  const ids = cards.map((card) => card.id as string);
  const ledgerResult = ids.length
    ? await supabase.from("gift_card_ledger")
      .select("id, gift_card_id, appointment_id, entry_type, amount_cents, balance_after_cents, created_at, metadata")
      .in("gift_card_id", ids)
      .order("created_at", { ascending: false })
      .limit(100)
    : { data: [], error: null };
  if (ledgerResult.error) {
    throw new GiftCardServiceError("Gift card history could not be loaded.", 503);
  }
  return {
    availableCents: cards.reduce((sum, card) => sum + Number(card.balance_cents ?? 0), 0),
    currency: "usd",
    cards: cards.map((card) => ({
      id: card.id as string,
      last4: card.code_last4 as string,
      balanceCents: Number(card.balance_cents ?? 0),
      initialBalanceCents: Number(card.initial_balance_cents ?? 0),
      currency: card.currency as string,
      scopeType: card.scope_type as string,
      status: card.status as string,
      purchasedAt: card.purchased_at as string,
      claimedAt: card.claimed_at as string | null,
      expiresAt: null
    })),
    history: (ledgerResult.data ?? []).map((entry) => ({
      id: entry.id as string,
      giftCardId: entry.gift_card_id as string,
      appointmentId: entry.appointment_id as string | null,
      type: entry.entry_type as string,
      amountCents: Number(entry.amount_cents ?? 0),
      balanceAfterCents: Number(entry.balance_after_cents ?? 0),
      createdAt: entry.created_at as string
    })),
    rules: { neverExpires: true, serviceOnly: true, tipsCovered: false, barberPaidFull: true }
  };
}
