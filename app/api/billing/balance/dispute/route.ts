import { billingErrorResponse, billingJson, requireBillingSession } from "@/app/api/billing/_shared";
import { Pr34BillingServiceError } from "@/lib/billing/pr34-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const user = await requireBillingSession();
    const body = await request.json().catch(() => ({})) as { lineId?: unknown; reason?: unknown };
    if (typeof body.lineId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.lineId)) {
      throw new Pr34BillingServiceError("Choose a valid balance line to dispute.", 400, "invalid_balance_line");
    }
    if (typeof body.reason !== "string" || body.reason.trim().length < 10 || body.reason.trim().length > 1000) {
      throw new Pr34BillingServiceError("Explain the dispute in 10 to 1000 characters.", 400, "invalid_dispute_reason");
    }
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      throw new Pr34BillingServiceError("Account dispute service is not configured.", 503, "dispute_persistence_missing");
    }
    const result = await supabase.rpc("pr34_dispute_balance_line", {
      p_line_id: body.lineId,
      p_reason: body.reason.trim(),
      p_profile_id: user.id
    });
    if (result.error) {
      throw new Pr34BillingServiceError("That balance line could not be disputed.", 409, "balance_dispute_failed");
    }
    return billingJson({ ok: true, dispute: result.data });
  } catch (error) {
    return billingErrorResponse(error);
  }
}
