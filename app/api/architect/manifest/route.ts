import { NextResponse } from "next/server";
import { buildArchitectCityManifest } from "@/lib/architect/city-map/manifest.server";
import { requireArchitectDebugAccess } from "@/lib/architect/debug/guards";
import { readDeploymentRuntimeEvidence } from "@/lib/architect/mission-control/deployment-evidence.server";
import { buildMissionControlSnapshot } from "@/lib/architect/mission-control/incident-detection";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireArchitectDebugAccess();
  if (!access.ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  let snapshot = null;

  if (supabase) {
    try {
      const deploymentEvidence = await readDeploymentRuntimeEvidence();
      snapshot = await buildMissionControlSnapshot(supabase, access.actor, deploymentEvidence);
    } catch {
      snapshot = null;
    }
  }

  const ledgerDate = new URL(request.url).searchParams.get("date") ?? undefined;
  return NextResponse.json(await buildArchitectCityManifest({ snapshot, supabase, ledgerDate }), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0"
    }
  });
}
