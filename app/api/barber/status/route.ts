import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberToolsServiceError, getBarberStatusPayload, updateBarberStatus } from "@/lib/barber/service";

const updateStatusSchema = z.object({
  liveStatus: z.enum(["offline", "available", "busy", "on_break", "away"]),
  isOnline: z.boolean().optional(),
  acceptsWalkIns: z.boolean().optional(),
  currentShopId: z.string().trim().optional().nullable()
});

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof BarberToolsServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const user = await getSessionUser();
    const payload = await getBarberStatusPayload(user);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to load barber status.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = updateStatusSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid barber status payload." }, { status: 400 });
    }

    const payload = await updateBarberStatus(user, parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error, "Unable to update barber status.");
  }
}
