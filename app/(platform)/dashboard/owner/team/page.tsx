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
      subtitle="Manage your barbers & team performance"
      hidePageHeader
    >
      <OwnerTeamWorkspace />
    </DashboardShell>
  );
}
