import { billingErrorResponse, billingJson, requireBillingSession } from "@/app/api/billing/_shared";
import { readPr34BillingWorkspace } from "@/lib/billing/pr34-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireBillingSession();
    const billing = await readPr34BillingWorkspace({ user });
    return billingJson({ billing });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
