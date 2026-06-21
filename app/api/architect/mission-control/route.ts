import { NextResponse } from "next/server";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { readDeploymentRuntimeEvidence } from "@/lib/architect/mission-control/deployment-evidence.server";
import { buildMissionControlSnapshot } from "@/lib/architect/mission-control/incident-detection";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) return access.response;

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json({
      ok: false,
      error: "Supabase admin client is unavailable.",
      safeMessage: "Production database access is unavailable.",
      stage: "supabase"
    }, { status: 503 });
  }

  try {
    const deploymentRuntimeEvidence = await readDeploymentRuntimeEvidence();
    return NextResponse.json(await buildMissionControlSnapshot(supabase, access.actor, deploymentRuntimeEvidence));
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Mission Control could not load.",
      safeMessage: "Mission Control could not collect production truth.",
      stage: "mission_control"
    }, { status: 500 });
  }
}
