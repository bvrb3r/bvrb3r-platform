import { NextResponse } from "next/server";
import { z } from "zod";
import { createKioskBooking, KioskServiceError } from "@/lib/kiosk/service";

const kioskBookingSchema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().min(7),
  email: z.string().trim().email().optional().or(z.literal("")),
  publicUsername: z.string().trim().optional(),
  selectedProfileId: z.string().trim().optional(),
  serviceId: z.string().trim().min(1),
  preferredBarberId: z.string().trim().optional(),
  kioskAction: z.enum(["book_next_opening", "schedule_ahead"]).optional(),
  scheduledAt: z.string().trim().optional()
});

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof KioskServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ shopId: string }> }) {
  try {
    const { shopId } = await params;
    const parsed = kioskBookingSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid kiosk booking payload." }, { status: 400 });
    }

    const result = await createKioskBooking({
      shopId,
      ...parsed.data,
      email: parsed.data.email || undefined
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Unable to create the kiosk booking.");
  }
}
