import { NextResponse } from "next/server";
import { z } from "zod";
import { assertKioskLaunchReady } from "@/lib/kiosk/launch-gate";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";
import { createKioskWaitlist, KioskServiceError } from "@/lib/kiosk/service";
import { KioskSessionError, assertKioskDeviceSession, readKioskSessionToken } from "@/lib/kiosk/session-service";

const kioskWaitlistSchema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().min(7),
  email: z.string().trim().email().optional().or(z.literal("")),
  serviceId: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
  operationalSmsConsent: z.boolean().optional()
});

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof KioskServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof KioskSessionError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }

  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const rate = consumeRateLimit({ bucket: "kiosk-waitlist", key: clientKeyFromRequest(request), limit: 10, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many kiosk requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    }

    const { shopId } = await params;
    await assertKioskLaunchReady("shop", shopId);
    await assertKioskDeviceSession({ scope: "shop", targetReference: shopId, token: readKioskSessionToken(request) });
    const parsed = kioskWaitlistSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid kiosk walk-in payload." }, { status: 400 });
    }

    const result = await createKioskWaitlist({
      shopId,
      ...parsed.data,
      email: parsed.data.email || undefined
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Unable to add the kiosk walk-in.");
  }
}
