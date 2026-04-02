import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/booking/route-auth";
import { PaymentServiceError, setDefaultClientPaymentMethod } from "@/lib/payments/service";

function toErrorResponse(error: unknown) {
  if (error instanceof PaymentServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to set the default payment method.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    const { id } = await params;
    const method = await setDefaultClientPaymentMethod(user, id);
    return NextResponse.json({ method });
  } catch (error) {
    return toErrorResponse(error);
  }
}
