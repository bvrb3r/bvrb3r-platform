import { billingErrorResponse, billingJson, requireBillingSession } from "@/app/api/billing/_shared";
import { createPr34BalancePayment } from "@/lib/billing/pr34-service";

export async function POST(request: Request) {
  try {
    const user = await requireBillingSession();
    const payment = await createPr34BalancePayment({
      user,
      idempotencyKey: request.headers.get("idempotency-key")
    });
    return billingJson({ ok: true, payment });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
