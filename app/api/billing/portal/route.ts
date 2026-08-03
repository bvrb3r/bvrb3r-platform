import { billingErrorResponse, billingJson, requireBillingSession } from "@/app/api/billing/_shared";
import { createPr34PortalSession } from "@/lib/billing/pr34-service";

export async function POST() {
  try {
    const user = await requireBillingSession();
    const result = await createPr34PortalSession({ user });
    return billingJson({ ok: true, result });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
