import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberPosSaleError, chargeBarberPosSale } from "@/lib/barber/pos-sales";

const chargeSchema = z.object({
  paymentMethod: z.enum(["tap_to_pay", "card_on_file", "test"]).optional().nullable()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = chargeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid POS charge payload." }, { status: 400 });
  }

  try {
    const user = await getSessionUser();
    const payload = await chargeBarberPosSale(user, id, parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof BarberPosSaleError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    return NextResponse.json({ ok: false, error: "Unable to charge this POS sale." }, { status: 500 });
  }
}
