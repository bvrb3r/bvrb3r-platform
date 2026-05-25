import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  BarberPosSaleError,
  declineClientPosPaymentRequest,
  serializeBarberPosSaleError
} from "@/lib/barber/pos-sales";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const user = await getSessionUser();
    const payload = await declineClientPosPaymentRequest(user, id);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof BarberPosSaleError) {
      return NextResponse.json(serializeBarberPosSaleError(error), { status: error.status });
    }

    return NextResponse.json({ ok: false, error: "Unable to decline this payment request." }, { status: 500 });
  }
}
