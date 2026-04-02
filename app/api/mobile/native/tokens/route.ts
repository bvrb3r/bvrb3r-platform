import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMobileActor } from "@/lib/mobile/auth";
import { getMobileProvider } from "@/lib/mobile/provider";

const roleSafeRoles = ["owner", "manager", "front_desk", "commission_barber", "booth_rent_barber", "client"] as const;

const nativeTokenSchema = z.object({
  deviceId: z.string().min(1),
  provider: z.enum(["apns", "fcm"]),
  token: z.string().min(12),
  status: z.enum(["pending", "active", "rotated", "revoked", "stale"]).optional(),
  environment: z.enum(["development", "staging", "production", "unknown"]).optional(),
  bundleOrPackageId: z.string().optional(),
  appVersion: z.string().optional(),
  runtimeMode: z.enum(["native_wrap_ready", "native_ios", "native_android"]).optional()
});

function mobileErrorResponse(error: unknown) {
  const status = typeof error === "object" && error && "status" in error && typeof (error as { status?: number }).status === "number"
    ? (error as { status: number }).status
    : 500;
  const message = error instanceof Error
    ? error.message
    : "Something went wrong while processing this native push action.";
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
    const [tokens, summary] = await Promise.all([
      provider.readNativeTokens(),
      provider.getSummary(actor)
    ]);

    return NextResponse.json({
      summary,
      tokens: tokens
        .filter((token) => token.userEmail === actor.userEmail)
        .map(serializeNativeToken)
    });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireMobileActor([...roleSafeRoles]);
    const payload = nativeTokenSchema.parse(await request.json());
    const provider = await getMobileProvider();
    const result = await provider.registerNativePushToken(actor, payload);

    return NextResponse.json({
      summary: result.summary,
      token: serializeNativeToken(result.token)
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid native token payload." }, { status: 400 });
    }

    return mobileErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireMobileActor([...roleSafeRoles]);
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId");
    const providerParam = searchParams.get("provider");

    if (!deviceId || !providerParam) {
      return NextResponse.json({ error: "A device id and provider are required to revoke a native token." }, { status: 400 });
    }

    const parsedProvider = z.enum(["apns", "fcm"]).safeParse(providerParam);
    if (!parsedProvider.success) {
      return NextResponse.json({ error: "Invalid native push provider." }, { status: 400 });
    }

    const provider = await getMobileProvider();
    const result = await provider.revokeNativePushToken(actor, {
      deviceId,
      provider: parsedProvider.data
    });
    return NextResponse.json({ summary: result.summary });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
