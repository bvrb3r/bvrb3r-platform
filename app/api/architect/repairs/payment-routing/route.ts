import { NextResponse } from "next/server";
import { z } from "zod";
import { repairMissingPaymentRouting } from "@/lib/architect/repairs/payment-routing-repair";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const repairSchema = z.object({
  appointmentId: z.string().trim().min(1)
});

export async function POST(request: Request) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return access.response;

  const parsed = repairSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "appointmentId is required.", safeMessage: "Enter an appointment id.", stage: "input" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is unavailable.", safeMessage: "Production database access is unavailable.", stage: "supabase" }, { status: 503 });
  }

  const result = await repairMissingPaymentRouting(supabase, access.actor, parsed.data.appointmentId);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
