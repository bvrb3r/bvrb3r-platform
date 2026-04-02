import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { queueBarberOpenSlotNotifications } from "@/lib/engagement/availability";

const bodySchema = z.object({
  startsAt: z.string().datetime(),
  locationId: z.string().min(1).optional().nullable(),
  locationLabel: z.string().min(1).optional().nullable()
});

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid open-slot notification payload." }, { status: 400 });
  }

  const user = await getSessionUser();
  if (!(user.role === "owner" || user.role === "manager" || user.role === "commission_barber" || user.role === "booth_rent_barber") || !user.barberId) {
    return NextResponse.json({ error: "You do not have access to notify clients about barber availability." }, { status: 403 });
  }

  const result = await queueBarberOpenSlotNotifications({
    barberId: user.barberId,
    barberName: user.name,
    startsAt: parsed.data.startsAt,
    locationId: parsed.data.locationId,
    locationLabel: parsed.data.locationLabel
  });

  return NextResponse.json(result);
}
