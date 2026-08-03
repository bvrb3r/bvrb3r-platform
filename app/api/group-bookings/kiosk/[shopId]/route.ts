import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertKioskLaunchReady } from "@/lib/kiosk/launch-gate";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";
import {
  assertKioskDeviceSession,
  KioskSessionError,
  readKioskSessionToken
} from "@/lib/kiosk/session-service";
import { kioskGroupRequestSchema } from "@/lib/group-booking/domain";
import { createKioskGroupRequest, GroupBookingServiceError } from "@/lib/group-booking/service";

export async function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  const rate = consumeRateLimit({
    bucket: "kiosk-group-request",
    key: clientKeyFromRequest(request),
    limit: 8,
    windowMs: 60_000
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many kiosk group requests. Try again shortly.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }

  try {
    const { shopId } = await params;
    await assertKioskLaunchReady("shop", shopId);
    await assertKioskDeviceSession({
      scope: "shop",
      targetReference: shopId,
      token: readKioskSessionToken(request)
    });
    const payload = kioskGroupRequestSchema.parse(await request.json().catch(() => null));
    const groupRequest = await createKioskGroupRequest({ shopReference: shopId, payload });
    return NextResponse.json({ groupRequest }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid kiosk group request." }, { status: 400 });
    }
    if (error instanceof KioskSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof GroupBookingServiceError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "The live floor could not record this group request." }, { status: 500 });
  }
}
