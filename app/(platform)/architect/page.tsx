import { ArchitectMissionControl } from "@/components/architect/mission-control/mission-control";
import { getPlatformAdminUser } from "@/lib/auth/guards";

export default async function ArchitectPage() {
  await getPlatformAdminUser();

  return <ArchitectMissionControl />;
}
