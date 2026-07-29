import { NextResponse } from "next/server";
import { z } from "zod";
import {
  checkInKioskAppointment,
  ClientBridgeServiceError
} from "@/lib/clientbridge/service";
import { assertKioskLaunchReady } from "@/lib/kiosk/launch-gate";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";
import {
  assertKioskDeviceSession,
  KioskSessionError,
  readKioskSessionToken
} from "@/lib/kiosk/session-service";

const checkInSchema = z.object({
  appointmentId: z.string().uuid(),
  sourceProvider: z.enum(["bvrb3r", "booksy", "square", "thecut"]),
  idempotencyKey: z.string().trim().min(8).max(200),
  operationalSmsConsent: z.boolean(),
  contactPhone: z.string().trim().min(7).max(40).optional(),
  contactEmail: z.string().trim().email().optional()
});

function errorResponse(error: unknown) {
  if (error instanceof ClientBridgeServiceError || error instanceof KioskSessionError) {
    return NextResponse.json({ error: error.message, code: "check_in_failed" }, { status: error.status });
  }
  return NextResponse.json(
    { error: "Check-in failed. The appointment and queue are unchanged.", code: "check_in_failed" },
    { status: 500 }
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ shopId: string }> }
) {
  try {
    const rate = consumeRateLimit({
      bucket: "kiosk-appointment-check-in",
      key: clientKeyFromRequest(request),
      limit: 8,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many check-in attempts. Ask the front desk for help." },
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
    const parsed = checkInSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "A verified appointment and visit-text choice are required." }, { status: 400 });
    }
    const result = await checkInKioskAppointment({ shopId, ...parsed.data });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

