import { NextResponse } from "next/server";
import { z } from "zod";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";
import {
  KIOSK_SESSION_COOKIE,
  KIOSK_SESSION_MAX_AGE_SECONDS,
  KioskSessionError,
  completeKioskDeviceSession,
  readKioskSessionToken,
  startKioskDeviceSession
} from "@/lib/kiosk/session-service";

const startKioskSessionSchema = z.object({
  scope: z.enum(["barber", "shop"]),
  targetReference: z.string().trim().min(1),
  deviceLabel: z.string().trim().max(120).optional()
});

export async function POST(request: Request) {
  try {
    const rate = consumeRateLimit({
      bucket: "kiosk-session-start",
      key: clientKeyFromRequest(request),
      limit: 10,
      windowMs: 60_000
    });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many kiosk session attempts. Try again shortly.", code: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const parsed = startKioskSessionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid kiosk session payload.", code: "invalid_payload" }, { status: 400 });
    }

    const session = await startKioskDeviceSession(parsed.data);
    const response = NextResponse.json({
      ok: true,
      scope: session.scope,
      targetReference: session.targetReference,
      expiresAt: session.expiresAt
    }, { status: 201 });
    response.cookies.set(KIOSK_SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: KIOSK_SESSION_MAX_AGE_SECONDS
    });
    return response;
  } catch (error) {
    if (error instanceof KioskSessionError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    return NextResponse.json({ error: "Unable to start the kiosk session.", code: "session_start_failed" }, { status: 500 });
  }
}

/**
 * Ends the device session from the device itself (owner "Deactivate here" and
 * any other local teardown). Clearing local state alone would leave a valid
 * server session and cookie behind for the rest of its 12-hour window.
 */
export async function DELETE(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(KIOSK_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  try {
    await completeKioskDeviceSession(readKioskSessionToken(request));
  } catch {
    // The cookie is already cleared, so the device is locked out regardless.
  }

  return response;
}
