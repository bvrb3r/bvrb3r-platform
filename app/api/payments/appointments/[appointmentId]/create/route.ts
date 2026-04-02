import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { createAppointmentPayment, PaymentServiceError } from "@/lib/payments/service";

const createAppointmentPaymentSchema = z.object({
  paymentMethodId: z.string().uuid().optional(),
  provider: z.literal("stripe").optional()
});

function toErrorResponse(error: unknown) {
  if (error instanceof PaymentServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to create the appointment payment.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  try {
    const user = await getSessionUser();
    const parsed = createAppointmentPaymentSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid appointment payment payload." }, { status: 400 });
    }

    const { appointmentId } = await params;
    const payload = await createAppointmentPayment(user, {
      appointmentId,
      paymentMethodId: parsed.data.paymentMethodId,
      provider: parsed.data.provider
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
