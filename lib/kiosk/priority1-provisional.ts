import { createHash, createHmac, randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deliverAndRecordNotification } from "@/lib/notifications/delivery";
import { maskEmail, maskPhone } from "@/lib/kiosk/priority1";

export type PriorityOneActivationChannel = "sms" | "email";

export interface PriorityOneProvisionalClientInput {
  shopId: string;
  fullName: string;
  phone: string;
  email: string;
  preferredChannel: PriorityOneActivationChannel;
  transactionalSmsConsent: boolean;
  transactionalEmailConsent: boolean;
  marketingConsent: boolean;
  termsAccepted: boolean;
  privacyAccepted: boolean;
  bookingPolicyAccepted: boolean;
  termsVersion?: string;
  privacyVersion?: string;
  shopPolicyVersion?: string;
  sourceAttribution: Record<string, unknown>;
  idempotencyKey: string;
  guestVisitId?: string | null;
  clientBridgeInvitationId?: string | null;
}

export type PriorityOneProvisionalClientResult =
  | {
      status: "activation_sent" | "activation_failed";
      clientId: string;
      provisionalClientId: string;
      activationId: string;
      activationPath: string;
      expiresAt: string;
      destinationMasked: string;
      failureCode?: string;
      failureMessage?: string;
    }
  | {
      status: "possible_duplicate";
      maskedPhone: string | null;
      maskedEmail: string | null;
      publicUsername: string | null;
    };

export type PriorityOneActivationReadResult =
  | { status: "expired" | "already_used" | "invalid" }
  | {
      status: "claimable";
      activationId: string;
      fullName: string;
      phone: string;
      email: string;
      channel: PriorityOneActivationChannel;
      destinationMasked: string | null;
      shopId: string | null;
      sourceAttribution: Record<string, unknown>;
      expiresAt: string;
    };

export interface PriorityOneActivationClaimResult {
  status: "activated" | "existing_account_requires_sign_in";
  loginMethod?: "phone" | "email";
  loginIdentifier?: string;
  redirectTo: string;
  profileId?: string;
  clientId?: string;
  publicUsername?: string;
}

export class PriorityOneActivationError extends Error {
  constructor(
    public message: string,
    public status = 400,
    public code = "priority1_activation_error",
  ) {
    super(message);
    this.name = "PriorityOneActivationError";
  }
}

export function priorityOneActivationAdmin() {
  const client = createSupabaseAdminClient();
  if (!client)
    throw new PriorityOneActivationError(
      "Supabase is unavailable.",
      503,
      "supabase_unavailable",
    );
  return client;
}

function secret() {
  const value =
    process.env.KIOSK_ACTIVATION_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value)
    throw new PriorityOneActivationError(
      "Account activation is not configured.",
      503,
      "activation_secret_missing",
    );
  return value;
}

export function hashPriorityOneActivationToken(value: string) {
  return createHash("sha256").update(`${secret()}:${value}`).digest("hex");
}

function deterministicActivationToken(idempotencyKey: string) {
  return createHmac("sha256", secret())
    .update(`priority1-activation:${idempotencyKey}`)
    .digest("base64url");
}

export function normalizePhoneForPriorityOneAuth(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 11) return `+${digits}`;
  return phone.trim();
}

function contactFingerprint(phone: string, email: string) {
  return createHmac("sha256", secret())
    .update(`${phone.replace(/\D/g, "")}|${email.trim().toLowerCase()}`)
    .digest("hex");
}

function appUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.BVRB3R_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function normalizePriorityOneUsername(value: string) {
  const normalized = value.trim().replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9_.]{3,30}$/.test(normalized)) {
    throw new PriorityOneActivationError(
      "Use 3–30 lowercase letters, numbers, periods, or underscores.",
      400,
      "username_invalid",
    );
  }
  if (
    [
      "admin",
      "support",
      "bvrb3r",
      "payments",
      "help",
      "official",
      "system",
      "login",
      "signup",
      "dashboard",
      "api",
      "client",
      "barber",
      "shop",
      "owner",
      "architect",
      "settings",
      "profile",
      "public",
    ].includes(normalized)
  ) {
    throw new PriorityOneActivationError(
      "That username is reserved.",
      409,
      "username_reserved",
    );
  }
  return normalized;
}

async function findDuplicateClient(phone: string, email: string) {
  const supabase = priorityOneActivationAdmin();
  const emailResult = await supabase
    .from("profiles")
    .select("id, phone, email, public_username")
    .eq("role", "client_user")
    .eq("email", email.trim().toLowerCase())
    .limit(2);
  if (emailResult.error)
    throw new PriorityOneActivationError(
      "Unable to check existing accounts.",
      500,
      "duplicate_check_failed",
    );
  let rows = emailResult.data ?? [];
  if (!rows.length) {
    const phoneResult = await supabase
      .from("profiles")
      .select("id, phone, email, public_username")
      .eq("role", "client_user")
      .eq("phone", phone.trim())
      .limit(2);
    if (phoneResult.error)
      throw new PriorityOneActivationError(
        "Unable to check existing accounts.",
        500,
        "duplicate_check_failed",
      );
    rows = phoneResult.data ?? [];
  }
  return rows[0] ?? null;
}

export async function createPriorityOneProvisionalClient(
  input: PriorityOneProvisionalClientInput,
): Promise<PriorityOneProvisionalClientResult> {
  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const email = input.email.trim().toLowerCase();
  if (
    fullName.length < 2 ||
    phone.replace(/\D/g, "").length < 7 ||
    !email.includes("@")
  ) {
    throw new PriorityOneActivationError(
      "Name, phone, and email are required.",
      400,
      "provisional_contact_invalid",
    );
  }
  if (
    !input.termsAccepted ||
    !input.privacyAccepted ||
    !input.bookingPolicyAccepted
  ) {
    throw new PriorityOneActivationError(
      "Terms, Privacy, and the booking policy must each be accepted.",
      400,
      "required_consents_missing",
    );
  }
  if (input.preferredChannel === "sms" && !input.transactionalSmsConsent) {
    throw new PriorityOneActivationError(
      "SMS permission is required to send the activation link by text.",
      400,
      "sms_consent_missing",
    );
  }
  if (input.preferredChannel === "email" && !input.transactionalEmailConsent) {
    throw new PriorityOneActivationError(
      "Email permission is required to send the activation link by email.",
      400,
      "email_consent_missing",
    );
  }

  const duplicate = await findDuplicateClient(phone, email);
  if (duplicate) {
    return {
      status: "possible_duplicate",
      maskedPhone: maskPhone(duplicate.phone),
      maskedEmail: maskEmail(duplicate.email),
      publicUsername: duplicate.public_username
        ? `@${duplicate.public_username}`
        : null,
    };
  }

  const supabase = priorityOneActivationAdmin();
  const rawToken = deterministicActivationToken(input.idempotencyKey);
  const expiresAt = new Date(Date.now() + 72 * 60 * 60_000).toISOString();
  const clientId = randomUUID();
  const provisionalClientId = randomUUID();
  const activationId = randomUUID();
  const destination = input.preferredChannel === "sms" ? phone : email;
  const destinationMasked =
    input.preferredChannel === "sms"
      ? (maskPhone(destination) ?? "••••")
      : (maskEmail(destination) ?? "•••@•••");

  const creation = await supabase.rpc("priority1_create_provisional_client", {
    p_client_id: clientId,
    p_provisional_id: provisionalClientId,
    p_activation_id: activationId,
    p_shop_id: input.shopId,
    p_full_name: fullName,
    p_phone: phone,
    p_email: email,
    p_contact_fingerprint: contactFingerprint(phone, email),
    p_preferred_channel: input.preferredChannel,
    p_transactional_sms_consent: input.transactionalSmsConsent,
    p_transactional_email_consent: input.transactionalEmailConsent,
    p_marketing_consent: input.marketingConsent,
    p_terms_version: input.termsVersion ?? "current",
    p_privacy_version: input.privacyVersion ?? "current",
    p_shop_policy_version: input.shopPolicyVersion ?? "current",
    p_source_attribution: input.sourceAttribution,
    p_idempotency_key: input.idempotencyKey,
    p_activation_token_hash: hashPriorityOneActivationToken(rawToken),
    p_activation_expires_at: expiresAt,
    p_guest_visit_id: input.guestVisitId ?? null,
    p_client_bridge_invitation_id: input.clientBridgeInvitationId ?? null,
    p_destination_masked: destinationMasked,
  });
  if (creation.error || !creation.data)
    throw new PriorityOneActivationError(
      "Unable to create the account shell. Nothing was activated.",
      500,
      "provisional_create_failed",
    );
  const created = creation.data as {
    client_id: string;
    provisional_client_id: string;
    activation_id: string;
    expires_at: string;
  };
  const activationPath = `/join/${rawToken}`;
  const delivery = await deliverAndRecordNotification({
    channel: input.preferredChannel,
    to: destination,
    title: "Claim your BVRB3R account",
    body: `Your BVRB3R account is ready to claim. Open ${appUrl()}${activationPath} within 72 hours. Your password or passkey is created only on your own device.`,
    notificationType: input.guestVisitId
      ? "client_bridge_invitation"
      : "kiosk_account_activation",
    clientReference: created.client_id,
    locationReference: input.shopId,
    dedupeKey: `priority1-activation:${created.activation_id}:${input.preferredChannel}`,
    metadata: {
      activation_id: created.activation_id,
      activation_path: activationPath,
      expires_at: created.expires_at,
      source_attribution: input.sourceAttribution,
    },
    consentGranted:
      input.preferredChannel === "sms"
        ? input.transactionalSmsConsent
        : input.transactionalEmailConsent,
    operational: true,
  });

  if (delivery.status !== "sent") {
    await supabase
      .from("kiosk_account_activations")
      .update({
        status: "failed",
        delivery_notification_id: delivery.notificationId ?? null,
        updated_at: new Date().toISOString(),
        source_attribution: {
          ...input.sourceAttribution,
          delivery_failure: delivery.failureCode,
        },
      })
      .eq("id", created.activation_id);
    return {
      status: "activation_failed",
      clientId: created.client_id,
      provisionalClientId: created.provisional_client_id,
      activationId: created.activation_id,
      activationPath,
      expiresAt: created.expires_at,
      destinationMasked,
      failureCode: delivery.failureCode,
      failureMessage: delivery.failureMessage,
    };
  }

  await supabase
    .from("kiosk_account_activations")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      delivery_notification_id: delivery.notificationId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", created.activation_id);
  return {
    status: "activation_sent",
    clientId: created.client_id,
    provisionalClientId: created.provisional_client_id,
    activationId: created.activation_id,
    activationPath,
    expiresAt: created.expires_at,
    destinationMasked,
  };
}

export async function readPriorityOneActivation(
  rawToken: string,
): Promise<PriorityOneActivationReadResult> {
  const supabase = priorityOneActivationAdmin();
  const activation = await supabase
    .from("kiosk_account_activations")
    .select(
      "id, provisional_client_id, status, channel, destination_masked, expires_at, source_attribution",
    )
    .eq("token_hash", hashPriorityOneActivationToken(rawToken))
    .maybeSingle();
  if (activation.error || !activation.data) return { status: "invalid" };
  if (["used"].includes(activation.data.status))
    return { status: "already_used" };
  if (
    new Date(activation.data.expires_at).getTime() <= Date.now() ||
    activation.data.status === "expired"
  ) {
    await supabase
      .from("kiosk_account_activations")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", activation.data.id);
    await supabase
      .from("kiosk_provisional_clients")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", activation.data.provisional_client_id)
      .eq("status", "pending_activation");
    return { status: "expired" };
  }
  if (["revoked"].includes(activation.data.status))
    return { status: "invalid" };

  const provisional = await supabase
    .from("kiosk_provisional_clients")
    .select(
      "id, shop_id, full_name, phone, email, preferred_channel, status, source_attribution",
    )
    .eq("id", activation.data.provisional_client_id)
    .maybeSingle();
  if (provisional.error || !provisional.data) return { status: "invalid" };

  if (
    !activation.data.status ||
    ["pending", "sent", "failed"].includes(activation.data.status)
  ) {
    await supabase
      .from("kiosk_account_activations")
      .update({
        status: "opened",
        opened_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", activation.data.id);
  }

  return {
    status: "claimable",
    activationId: activation.data.id,
    fullName: provisional.data.full_name,
    phone: provisional.data.phone ?? "",
    email: provisional.data.email ?? "",
    channel: provisional.data.preferred_channel as PriorityOneActivationChannel,
    destinationMasked: activation.data.destination_masked,
    shopId: provisional.data.shop_id,
    sourceAttribution: (activation.data.source_attribution ??
      provisional.data.source_attribution ??
      {}) as Record<string, unknown>,
    expiresAt: activation.data.expires_at,
  };
}
