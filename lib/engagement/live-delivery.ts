import { createPrivateKey, sign } from "crypto";
import { demoClients } from "@/lib/data/demo";
import {
  hasEmailDeliveryConfig,
  hasNativeApnsBridgeConfig,
  hasNativeFcmBridgeConfig,
  hasTwilioDeliveryConfig,
  hasWebPushExecutionConfig,
  runtimeConfig
} from "@/lib/config/runtime";
import type { NotificationDeliveryProvider, NotificationDeliveryRecord, NotificationDeliveryStatus } from "@/types/activation";
import type { EngagementNotificationRecord } from "@/types/engagement";
import type { NotificationDeliveryAttemptRecord, PushProviderKind } from "@/types/mobile";

export interface DeliveryProviderHealth {
  push: {
    webPushConfigured: boolean;
    apnsBridgeReady: boolean;
    fcmBridgeReady: boolean;
  };
  sms: {
    configured: boolean;
  };
  email: {
    configured: boolean;
  };
}

export interface DeliveryExecutionResult {
  provider: NotificationDeliveryProvider | PushProviderKind;
  status: NotificationDeliveryStatus;
  errorMessage?: string;
  providerMessageId?: string;
  providerStatusCode?: number;
  executedAt?: string;
  nextRetryAt?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

function nowIso() {
  return new Date().toISOString();
}

function plusMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function normalizePhone(value?: string) {
  if (!value) {
    return undefined;
  }

  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return undefined;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  return value.startsWith("+") ? value : `+${digits}`;
}

function base64Url(value: Buffer | string) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
}

function getClientPhone(clientId?: string, fallbackEmail?: string) {
  if (clientId) {
    const client = demoClients.find((entry) => entry.id === clientId);
    if (client?.phone) {
      return normalizePhone(client.phone);
    }
  }

  if (fallbackEmail) {
    const client = demoClients.find((entry) => entry.email === fallbackEmail);
    if (client?.phone) {
      return normalizePhone(client.phone);
    }
  }

  return undefined;
}

export function getDeliveryProviderHealth(): DeliveryProviderHealth {
  return {
    push: {
      webPushConfigured: hasWebPushExecutionConfig(),
      apnsBridgeReady: hasNativeApnsBridgeConfig(),
      fcmBridgeReady: hasNativeFcmBridgeConfig()
    },
    sms: {
      configured: hasTwilioDeliveryConfig()
    },
    email: {
      configured: hasEmailDeliveryConfig()
    }
  };
}

export function resolveNotificationDestination(notification: EngagementNotificationRecord, channel: NotificationDeliveryRecord["channel"]) {
  if (channel === "sms") {
    return getClientPhone(notification.clientId, notification.userEmail) ?? notification.userEmail;
  }

  if (channel === "email") {
    return notification.userEmail;
  }

  return notification.userEmail;
}

function buildTextBody(notification: EngagementNotificationRecord, delivery: NotificationDeliveryRecord) {
  const webUrl = typeof delivery.metadata.webUrl === "string" ? delivery.metadata.webUrl : runtimeConfig.appUrl;
  return `${notification.title}\n\n${notification.body}\n\nOpen BVRB3R: ${webUrl}`;
}

function getTwilioSender() {
  return runtimeConfig.twilioMessagingServiceSid || runtimeConfig.twilioFromNumber;
}

async function executeEmailDelivery(notification: EngagementNotificationRecord, delivery: NotificationDeliveryRecord): Promise<DeliveryExecutionResult> {
  if (!hasEmailDeliveryConfig()) {
    return {
      provider: "resend_placeholder",
      status: "placeholder",
      errorMessage: "Resend credentials are not configured for live email delivery yet.",
      executedAt: nowIso()
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtimeConfig.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: runtimeConfig.resendFromEmail,
      to: [delivery.destination],
      subject: notification.title,
      text: buildTextBody(notification, delivery)
    })
  });

  const body = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    return {
      provider: "resend",
      status: "failed",
      errorMessage: (body.message as string | undefined) ?? `Email delivery failed with status ${response.status}.`,
      providerStatusCode: response.status,
      nextRetryAt: plusMinutes(15),
      executedAt: nowIso()
    };
  }

  return {
    provider: "resend",
    status: "delivered",
    providerStatusCode: response.status,
    providerMessageId: (body.id as string | undefined) ?? undefined,
    executedAt: nowIso(),
    metadata: {
      channel: "email"
    }
  };
}

async function executeSmsDelivery(notification: EngagementNotificationRecord, delivery: NotificationDeliveryRecord): Promise<DeliveryExecutionResult> {
  const destination = normalizePhone(delivery.destination);
  if (!destination) {
    return {
      provider: hasTwilioDeliveryConfig() ? "twilio" : "twilio_placeholder",
      status: hasTwilioDeliveryConfig() ? "failed" : "placeholder",
      errorMessage: "A valid SMS destination is not available for this notification.",
      nextRetryAt: hasTwilioDeliveryConfig() ? plusMinutes(15) : undefined,
      executedAt: nowIso()
    };
  }

  if (!hasTwilioDeliveryConfig()) {
    return {
      provider: "twilio_placeholder",
      status: "placeholder",
      errorMessage: "Twilio credentials are not configured for live SMS delivery yet.",
      executedAt: nowIso()
    };
  }

  const payload = new URLSearchParams();
  payload.set("To", destination);
  payload.set("Body", buildTextBody(notification, delivery));
  if (runtimeConfig.twilioMessagingServiceSid) {
    payload.set("MessagingServiceSid", runtimeConfig.twilioMessagingServiceSid);
  } else {
    payload.set("From", runtimeConfig.twilioFromNumber);
  }

  const credentials = Buffer.from(`${runtimeConfig.twilioAccountSid}:${runtimeConfig.twilioAuthToken}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${runtimeConfig.twilioAccountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString()
  });

  const body = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    return {
      provider: "twilio",
      status: "failed",
      errorMessage: (body.message as string | undefined) ?? `SMS delivery failed with status ${response.status}.`,
      providerStatusCode: response.status,
      nextRetryAt: plusMinutes(10),
      executedAt: nowIso()
    };
  }

  return {
    provider: "twilio",
    status: "delivered",
    providerStatusCode: response.status,
    providerMessageId: (body.sid as string | undefined) ?? undefined,
    executedAt: nowIso(),
    metadata: {
      sender: getTwilioSender() ?? ""
    }
  };
}

function createVapidJwt(endpoint: string) {
  const endpointOrigin = new URL(endpoint).origin;
  const publicKeyBytes = decodeBase64Url(runtimeConfig.webPushPublicKey);
  const privateKeyBytes = decodeBase64Url(runtimeConfig.webPushPrivateKey);
  if (publicKeyBytes.length < 65 || privateKeyBytes.length === 0) {
    throw new Error("Web push VAPID keys are not valid.");
  }

  const x = base64Url(publicKeyBytes.subarray(1, 33));
  const y = base64Url(publicKeyBytes.subarray(33, 65));
  const d = base64Url(privateKeyBytes);
  const privateKey = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x,
      y,
      d
    },
    format: "jwk"
  });

  const header = base64Url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = base64Url(JSON.stringify({
    aud: endpointOrigin,
    exp: Math.floor(Date.now() / 1000) + 60 * 10,
    sub: runtimeConfig.webPushSubject
  }));
  const unsignedToken = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(unsignedToken), {
    key: privateKey,
    dsaEncoding: "ieee-p1363"
  });

  return {
    token: `${unsignedToken}.${base64Url(signature)}`,
    publicKey: runtimeConfig.webPushPublicKey
  };
}

async function executeWebPushDelivery(notification: EngagementNotificationRecord, delivery: NotificationDeliveryRecord, attempt: NotificationDeliveryAttemptRecord): Promise<DeliveryExecutionResult> {
  if (attempt.provider === "web_push_placeholder" || attempt.destination.includes("push.placeholder")) {
    return {
      provider: "web_push_placeholder",
      status: "placeholder",
      errorMessage: "A real web-push subscription endpoint is not available for this device yet.",
      executedAt: nowIso()
    };
  }

  if (!hasWebPushExecutionConfig()) {
    return {
      provider: "web_push_placeholder",
      status: "placeholder",
      errorMessage: "Web push credentials are not configured for live delivery yet.",
      executedAt: nowIso()
    };
  }

  const vapid = createVapidJwt(attempt.destination);
  const response = await fetch(attempt.destination, {
    method: "POST",
    headers: {
      TTL: "60",
      Urgency: "high",
      Topic: notification.type.slice(0, 32),
      Authorization: `vapid t=${vapid.token}, k=${vapid.publicKey}`,
      "Crypto-Key": `p256ecdsa=${vapid.publicKey}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    return {
      provider: "web_push",
      status: "failed",
      errorMessage: errorText || `Push delivery failed with status ${response.status}.`,
      providerStatusCode: response.status,
      nextRetryAt: plusMinutes(5),
      executedAt: nowIso(),
      metadata: {
        payloadMode: "empty_push"
      }
    };
  }

  return {
    provider: "web_push",
    status: "delivered",
    providerStatusCode: response.status,
    providerMessageId: response.headers.get("location") ?? undefined,
    executedAt: nowIso(),
    metadata: {
      payloadMode: "empty_push"
    }
  };
}

function executeNativePushPlaceholder(provider: PushProviderKind): DeliveryExecutionResult {
  const bridgeReady = provider === "apns" ? hasNativeApnsBridgeConfig() : provider === "fcm" ? hasNativeFcmBridgeConfig() : false;
  return {
    provider: bridgeReady ? provider : "native_bridge_placeholder",
    status: bridgeReady ? "queued" : "placeholder",
    errorMessage: bridgeReady
      ? "Native push bridge configuration is present. Token delivery execution will complete once the wrapped app reports native tokens."
      : "Native push bridge configuration is not complete yet.",
    executedAt: nowIso(),
    metadata: {
      bridgeProvider: provider
    }
  };
}

export async function executeNotificationAttempt(args: {
  notification: EngagementNotificationRecord;
  delivery: NotificationDeliveryRecord;
  attempt: NotificationDeliveryAttemptRecord;
}): Promise<DeliveryExecutionResult> {
  const { notification, delivery, attempt } = args;

  if (notification.status === "scheduled" && notification.scheduledFor && notification.scheduledFor > nowIso()) {
    return {
      provider: attempt.provider,
      status: "queued",
      nextRetryAt: notification.scheduledFor,
      executedAt: nowIso(),
      metadata: {
        scheduledFor: notification.scheduledFor
      }
    };
  }

  if (attempt.channel === "in_app") {
    return {
      provider: "in_app",
      status: "delivered",
      executedAt: nowIso()
    };
  }

  if (attempt.channel === "email") {
    return executeEmailDelivery(notification, delivery);
  }

  if (attempt.channel === "sms") {
    return executeSmsDelivery(notification, delivery);
  }

  if (attempt.provider === "apns" || attempt.provider === "fcm" || attempt.provider === "native_bridge_placeholder") {
    return executeNativePushPlaceholder(attempt.provider as PushProviderKind);
  }

  return executeWebPushDelivery(notification, delivery, attempt);
}
