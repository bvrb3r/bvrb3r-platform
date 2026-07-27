import { NextResponse } from "next/server";
import { z } from "zod";
import { assertKioskLaunchReady } from "@/lib/kiosk/launch-gate";
import { createKioskFixtureBooking, isKioskFixtureTarget } from "@/lib/kiosk/local-fixture";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";
import { createKioskBooking, KioskServiceError } from "@/lib/kiosk/service";
import { KioskSessionError, assertKioskDeviceSession, readKioskSessionToken } from "@/lib/kiosk/session-service";

const kioskBookingSchema = z.object({
  fullName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  publicUsername: z.string().trim().optional(),
  selectedProfileId: z.string().trim().optional(),
  serviceId: z.string().trim().min(1),
  preferredBarberId: z.string().trim().optional(),
  kioskAction: z.enum(["book_next_opening", "schedule_ahead"]).optional(),
  scheduledAt: z.string().trim().optional()
}).superRefine((payload, context) => {
  if (payload.selectedProfileId) {
    return;
  }

  if (!payload.publicUsername?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["publicUsername"], message: "Username is required." });
  }
  if (!payload.fullName?.trim() || payload.fullName.trim().length < 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["fullName"], message: "Full name is required." });
  }
  if (!payload.phone?.trim() || payload.phone.trim().length < 7) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Phone is required." });
  }
  if (!payload.email?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "Email is required." });
  }
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
    const rate = consumeRateLimit({ bucket: "kiosk-booking", key: clientKeyFromRequest(request), limit: 10, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Too many kiosk requests. Try again shortly." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    }

    const { shopId } = await params;
    // The seeded local fixture skips the owner-configured launch gate and the
    // device session because it has no Supabase row behind it. Validation still
    // runs, so local QA exercises the same request contract.
    const isFixture = isKioskFixtureTarget("shop", shopId);
    if (!isFixture) {
      await assertKioskLaunchReady("shop", shopId);
      await assertKioskDeviceSession({ scope: "shop", targetReference: shopId, token: readKioskSessionToken(request) });
    }

    const parsed = kioskBookingSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid kiosk booking payload." }, { status: 400 });
    }

    const input = { ...parsed.data, email: parsed.data.email || undefined };
    const result = isFixture
      ? createKioskFixtureBooking("shop", shopId, input)
      : await createKioskBooking({ shopId, ...input });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Unable to create the kiosk booking.");
  }
}
