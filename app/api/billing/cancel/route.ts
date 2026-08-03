import { billingErrorResponse, billingJson, requireBillingSession } from "@/app/api/billing/_shared";
import { cancelPr34Subscription } from "@/lib/billing/pr34-service";

export async function POST(request: Request) {
  try {
    const user = await requireBillingSession();
    const result = await cancelPr34Subscription({
      user,
      idempotencyKey: request.headers.get("idempotency-key")
    });
    return billingJson({ ok: true, result });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
