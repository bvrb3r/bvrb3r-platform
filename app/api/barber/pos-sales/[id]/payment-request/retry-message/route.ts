import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import {
  BarberPosSaleError,
  retryBarberPosSalePaymentRequestMessage,
  serializeBarberPosSaleError
} from "@/lib/barber/pos-sales";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const user = await getSessionUser();
    const payload = await retryBarberPosSalePaymentRequestMessage(user, id);
    return NextResponse.json(payload, { status: payload.ok === false ? 502 : 200 });
  } catch (error) {
    if (error instanceof BarberPosSaleError) {
      return NextResponse.json(serializeBarberPosSaleError(error), { status: error.status });
    }

    return NextResponse.json({ ok: false, error: "Unable to retry this POS payment request message." }, { status: 500 });
  }
}
