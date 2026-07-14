import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { maskEmail, maskPhone } from "@/lib/kiosk/priority1";

export type DeliveryChannel = "sms" | "email";
export type DeliveryStatus = "sent" | "failed" | "blocked";

export interface NotificationDeliveryInput {
  channel: DeliveryChannel;
  to: string;
  title: string;
  body: string;
  notificationType: string;
  profileId?: string | null;
  clientReference?: string | null;
  barberReference?: string | null;
  locationReference?: string | null;
  appointmentReference?: string | null;
  dedupeKey: string;
  metadata?: Record<string, unknown>;
  consentGranted: boolean;
  operational: boolean;
  attemptNumber?: number;
}

export interface NotificationDeliveryResult {
  notificationId?: string;
  attemptId?: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  provider?: string;
  providerMessageId?: string;
  failureCode?: string;
  failureMessage?: string;
  destinationMasked: string;
}

function admin() {
  const client = createSupabaseAdminClient();
  if (!client) throw new Error("Supabase admin client is unavailable.");
  return client;
}

function destinationMasked(channel: DeliveryChannel, destination: string) {
  return channel === "sms" ? maskPhone(destination) ?? "••••" : maskEmail(destination) ?? "•••@•••";
}

function appUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BVRB3R_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

async function sendTwilioSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    return { ok: false as const, code: "sms_provider_not_configured", message: "SMS provider is not configured." };
  }

  const params = new URLSearchParams({ To: to, From: from, Body: body });
  params.set("StatusCallback", `${appUrl()}/api/webhooks/twilio/status`);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString(),
    cache: "no-store"
  });

  const payload = await response.json().catch(() => ({})) as { sid?: string; code?: number; message?: string; status?: string };
  if (!response.ok || !payload.sid) {
    return {
      ok: false as const,
      code: payload.code ? `twilio_${payload.code}` : `twilio_http_${response.status}`,
      message: payload.message ?? "Twilio rejected the message."
    };
  }

  return { ok: true as const, provider: "twilio", id: payload.sid, providerStatus: payload.status ?? "queued" };
}

async function sendResendEmail(to: string, title: string, body: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BVRB3R_EMAIL_FROM ?? process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return { ok: false as const, code: "email_provider_not_configured", message: "Email provider is not configured." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: title,
      text: body,
      headers: { "X-Entity-Ref-ID": randomUUID() }
    }),
    cache: "no-store"
  });

  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
  if (!response.ok || !payload.id) {
    return {
      ok: false as const,
      code: payload.name ? `resend_${payload.name}` : `resend_http_${response.status}`,
      message: payload.message ?? "Resend rejected the email."
    };
  }

  return { ok: true as const, provider: "resend", id: payload.id, providerStatus: "sent" };
}

export async function deliverAndRecordNotification(input: NotificationDeliveryInput): Promise<NotificationDeliveryResult> {
  const supabase = admin();
  const masked = destinationMasked(input.channel, input.to);

  if (!input.consentGranted) {
    const blockedAttempt = await supabase.from("notification_delivery_attempts").insert({
      channel: input.channel,
      destination_masked: masked,
      status: "blocked",
      attempt_number: input.attemptNumber ?? 1,
      failure_code: input.operational ? "transactional_consent_missing" : "marketing_opted_out",
      failure_message: input.operational ? "Operational contact consent was not granted." : "Marketing contact is opted out.",
      metadata: { ...input.metadata, operational: input.operational, dedupe_key: input.dedupeKey },
      completed_at: new Date().toISOString()
    }).select("id").maybeSingle();

    return {
      attemptId: blockedAttempt.data?.id,
      channel: input.channel,
      status: "blocked",
      failureCode: input.operational ? "transactional_consent_missing" : "marketing_opted_out",
      failureMessage: input.operational ? "Operational contact consent was not granted." : "Marketing contact is opted out.",
      destinationMasked: masked
    };
  }

  const existing = await supabase
    .from("notifications")
    .select("id, status")
    .eq("dedupe_key", input.dedupeKey)
    .maybeSingle();
  if (existing.error) throw new Error("Unable to inspect notification idempotency.");

  let notificationId = existing.data?.id as string | undefined;
  if (!notificationId) {
    const notification = await supabase.from("notifications").insert({
      profile_id: input.profileId ?? null,
      channel: input.channel,
      title: input.title,
      body: input.body,
      status: "queued",
      audience_email: input.channel === "email" ? input.to : null,
      client_email: input.channel === "email" ? input.to : null,
      client_reference: input.clientReference ?? null,
      barber_reference: input.barberReference ?? null,
      location_reference: input.locationReference ?? null,
      appointment_reference: input.appointmentReference ?? null,
      notification_type: input.notificationType,
      dedupe_key: input.dedupeKey,
      metadata: { ...input.metadata, destination_masked: masked, operational: input.operational }
    }).select("id").single();
    if (notification.error || !notification.data) throw new Error("Unable to create notification truth.");
    notificationId = notification.data.id;
  }

  const attemptNumber = input.attemptNumber ?? 1;
  const attempt = await supabase.from("notification_delivery_attempts").insert({
    notification_id: notificationId,
    channel: input.channel,
    destination_masked: masked,
    status: "sending",
    attempt_number: attemptNumber,
    metadata: { ...input.metadata, operational: input.operational }
  }).select("id").single();
  if (attempt.error || !attempt.data) throw new Error("Unable to create notification delivery attempt.");

  const providerResult = input.channel === "sms"
    ? await sendTwilioSms(input.to, input.body)
    : await sendResendEmail(input.to, input.title, input.body);

  if (!providerResult.ok) {
    await Promise.all([
      supabase.from("notifications").update({
        status: "failed",
        updated_at: new Date().toISOString(),
        metadata: { ...input.metadata, destination_masked: masked, operational: input.operational, failure_code: providerResult.code }
      }).eq("id", notificationId),
      supabase.from("notification_delivery_attempts").update({
        status: "failed",
        provider: input.channel === "sms" ? "twilio" : "resend",
        failure_code: providerResult.code,
        failure_message: providerResult.message,
        completed_at: new Date().toISOString()
      }).eq("id", attempt.data.id)
    ]);

    return {
      notificationId,
      attemptId: attempt.data.id,
      channel: input.channel,
      status: "failed",
      provider: input.channel === "sms" ? "twilio" : "resend",
      failureCode: providerResult.code,
      failureMessage: providerResult.message,
      destinationMasked: masked
    };
  }

  await Promise.all([
    supabase.from("notifications").update({
      status: "sent",
      updated_at: new Date().toISOString(),
      metadata: {
        ...input.metadata,
        destination_masked: masked,
        operational: input.operational,
        provider: providerResult.provider,
        provider_message_id: providerResult.id,
        provider_status: providerResult.providerStatus
      }
    }).eq("id", notificationId),
    supabase.from("notification_delivery_attempts").update({
      status: "sent",
      provider: providerResult.provider,
      provider_message_id: providerResult.id,
      completed_at: new Date().toISOString(),
      metadata: { ...input.metadata, provider_status: providerResult.providerStatus }
    }).eq("id", attempt.data.id)
  ]);

  return {
    notificationId,
    attemptId: attempt.data.id,
    channel: input.channel,
    status: "sent",
    provider: providerResult.provider,
    providerMessageId: providerResult.id,
    destinationMasked: masked
  };
}

export async function markBothChannelsFailed(input: {
  guestVisitId?: string | null;
  queueReference?: string | null;
  shopId?: string | null;
  appointmentReference?: string | null;
  results: NotificationDeliveryResult[];
}) {
  const failed = input.results.filter((result) => result.status === "failed");
  if (failed.length < 2 || !failed.some((result) => result.channel === "sms") || !failed.some((result) => result.channel === "email")) return false;
  const supabase = admin();
  if (input.guestVisitId) {
    await supabase.from("kiosk_guest_visits").update({ notification_escalation_required: true, updated_at: new Date().toISOString() }).eq("id", input.guestVisitId);
  }
  const attemptIds = failed.map((result) => result.attemptId).filter(Boolean) as string[];
  if (attemptIds.length) await supabase.from("notification_delivery_attempts").update({ escalation_required: true }).in("id", attemptIds);
  await supabase.from("platform_events").insert({
    event_type: "kiosk_notification_escalation_required",
    entity_type: "kiosk_guest_visit",
    entity_id: input.guestVisitId ?? input.queueReference ?? input.appointmentReference ?? randomUUID(),
    actor_role: "system",
    source: "notification_delivery",
    related_ids: { guest_visit_id: input.guestVisitId, queue_reference: input.queueReference, appointment_reference: input.appointmentReference, shop_id: input.shopId },
    payload: { failed_channels: failed.map((result) => result.channel), front_desk_ping_required: true, tv_callout_required: true },
    idempotency_key: `notification-escalation:${input.guestVisitId ?? input.queueReference ?? input.appointmentReference}`,
    occurred_at: new Date().toISOString()
  });
  return true;
}
