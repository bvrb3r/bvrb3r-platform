import { NextResponse } from "next/server";
import { buildPaymentDebugPacket } from "@/lib/architect/debug/payment-debug";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return access.response;

  const params = new URL(request.url).searchParams;
  const appointmentId = params.get("appointmentId")?.trim() ?? null;
  const paymentId = params.get("paymentId")?.trim() ?? null;
  if (!appointmentId && !paymentId) {
    return NextResponse.json({ ok: false, error: "appointmentId or paymentId is required.", safeMessage: "Enter an appointment or payment id.", stage: "input" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is unavailable.", safeMessage: "Production database access is unavailable.", stage: "supabase" }, { status: 503 });
  }

  try {
    const packet = await buildPaymentDebugPacket(supabase, { appointmentId, paymentId }, access.actor);
    return NextResponse.json(packet);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to build payment debug packet.",
      safeMessage: "Payment debug could not be completed.",
      stage: "payment_debug"
    }, { status: 500 });
  }
}
