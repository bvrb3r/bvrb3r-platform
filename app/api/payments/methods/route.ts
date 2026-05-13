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
  nickname: z.string().trim().max(80).optional(),
  isDefault: z.boolean().optional()
});

function toErrorResponse(error: unknown) {
  if (error instanceof PaymentServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : "Unable to complete the payment method request.";
  return NextResponse.json({ error: message }, { status: 500 });
}

function logPaymentMethodSave(stage: string, details: Record<string, unknown>) {
  console.log("[payments] payment_method_save", {
    reference: "payment_method_save",
    stage,
    ...details
  });
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
    const payload = await request.json().catch(() => null);
    const parsed = createPaymentMethodSchema.safeParse(payload);
    if (!parsed.success) {
      logPaymentMethodSave("payload_invalid", {
        authenticatedUserPresent: Boolean(user.id),
        providerPaymentMethodIdPresent: Boolean((payload as { providerPaymentMethodId?: unknown } | null)?.providerPaymentMethodId),
        providerCustomerIdPresent: Boolean((payload as { providerCustomerId?: unknown } | null)?.providerCustomerId),
        nicknamePresent: Boolean((payload as { nickname?: unknown } | null)?.nickname),
        isDefault: Boolean((payload as { isDefault?: unknown } | null)?.isDefault)
      });
      return NextResponse.json({ error: "Invalid payment method payload." }, { status: 400 });
    }

    logPaymentMethodSave("request_valid", {
      authenticatedUserPresent: Boolean(user.id),
      userId: user.id,
      role: user.role,
      provider: parsed.data.provider,
      providerPaymentMethodIdPresent: Boolean(parsed.data.providerPaymentMethodId),
      providerCustomerIdPresent: Boolean(parsed.data.providerCustomerId),
      nicknamePresent: Boolean(parsed.data.nickname),
      isDefault: Boolean(parsed.data.isDefault)
    });
    const method = await addClientPaymentMethod(user, parsed.data);
    logPaymentMethodSave("request_success", {
      userId: user.id,
      methodId: method.id,
      isDefault: method.isDefault,
      brandPresent: Boolean(method.brand),
      last4Present: Boolean(method.last4),
      nicknamePresent: Boolean(method.nickname)
    });
    return NextResponse.json({ method }, { status: 200 });
  } catch (error) {
    console.error("[payments] payment_method_save_failed", {
      reference: "payment_method_save_failed",
      message: error instanceof Error ? error.message : "Unknown payment method save failure"
    });
    return toErrorResponse(error);
  }
}
