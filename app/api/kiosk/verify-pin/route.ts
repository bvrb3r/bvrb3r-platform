import { NextResponse } from "next/server";
import { z } from "zod";
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

    const result = await verifyKioskPin(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
