import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerOperationsWorkspace } from "@/components/operations/owner-operations-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerOverviewPage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner"
      title="Owner overview"
      subtitle="Shop health, team movement, and next actions."
      hidePageHeader
    >
      <OwnerOperationsWorkspace shopIds={[user.ownedShopId ?? "", ...user.locationIds]} />
    </DashboardShell>
  );
}
