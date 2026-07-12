import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripeConnectClient, getStripeConnectEnvironment } from "@/lib/stripe/connect";
import type { UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type BarberIdentity = {
  profileId: string;
  barberId: string;
};

type ConnectedAccountRow = {
  id: string;
  provider_account_id: string | null;
  onboarding_status: string;
  payout_readiness_status: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements_currently_due: unknown;
  disabled_reason: string | null;
  processor_last_synced_at: string | null;
};

type PosSaleRow = {
  id: string;
  barber_id: string;
  status: "draft" | "payment_pending" | "paid" | "refunded" | "voided";
  total_cents: number;
  platform_fee_cents: number;
  tip_cents: number;
  client_id: string | null;
  shop_id: string | null;
  payment_id: string | null;
  updated_at: string;
};

export class BarberTerminalError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "barber_terminal_failed") {
    super(message);
    this.name = "BarberTerminalError";
    this.status = status;
    this.code = code;
  }
}

function getSupabaseOrThrow() {
  const client = createSupabaseAdminClient();
  if (!client) throw new BarberTerminalError("Payments are temporarily unavailable.", 503, "supabase_unavailable");
  return client;
}

async function resolveBarberIdentity(supabase: SupabaseClient, user: UserAccount): Promise<BarberIdentity> {
  const profileById = await supabase.from("profiles").select("id, role").eq("id", user.id).maybeSingle();
  let profile = profileById.data;

  if (!profile && user.email) {
    const profileByEmail = await supabase.from("profiles").select("id, role").eq("email", user.email).maybeSingle();
    profile = profileByEmail.data;
  }

  if (!profile || profile.role !== "barber_user") {
    throw new BarberTerminalError("A Barber account is required.", 403, "barber_role_required");
  }

  const barber = await supabase.from("barbers").select("id, profile_id").eq("profile_id", profile.id).maybeSingle();
  if (barber.error || !barber.data) {
    throw new BarberTerminalError("Complete your Barber profile before setting up payments.", 409, "barber_profile_required");
  }

  return { profileId: profile.id, barberId: barber.data.id };
}

async function loadConnectedAccount(supabase: SupabaseClient, barberId: string): Promise<ConnectedAccountRow | null> {
  const result = await supabase
    .from("connected_accounts")
    .select("id, provider_account_id, onboarding_status, payout_readiness_status, charges_enabled, payouts_enabled, requirements_currently_due, disabled_reason, processor_last_synced_at")
    .eq("subject_type", "barber")
    .eq("barber_id", barberId)
    .eq("provider", "stripe_connect")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw new BarberTerminalError("Unable to read Stripe readiness.", 500, "connect_read_failed");
  return result.data as ConnectedAccountRow | null;
}

export async function getBarberTerminalStatus(user: UserAccount) {
  const supabase = getSupabaseOrThrow();
  const identity = await resolveBarberIdentity(supabase, user);
  const connectedAccount = await loadConnectedAccount(supabase, identity.barberId);
  const environment = getStripeConnectEnvironment();

  const activeDevice = await supabase
    .from("stripe_terminal_devices")
    .select("id, platform, status, tap_to_pay_eligible, app_version, last_seen_at")
    .eq("profile_id", identity.profileId)
    .eq("barber_id", identity.barberId)
    .eq("status", "active")
    .eq("tap_to_pay_eligible", true)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const connectReady = Boolean(connectedAccount?.provider_account_id && connectedAccount.charges_enabled);
  const payoutsReady = Boolean(connectedAccount?.payouts_enabled && connectedAccount.payout_readiness_status === "ready");
  const nativeDeviceReady = Boolean(activeDevice.data?.tap_to_pay_eligible);
  const featureEnabled = process.env.BVRB3R_TAP_TO_PAY_ENABLED === "true";
  const tapToPayReady = connectReady && nativeDeviceReady && featureEnabled && !environment.blocksLivePayouts;

  return {
    ok: true,
    connect: {
      connected: Boolean(connectedAccount?.provider_account_id),
      onboardingStatus: connectedAccount?.onboarding_status ?? "not_started",
      chargesEnabled: connectedAccount?.charges_enabled ?? false,
      payoutsEnabled: connectedAccount?.payouts_enabled ?? false,
      payoutReadinessStatus: connectedAccount?.payout_readiness_status ?? "not_ready",
      requirementsCurrentlyDue: Array.isArray(connectedAccount?.requirements_currently_due)
        ? connectedAccount.requirements_currently_due
        : [],
      disabledReason: connectedAccount?.disabled_reason ?? null,
      lastSyncedAt: connectedAccount?.processor_last_synced_at ?? null,
      ready: connectReady,
      payoutsReady
    },
    terminal: {
      nativeDeviceReady,
      featureEnabled,
      tapToPayReady,
      platform: activeDevice.data?.platform ?? null,
      appVersion: activeDevice.data?.app_version ?? null,
      lastSeenAt: activeDevice.data?.last_seen_at ?? null,
      requirement: nativeDeviceReady
        ? null
        : "Open BVRB3R in the supported native Barber app on an approved Tap to Pay device."
    },
    environment: {
      mode: environment.mode,
      livePaymentsAllowed: !environment.blocksLivePayouts
    }
  };
}

export async function createBarberTerminalConnectionToken(user: UserAccount) {
  const supabase = getSupabaseOrThrow();
  const identity = await resolveBarberIdentity(supabase, user);
  const account = await loadConnectedAccount(supabase, identity.barberId);

  if (!account?.provider_account_id || !account.charges_enabled) {
    throw new BarberTerminalError("Finish Stripe setup before using Tap to Pay.", 409, "stripe_connect_not_ready");
  }

  const activeDevice = await supabase
    .from("stripe_terminal_devices")
    .select("id")
    .eq("profile_id", identity.profileId)
    .eq("barber_id", identity.barberId)
    .eq("status", "active")
    .eq("tap_to_pay_eligible", true)
    .limit(1)
    .maybeSingle();

  if (!activeDevice.data || process.env.BVRB3R_TAP_TO_PAY_ENABLED !== "true") {
    throw new BarberTerminalError("This device is not approved for Tap to Pay.", 409, "terminal_device_not_ready");
  }

  const stripe = getStripeConnectClient();
  if (!stripe) throw new BarberTerminalError("Stripe is not configured.", 503, "stripe_unavailable");

  const token = await stripe.terminal.connectionTokens.create({}, { stripeAccount: account.provider_account_id });

  await supabase.from("platform_events").insert({
    event_type: "barber_terminal_connection_token_created",
    entity_type: "barber",
    entity_id: identity.barberId,
    actor_id: identity.profileId,
    actor_role: "barber_user",
    source: "api",
    related_ids: { connected_account_id: account.id, terminal_device_id: activeDevice.data.id },
    payload: {},
    idempotency_key: null
  });

  return { ok: true, secret: token.secret };
}

export async function createTapToPayIntent(user: UserAccount, posSaleId: string) {
  const supabase = getSupabaseOrThrow();
  const identity = await resolveBarberIdentity(supabase, user);
  const account = await loadConnectedAccount(supabase, identity.barberId);

  if (!account?.provider_account_id || !account.charges_enabled) {
    throw new BarberTerminalError("Finish Stripe setup before accepting card-present payments.", 409, "stripe_connect_not_ready");
  }

  const device = await supabase
    .from("stripe_terminal_devices")
    .select("id")
    .eq("profile_id", identity.profileId)
    .eq("barber_id", identity.barberId)
    .eq("status", "active")
    .eq("tap_to_pay_eligible", true)
    .limit(1)
    .maybeSingle();

  if (!device.data || process.env.BVRB3R_TAP_TO_PAY_ENABLED !== "true") {
    throw new BarberTerminalError("Tap to Pay is not enabled on this device.", 409, "terminal_device_not_ready");
  }

  const saleResult = await supabase
    .from("pos_sales")
    .select("id, barber_id, status, total_cents, platform_fee_cents, tip_cents, client_id, shop_id, payment_id, updated_at")
    .eq("id", posSaleId)
    .eq("barber_id", identity.barberId)
    .maybeSingle();
  const sale = saleResult.data as PosSaleRow | null;

  if (saleResult.error || !sale) throw new BarberTerminalError("POS sale not found.", 404, "pos_sale_not_found");
  if (sale.status === "paid") throw new BarberTerminalError("This sale is already paid.", 409, "pos_sale_already_paid");
  if (sale.status === "refunded" || sale.status === "voided") {
    throw new BarberTerminalError("This sale cannot be charged.", 409, "pos_sale_not_chargeable");
  }
  if (!Number.isInteger(sale.total_cents) || sale.total_cents <= 0) {
    throw new BarberTerminalError("The server-authorized sale total is invalid.", 409, "invalid_sale_total");
  }

  const existingAttempt = await supabase
    .from("stripe_terminal_payment_attempts")
    .select("provider_payment_intent_id, status, payment_id")
    .eq("pos_sale_id", sale.id)
    .in("status", ["created", "collecting", "processing", "succeeded"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingAttempt.data) {
    return {
      ok: true,
      paymentIntentId: existingAttempt.data.provider_payment_intent_id,
      status: existingAttempt.data.status,
      reused: true
    };
  }

  const stripe = getStripeConnectClient();
  if (!stripe) throw new BarberTerminalError("Stripe is not configured.", 503, "stripe_unavailable");

  const idempotencyKey = `bvrb3r:terminal:${sale.id}:v1`;
  const intent = await stripe.paymentIntents.create({
    amount: sale.total_cents,
    currency: "usd",
    payment_method_types: ["card_present"],
    capture_method: "automatic",
    application_fee_amount: Math.max(0, Math.min(sale.platform_fee_cents, sale.total_cents)),
    metadata: {
      bvrb3r_payment_channel: "tap_to_pay",
      pos_sale_id: sale.id,
      barber_id: identity.barberId,
      profile_id: identity.profileId,
      client_id: sale.client_id ?? "",
      shop_id: sale.shop_id ?? ""
    }
  }, {
    stripeAccount: account.provider_account_id,
    idempotencyKey
  });

  const paymentInsert = await supabase.from("payments").insert({
    appointment_id: null,
    amount: sale.total_cents / 100,
    type: "pos_sale",
    provider: "stripe",
    status: "pending",
    client_id: sale.client_id,
    shop_id: sale.shop_id,
    barber_id: identity.barberId,
    provider_payment_intent_id: intent.id,
    currency: "usd",
    payment_status: "pending",
    payment_type: "pos_sale",
    pos_sale_id: sale.id,
    metadata: {
      payment_channel: "tap_to_pay",
      stripe_connected_account_id: account.provider_account_id
    }
  }).select("id").single();

  if (paymentInsert.error || !paymentInsert.data) {
    await stripe.paymentIntents.cancel(intent.id, {}, { stripeAccount: account.provider_account_id }).catch(() => undefined);
    throw new BarberTerminalError("Unable to persist the payment attempt.", 500, "payment_persist_failed");
  }

  const attemptInsert = await supabase.from("stripe_terminal_payment_attempts").insert({
    pos_sale_id: sale.id,
    payment_id: paymentInsert.data.id,
    barber_id: identity.barberId,
    connected_account_id: account.id,
    terminal_device_id: device.data.id,
    provider_payment_intent_id: intent.id,
    status: "created",
    amount_cents: sale.total_cents,
    currency: "usd",
    idempotency_key: idempotencyKey
  });

  if (attemptInsert.error) {
    await stripe.paymentIntents.cancel(intent.id, {}, { stripeAccount: account.provider_account_id }).catch(() => undefined);
    await supabase.from("payments").update({ payment_status: "voided", status: "voided" }).eq("id", paymentInsert.data.id);
    throw new BarberTerminalError("Unable to persist the Terminal attempt.", 500, "terminal_attempt_persist_failed");
  }

  await supabase.from("pos_sales").update({
    status: "payment_pending",
    payment_method: "tap_to_pay",
    payment_status: "pending",
    payment_id: paymentInsert.data.id,
    updated_at: new Date().toISOString()
  }).eq("id", sale.id).eq("barber_id", identity.barberId);

  return { ok: true, paymentIntentId: intent.id, status: intent.status, reused: false };
}