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
      title={shopName || "Owner control center"}
      subtitle={shopName
        ? `${shopName} is your owner-safe command view for activation, setup, revenue, chair flow, team performance, and financial health.`
        : "See revenue, chair flow, team performance, and financial health from one owner-safe command view."}
    >
      <OwnerOverview />
    </DashboardShell>
  );
}
