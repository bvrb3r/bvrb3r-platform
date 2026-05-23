import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { BarberPosSaleError, createBarberPosSaleInvoice } from "@/lib/barber/pos-sales";

const invoiceSchema = z.object({
  customerPhone: z.string().max(32).optional().nullable(),
  customerEmail: z.string().email().optional().nullable()
}).refine((value) => Boolean(value.customerPhone?.trim() || value.customerEmail?.trim()), {
  message: "Add a phone or email before sending a payment link."
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = invoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Add a phone or email before sending a payment link." }, { status: 400 });
  }

  try {
    const user = await getSessionUser();
    const payload = await createBarberPosSaleInvoice(user, id, parsed.data);
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof BarberPosSaleError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    return NextResponse.json({ ok: false, error: "Unable to create this payment link." }, { status: 500 });
  }
}
