import { NextResponse } from "next/server";
import { z } from "zod";
import { isKioskFixtureTarget, verifyKioskFixturePin } from "@/lib/kiosk/local-fixture";
import { KIOSK_SESSION_COOKIE, completeKioskDeviceSession, readKioskSessionToken } from "@/lib/kiosk/session-service";
import { verifyKioskPin, KioskSettingsError } from "@/lib/kiosk/settings-service";

const verifyKioskPinSchema = z.object({
  scope: z.enum(["barber", "shop"]),
  targetReference: z.string().trim().min(1),
  pin: z.string().trim().regex(/^\d{4}$/)
});

function toErrorResponse(error: unknown) {
  if (error instanceof KioskSettingsError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }

  return NextResponse.json({ error: "Unable to verify kiosk PIN.", code: "kiosk_pin_verify_failed" }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const parsed = verifyKioskPinSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid kiosk PIN payload.", code: "invalid_payload" }, { status: 400 });
    }

    // The seeded local fixture carries its own PIN so the staff exit is
    // reachable without a kiosk_settings row.
    if (isKioskFixtureTarget(parsed.data.scope, parsed.data.targetReference)) {
      if (!verifyKioskFixturePin(parsed.data.pin)) {
        return NextResponse.json({ error: "That kiosk PIN is incorrect.", code: "kiosk_pin_invalid" }, { status: 401 });
      }
      return NextResponse.json({ ok: true });
    }

    const result = await verifyKioskPin(parsed.data);

    // A successful exit PIN ends the device session so the kiosk cannot keep
    // mutating after staff leave the device.
    await completeKioskDeviceSession(readKioskSessionToken(request)).catch(() => undefined);
    const response = NextResponse.json(result);
    response.cookies.set(KIOSK_SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
