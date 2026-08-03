import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerOperationsWorkspace } from "@/components/operations/owner-operations-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerDashboardPage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner"
      title=""
      subtitle=""
      hidePageHeader
      hideShellContext
    >
      <OwnerOperationsWorkspace
        shopIds={[user.ownedShopId ?? "", ...user.locationIds]}
        embedded
      />
    </DashboardShell>
  );
}
