import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { capturePayment, PaymentServiceError } from "@/lib/payments/service";

function toErrorResponse(error: unknown) {
  if (error instanceof PaymentServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to capture the payment.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const user = await getSessionUser();
    const { paymentId } = await params;
    const payload = await capturePayment(user, paymentId);
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
