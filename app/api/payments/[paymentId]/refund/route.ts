import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { PaymentServiceError, refundPayment } from "@/lib/payments/service";

const refundSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().trim().optional(),
  source: z.string().trim().optional(),
  confirmation: z.string().trim().optional(),
  incidentCode: z.string().trim().optional()
});

function toErrorResponse(error: unknown) {
  if (error instanceof PaymentServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to refund the payment.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const user = await getSessionUser();
    const parsed = refundSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid refund payload." }, { status: 400 });
    }

    const { paymentId } = await params;
    const payload = await refundPayment(user, {
      paymentId,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      source: parsed.data.source,
      confirmation: parsed.data.confirmation,
      incidentCode: parsed.data.incidentCode
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
