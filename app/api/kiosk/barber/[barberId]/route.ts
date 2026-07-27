import { NextResponse } from "next/server";
import { assertKioskLaunchReady } from "@/lib/kiosk/launch-gate";
import { getKioskFixturePayload, isKioskFixtureTarget } from "@/lib/kiosk/local-fixture";
import { getBarberKioskPayload, KioskServiceError } from "@/lib/kiosk/service";

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof KioskServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}

export async function GET(_: Request, { params }: { params: Promise<{ barberId: string }> }) {
  try {
    const { barberId } = await params;
    if (isKioskFixtureTarget("barber", barberId)) {
      return NextResponse.json(getKioskFixturePayload("barber", barberId));
    }

    await assertKioskLaunchReady("barber", barberId);
    const payload = await getBarberKioskPayload(barberId);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to load the barber kiosk.");
  }
}
