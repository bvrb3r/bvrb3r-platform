import { NextResponse } from "next/server";
import { runtimeConfig } from "@/lib/config/runtime";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberPosSaleError, chargeBarberPosSale } from "@/lib/barber/pos-sales";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (runtimeConfig.deliveryEnvironment === "production") {
    return NextResponse.json({ ok: false, error: "Test POS payment marking is not available in production." }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const user = await getSessionUser();
    const payload = await chargeBarberPosSale(user, id);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof BarberPosSaleError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    return NextResponse.json({ ok: false, error: "Unable to mark this POS sale paid." }, { status: 500 });
  }
}
