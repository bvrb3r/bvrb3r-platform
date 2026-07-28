import { NextResponse } from "next/server";
import { assertKioskLaunchReady } from "@/lib/kiosk/launch-gate";
import { getKioskFixturePayload, isKioskFixtureTarget } from "@/lib/kiosk/local-fixture";
import { getKioskPayload, KioskServiceError } from "@/lib/kiosk/service";

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof KioskServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}

export async function GET(_: Request, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params;
    if (isKioskFixtureTarget("shop", shopId)) {
      return NextResponse.json(getKioskFixturePayload("shop", shopId));
    }

    await assertKioskLaunchReady("shop", shopId);
    const payload = await getKioskPayload(shopId);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to load the kiosk.");
  }
}
