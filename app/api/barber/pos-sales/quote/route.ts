import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberPosSaleError, quoteBarberPosSaleForUser } from "@/lib/barber/pos-sales";

const quoteSchema = z.object({
  amountCents: z.coerce.number().int().positive(),
  tipCents: z.coerce.number().int().nonnegative().optional().nullable(),
  discountCents: z.coerce.number().int().nonnegative().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  customerName: z.string().max(120).optional().nullable(),
  items: z.array(z.object({
    itemType: z.enum(["custom_amount", "service", "product", "tip", "discount"]).optional(),
    serviceId: z.string().uuid().optional().nullable(),
    name: z.string().max(120).optional().nullable(),
    quantity: z.coerce.number().int().positive().optional().nullable(),
    unitAmountCents: z.coerce.number().int().nonnegative().optional().nullable()
  })).optional().nullable()
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = quoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid POS quote payload." }, { status: 400 });
  }

  try {
    const user = await getSessionUser();
    const quote = await quoteBarberPosSaleForUser(user, parsed.data);
    return NextResponse.json({ ok: true, quote });
  } catch (error) {
    if (error instanceof BarberPosSaleError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    return NextResponse.json({ ok: false, error: "Unable to quote this POS sale." }, { status: 500 });
  }
}

