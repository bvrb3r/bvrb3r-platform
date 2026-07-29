import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ClientBridgeServiceError,
  issueClientBridgeInvitation
} from "@/lib/clientbridge/service";
import { assertKioskLaunchReady } from "@/lib/kiosk/launch-gate";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";
import {
  assertKioskDeviceSession,
  KioskSessionError,
  readKioskSessionToken
} from "@/lib/kiosk/session-service";

const invitationSchema = z.object({
  waitlistEntryId: z.string().uuid(),
  contactChannel: z.enum(["sms", "email"]),
  contactValue: z.string().trim().min(5).max(320),
  consentGranted: z.literal(true)
});

function errorResponse(error: unknown) {
  if (error instanceof ClientBridgeServiceError || error instanceof KioskSessionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "Unable to queue the optional ClientBridge invitation." }, { status: 500 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ shopId: string }> }
) {
  try {
    const rate = consumeRateLimit({
      bucket: "kiosk-clientbridge",
      key: clientKeyFromRequest(request),
      limit: 4,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "ClientBridge is temporarily rate limited. The guest check-in remains complete." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }
    const { shopId } = await context.params;
    await assertKioskLaunchReady("shop", shopId);
    await assertKioskDeviceSession({
      scope: "shop",
      targetReference: shopId,
      token: readKioskSessionToken(request)
    });
    const parsed = invitationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "An explicit join choice and verified contact are required." }, { status: 400 });
    }
    return NextResponse.json(await issueClientBridgeInvitation({
      shopId,
      ...parsed.data
    }), { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
