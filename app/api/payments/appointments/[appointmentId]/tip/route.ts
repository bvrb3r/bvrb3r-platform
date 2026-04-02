import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { createAppointmentTip, PaymentServiceError } from "@/lib/payments/service";

const tipSchema = z.object({
  amount: z.number().positive(),
  paymentId: z.string().uuid().optional()
});

function toErrorResponse(error: unknown) {
  if (error instanceof PaymentServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to record the appointment tip.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const user = await getSessionUser();
    const parsed = tipSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid tip payload." }, { status: 400 });
    }

    const { appointmentId } = await params;
    const payload = await createAppointmentTip(user, {
      appointmentId,
      amount: parsed.data.amount,
      paymentId: parsed.data.paymentId
    });
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
