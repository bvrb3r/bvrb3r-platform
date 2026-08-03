import { billingErrorResponse, billingJson, requireBillingSession } from "@/app/api/billing/_shared";
import { changePr34Plan } from "@/lib/billing/pr34-service";

export async function POST(request: Request) {
  try {
    const user = await requireBillingSession();
    const body = await request.json().catch(() => ({})) as { targetTier?: unknown; billingInterval?: unknown };
    const result = await changePr34Plan({
      user,
      targetTier: body.targetTier,
      billingInterval: body.billingInterval,
      idempotencyKey: request.headers.get("idempotency-key")
    });
    return billingJson({ ok: true, result });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
