import { NextResponse } from "next/server";
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
    const payload = await getKioskPayload(shopId);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to load the kiosk.");
  }
}
