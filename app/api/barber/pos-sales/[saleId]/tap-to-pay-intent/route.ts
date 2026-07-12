import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberTerminalError, createTapToPayIntent } from "@/lib/barber/stripe-terminal";

const saleIdSchema = z.string().uuid();

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ saleId: string }> }
) {
  const { saleId } = await context.params;
  const parsed = saleIdSchema.safeParse(saleId);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid POS sale.", code: "invalid_pos_sale_id" }, { status: 400 });
  }

  try {
    const user = await getSessionUser();
    return NextResponse.json(await createTapToPayIntent(user, parsed.data));
  } catch (error) {
    if (error instanceof BarberTerminalError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ ok: false, error: "Unable to create the Tap to Pay charge.", code: "tap_to_pay_intent_failed" }, { status: 500 });
  }
}