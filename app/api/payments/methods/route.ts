import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/booking/route-auth";
import { addClientPaymentMethod, listClientPaymentMethods, PaymentServiceError } from "@/lib/payments/service";

const createPaymentMethodSchema = z.object({
  provider: z.literal("stripe"),
  providerCustomerId: z.string().trim().optional(),
  providerPaymentMethodId: z.string().trim().min(1),
  brand: z.string().trim().optional(),
  last4: z.string().trim().optional(),
  expMonth: z.number().int().min(1).max(12).optional(),
  expYear: z.number().int().min(2024).optional(),
  isDefault: z.boolean().optional()
});

function toErrorResponse(error: unknown) {
  if (error instanceof PaymentServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to complete the payment method request.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const user = await getSessionUser();
    const methods = await listClientPaymentMethods(user);
    return NextResponse.json({ methods });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const parsed = createPaymentMethodSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payment method payload." }, { status: 400 });
    }

    const method = await addClientPaymentMethod(user, parsed.data);
    return NextResponse.json({ method }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
