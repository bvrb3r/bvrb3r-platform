import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberPosSaleError, createBarberPosSale, listBarberPosSales } from "@/lib/barber/pos-sales";

const saleSchema = z.object({
  amountCents: z.coerce.number().int().positive(),
  subtotalCents: z.coerce.number().int().positive().optional().nullable(),
  tipCents: z.coerce.number().int().nonnegative().optional().nullable(),
  discountCents: z.coerce.number().int().nonnegative().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  clientId: z.string().min(1).max(120).optional().nullable(),
  customerName: z.string().max(120).optional().nullable(),
  customerPhone: z.string().max(32).optional().nullable(),
  customerEmail: z.string().email().optional().nullable(),
  paymentMethod: z.enum(["tap_to_pay", "card_on_file", "cash", "invoice", "test"]).optional().nullable(),
  items: z.array(z.object({
    itemType: z.enum(["custom_amount", "service", "product", "tip", "discount"]).optional(),
    serviceId: z.string().uuid().optional().nullable(),
    name: z.string().max(120).optional().nullable(),
    quantity: z.coerce.number().int().positive().optional().nullable(),
    unitAmountCents: z.coerce.number().int().nonnegative().optional().nullable()
  })).optional().nullable()
});

export async function GET() {
  try {
    const user = await getSessionUser();
    const payload = await listBarberPosSales(user);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof BarberPosSaleError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    return NextResponse.json({ ok: false, error: "Unable to load POS sales." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = saleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid POS sale payload." }, { status: 400 });
  }

  try {
    const user = await getSessionUser();
    const payload = await createBarberPosSale(user, parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof BarberPosSaleError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    return NextResponse.json({ ok: false, error: "Unable to create this POS sale." }, { status: 500 });
  }
}
