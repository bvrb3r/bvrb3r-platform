import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ClientBridgeServiceError,
  searchKioskAppointments
} from "@/lib/clientbridge/service";
import { assertKioskLaunchReady } from "@/lib/kiosk/launch-gate";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";
import {
  assertKioskDeviceSession,
  KioskSessionError,
  readKioskSessionToken
} from "@/lib/kiosk/session-service";

const lookupSchema = z.object({
  kind: z.enum(["phone", "email", "name_time", "code", "qr"]),
  value: z.string().trim().min(2).max(200),
  appointmentTime: z.string().datetime().optional()
}).superRefine((value, context) => {
  if (value.kind === "name_time" && !value.appointmentTime) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["appointmentTime"],
      message: "Name lookup requires an appointment time."
    });
  }
});

function errorResponse(error: unknown) {
  if (error instanceof ClientBridgeServiceError || error instanceof KioskSessionError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "Unable to search appointments." }, { status: 500 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ shopId: string }> }
) {
  try {
    const rate = consumeRateLimit({
      bucket: "kiosk-appointment-search",
      key: clientKeyFromRequest(request),
      limit: 12,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many appointment searches. Try again shortly." },
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
    const parsed = lookupSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Search by verified phone/email, confirmation code, QR, or name plus appointment time." },
        { status: 400 }
      );
    }
    return NextResponse.json(await searchKioskAppointments({ shopId, ...parsed.data }));
  } catch (error) {
    return errorResponse(error);
  }
}

