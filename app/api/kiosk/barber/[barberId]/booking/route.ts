import { NextResponse } from "next/server";
import { z } from "zod";
import { createBarberKioskBooking, KioskServiceError } from "@/lib/kiosk/service";

const barberKioskBookingSchema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().min(7),
  email: z.string().trim().email().optional().or(z.literal("")),
  publicUsername: z.string().trim().optional(),
  selectedProfileId: z.string().trim().optional(),
  serviceId: z.string().trim().min(1),
  kioskAction: z.enum(["book_next_opening", "schedule_ahead"]).optional(),
  scheduledAt: z.string().trim().optional()
});

function toErrorResponse(error: unknown, fallback: string) {
  if (error instanceof KioskServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ barberId: string }> }) {
  try {
    const { barberId } = await params;
    const parsed = barberKioskBookingSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid barber kiosk booking payload." }, { status: 400 });
    }

    const result = await createBarberKioskBooking({
      barberId,
      ...parsed.data,
      email: parsed.data.email || undefined
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "Unable to create the barber kiosk booking.");
  }
}
