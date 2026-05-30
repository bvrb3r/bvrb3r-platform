import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerTeamWorkspace } from "@/components/operations/owner-team-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerDashboardPage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner"
      title="Home"
      subtitle="Team command center, public shop profile controls, and next owner actions."
      hidePageHeader
    >
      <OwnerTeamWorkspace />
    </DashboardShell>
  );
}
