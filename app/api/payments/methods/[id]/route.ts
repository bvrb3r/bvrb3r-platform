import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { PaymentServiceError, removeClientPaymentMethod, renameClientPaymentMethod } from "@/lib/payments/service";

const renamePaymentMethodSchema = z.object({
  nickname: z.string().trim().min(1).max(80)
});

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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    const parsed = renamePaymentMethodSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid card name." }, { status: 400 });
    }

    const { id } = await params;
    const method = await renameClientPaymentMethod(user, id, parsed.data.nickname);
    return NextResponse.json({ method });
  } catch (error) {
    return toErrorResponse(error);
  }
}
