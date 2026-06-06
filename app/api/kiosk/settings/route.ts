import { NextResponse } from "next/server";
import { z } from "zod";
import { getKioskSettingsStatus, saveKioskPin, KioskSettingsError } from "@/lib/kiosk/settings-service";

const saveKioskPinSchema = z.object({
  scope: z.enum(["barber", "shop"]),
  targetReference: z.string().trim().min(1),
  pin: z.string().trim().regex(/^\d{4}$/)
});

function toErrorResponse(error: unknown) {
  if (error instanceof KioskSettingsError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }

  return NextResponse.json({ error: "Unable to save kiosk settings.", code: "kiosk_settings_failed" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = saveKioskPinSchema.omit({ pin: true }).safeParse({
      scope: url.searchParams.get("scope"),
      targetReference: url.searchParams.get("targetReference")
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid kiosk settings payload.", code: "invalid_payload" }, { status: 400 });
    }

    const result = await getKioskSettingsStatus(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = saveKioskPinSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid kiosk settings payload.", code: "invalid_payload" }, { status: 400 });
    }

    const result = await saveKioskPin(parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
