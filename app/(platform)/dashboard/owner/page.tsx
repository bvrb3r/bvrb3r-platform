import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ShopOwnerPlanAccessCard } from "@/components/owner-experience/shop-owner-plan-access-card";
import { OwnerTeamWorkspace } from "@/components/operations/owner-team-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { resolveShopOwnerPaywallSummaryForUser } from "@/lib/entitlements/shop-owner-paywall";

export default async function OwnerDashboardPage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  const paywallSummary = await resolveShopOwnerPaywallSummaryForUser({ user });
  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner"
      title="Home"
      subtitle="Manage your shop, team, and public profile."
      hidePageHeader
    >
      <ShopOwnerPlanAccessCard summary={paywallSummary} compact />
      <OwnerTeamWorkspace />
    </DashboardShell>
  );
}
