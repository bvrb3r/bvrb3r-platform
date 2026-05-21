import { ArchitectReportsWorkspace } from "@/components/architect/reports/architect-reports-workspace";
import { getPlatformAdminUser } from "@/lib/auth/guards";

export default async function ArchitectReportsPage() {
  await getPlatformAdminUser();

  return <ArchitectReportsWorkspace />;
}
