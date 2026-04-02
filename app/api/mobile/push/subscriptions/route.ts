import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMobileActor } from "@/lib/mobile/auth";
import { getMobileProvider } from "@/lib/mobile/provider";

const roleSafeRoles = ["owner", "manager", "front_desk", "commission_barber", "booth_rent_barber", "client"] as const;

const syncSchema = z.object({
  deviceId: z.string().min(1),
  deviceLabel: z.string().optional(),
  platform: z.enum(["ios", "android", "windows", "macos", "linux", "unknown"]).optional(),
  runtimeMode: z.enum(["browser", "standalone", "native_wrap_ready", "native_ios", "native_android"]).optional(),
  userAgent: z.string().optional(),
  appBundleId: z.string().optional(),
  appVersion: z.string().optional(),
  capabilities: z.object({
    pushSupported: z.boolean(),
    shareSupported: z.boolean(),
    standaloneSupported: z.boolean(),
    serviceWorkerSupported: z.boolean(),
    notificationPermission: z.enum(["unsupported", "default", "granted", "denied"])
  }),
  subscription: z.object({
    endpoint: z.string().min(1),
    p256dhKey: z.string().optional(),
    authKey: z.string().optional(),
    expirationTime: z.string().optional(),
    provider: z.enum(["web_push", "web_push_placeholder", "apns", "fcm", "native_bridge_placeholder"]).optional(),
    nativeBridge: z.enum(["web_push", "apns", "fcm"]).optional(),
    appBundleId: z.string().optional(),
    appVersion: z.string().optional()
  }).optional()
});

function mobileErrorResponse(error: unknown) {
  const status = typeof error === "object" && error && "status" in error && typeof (error as { status?: number }).status === "number"
    ? (error as { status: number }).status
    : 500;
  const message = error instanceof Error
    ? error.message
    : "Something went wrong while processing this mobile activation action.";
  return NextResponse.json({ error: message }, { status });
}

function serializeNativeToken(token: {
  id: string;
  deviceId: string;
  provider: "apns" | "fcm";
  status: "pending" | "active" | "rotated" | "revoked" | "stale";
  environment: "development" | "staging" | "production" | "unknown";
  tokenPreview: string;
  bundleOrPackageId?: string;
  appVersion?: string;
  runtimeMode: "browser" | "standalone" | "native_wrap_ready" | "native_ios" | "native_android";
  lastRegisteredAt: string;
  lastRefreshedAt?: string;
}) {
  return {
    id: token.id,
    deviceId: token.deviceId,
    provider: token.provider,
    status: token.status,
    environment: token.environment,
    tokenPreview: token.tokenPreview,
    bundleOrPackageId: token.bundleOrPackageId ?? null,
    appVersion: token.appVersion ?? null,
    runtimeMode: token.runtimeMode,
    lastRegisteredAt: token.lastRegisteredAt,
    lastRefreshedAt: token.lastRefreshedAt ?? null
  };
}

export async function GET() {
  try {
    const actor = await requireMobileActor([...roleSafeRoles]);
    const provider = await getMobileProvider();
    const state = await provider.readState();
    const summary = await provider.getSummary(actor);
    const devices = state.devices
      .filter((device) => device.userEmail === actor.userEmail && device.status === "active")
      .map((device) => ({
        deviceId: device.deviceId,
        deviceLabel: device.deviceLabel,
        runtimeMode: device.runtimeMode,
        platform: device.platform,
        lastSeenAt: device.lastSeenAt
      }));
    const subscriptions = state.pushSubscriptions
      .filter((subscription) => subscription.userEmail === actor.userEmail)
      .map((subscription) => ({
        id: subscription.id,
        deviceId: subscription.deviceId,
        provider: subscription.provider,
        status: subscription.status,
        lastSeenAt: subscription.lastSeenAt,
        nativeBridge: subscription.nativeBridge ?? null,
        appBundleId: subscription.appBundleId ?? null
      }));
    const nativeTokens = state.nativePushTokens
      .filter((token) => token.userEmail === actor.userEmail)
      .map(serializeNativeToken);

    return NextResponse.json({ summary, devices, subscriptions, nativeTokens });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireMobileActor([...roleSafeRoles]);
    const payload = syncSchema.parse(await request.json());
    const provider = await getMobileProvider();
    const result = await provider.syncDeviceActivation(actor, payload);
    return NextResponse.json({ summary: result.summary, device: result.device, subscription: result.subscription ?? null });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid push subscription payload." }, { status: 400 });
    }

    return mobileErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireMobileActor([...roleSafeRoles]);
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId");
    if (!deviceId) {
      return NextResponse.json({ error: "A device id is required to revoke a push subscription." }, { status: 400 });
    }

    const provider = await getMobileProvider();
    const result = await provider.revokePushSubscription(actor, deviceId);
    return NextResponse.json({ summary: result.summary });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
