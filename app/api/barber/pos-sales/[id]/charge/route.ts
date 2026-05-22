import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberPosSaleError, chargeBarberPosSale } from "@/lib/barber/pos-sales";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const user = await getSessionUser();
    const payload = await chargeBarberPosSale(user, id);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof BarberPosSaleError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    return NextResponse.json({ ok: false, error: "Unable to charge this POS sale." }, { status: 500 });
  }
}

