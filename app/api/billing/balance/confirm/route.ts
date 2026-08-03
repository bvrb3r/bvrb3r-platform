import { billingErrorResponse, billingJson, requireBillingSession } from "@/app/api/billing/_shared";
import { confirmPr34BalancePayment } from "@/lib/billing/pr34-service";

export async function POST(request: Request) {
  try {
    const user = await requireBillingSession();
    const body = await request.json().catch(() => ({})) as { attemptId?: unknown };
    const result = await confirmPr34BalancePayment({ user, attemptId: body.attemptId });
    return billingJson({ ok: true, result });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
