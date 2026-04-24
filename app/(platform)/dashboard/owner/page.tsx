import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerOverview } from "@/components/operations/owner-overview";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerDashboardPage() {
  const user = await getAuthorizedUser(["owner"]);
  const shopName = user.ownedShopName?.trim();
  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner"
      title="Home"
      subtitle={shopName
        ? `${shopName} home keeps today revenue, bookings, chair utilization, alerts, and quick actions clear without leaving the owner-safe system.`
        : "Home keeps today revenue, bookings, chair utilization, alerts, and quick actions clear without leaving the owner-safe system."}
    >
      <OwnerOverview />
    </DashboardShell>
  );
}
