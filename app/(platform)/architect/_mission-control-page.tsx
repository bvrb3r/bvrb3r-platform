import { ArchitectMissionControl } from "@/components/architect/mission-control/mission-control";
import { getPlatformAdminUser } from "@/lib/auth/guards";
import type { MissionLaneId } from "@/lib/architect/mission-control/types";

export async function renderArchitectMissionControlLane(laneId: MissionLaneId) {
  await getPlatformAdminUser();

  return <ArchitectMissionControl laneId={laneId} />;
}
