import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerTeamWorkspace } from "@/components/operations/owner-team-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerTeamPage() {
  const user = await getAuthorizedUser(["owner"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/team"
      title="Team"
      subtitle="Keep barber roster, approvals, performance, and role control visible in one owner-safe team tab."
    >
      <OwnerTeamWorkspace />
    </DashboardShell>
  );
}
