import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { PaymentServiceError, removeClientPaymentMethod } from "@/lib/payments/service";

function toErrorResponse(error: unknown) {
  if (error instanceof PaymentServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to remove the payment method.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    const { id } = await params;
    return NextResponse.json(await removeClientPaymentMethod(user, id));
  } catch (error) {
    return toErrorResponse(error);
  }
}
