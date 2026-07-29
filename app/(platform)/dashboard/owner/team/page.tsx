import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerOperationsWorkspace } from "@/components/operations/owner-operations-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerTeamPage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner"
      title="Home"
      subtitle="Manage your public shop profile, barbers, invites, and team performance."
      hidePageHeader
    >
      <OwnerOperationsWorkspace
        shopIds={[user.ownedShopId ?? "", ...user.locationIds]}
        initialTab="team"
      />
    </DashboardShell>
  );
}
