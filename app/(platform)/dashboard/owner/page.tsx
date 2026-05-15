import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerOverview } from "@/components/operations/owner-overview";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerDashboardPage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner"
      title="Overview"
      subtitle="Live performance & insights"
      hidePageHeader
    >
      <OwnerOverview />
    </DashboardShell>
  );
}
