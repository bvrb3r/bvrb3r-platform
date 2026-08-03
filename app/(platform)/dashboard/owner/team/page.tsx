import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerTeamWorkspace } from "@/components/operations/owner-team-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerTeamPage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/more"
      title=""
      subtitle=""
      hidePageHeader
      hideShellContext
    >
      <OwnerTeamWorkspace />
    </DashboardShell>
  );
}
