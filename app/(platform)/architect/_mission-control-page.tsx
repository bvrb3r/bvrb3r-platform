import { ArchitectMissionControl } from "@/components/architect/mission-control/mission-control";
import { CockpitHome } from "@/components/architect/mission-control/cockpit-home";
import { getPlatformAdminUser } from "@/lib/auth/guards";
import { readDeploymentRuntimeEvidence } from "@/lib/architect/mission-control/deployment-evidence.server";
import { buildMissionControlSnapshot } from "@/lib/architect/mission-control/incident-detection";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { MissionControlSnapshot, MissionLaneId } from "@/lib/architect/mission-control/types";

export async function renderArchitectMissionControlHome() {
  // Admin gate first — the cockpit must never render for non-admin roles.
  const user = await getPlatformAdminUser();

  // Build the SAME snapshot the lane component consumes, server-side. Any failure
  // (missing admin client, evidence error) renders the Degraded state — never a fake Pass.
  let snapshot: MissionControlSnapshot | null = null;
  try {
    const supabase = createSupabaseAdminClient();
    if (supabase) {
      const deploymentRuntimeEvidence = await readDeploymentRuntimeEvidence();
      snapshot = await buildMissionControlSnapshot(supabase, user, deploymentRuntimeEvidence);
    }
  } catch (error) {
    console.error("[Architect] Mission Control home snapshot failed", error);
    snapshot = null;
  }

  return <CockpitHome snapshot={snapshot} user={{ name: user.name, email: user.email }} />;
}

export async function renderArchitectMissionControlLane(laneId: MissionLaneId) {
  await getPlatformAdminUser();

  return <ArchitectMissionControl laneId={laneId} />;
}
