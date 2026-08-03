import { billingErrorResponse, billingJson, requireBillingSession } from "@/app/api/billing/_shared";
import { restorePr34CanceledSubscription } from "@/lib/billing/pr34-service";

export async function POST(request: Request) {
  try {
    const user = await requireBillingSession();
    const result = await restorePr34CanceledSubscription({
      user,
      idempotencyKey: request.headers.get("idempotency-key")
    });
    return billingJson({ ok: true, result });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
