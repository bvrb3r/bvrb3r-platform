import { NextResponse } from "next/server";
import { buildRoutingDebugPacket } from "@/lib/architect/debug/routing-debug";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return access.response;

  const appointmentId = new URL(request.url).searchParams.get("appointmentId")?.trim();
  if (!appointmentId) {
    return NextResponse.json({ ok: false, error: "appointmentId is required.", safeMessage: "Enter an appointment id.", stage: "input" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is unavailable.", safeMessage: "Production database access is unavailable.", stage: "supabase" }, { status: 503 });
  }

  try {
    const packet = await buildRoutingDebugPacket(supabase, appointmentId, access.actor);
    return NextResponse.json(packet);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to build routing debug packet.",
      safeMessage: "Routing debug could not be completed.",
      stage: "routing_debug"
    }, { status: 500 });
  }
}
