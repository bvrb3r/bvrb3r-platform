import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ShopOwnerPlanAccessCard } from "@/components/owner-experience/shop-owner-plan-access-card";
import { OwnerScheduleWorkspace } from "@/components/operations/owner-schedule-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { resolveShopOwnerPaywallSummaryForUser } from "@/lib/entitlements/shop-owner-paywall";

export default async function OwnerSchedulePage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  const paywallSummary = await resolveShopOwnerPaywallSummaryForUser({ user });

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/schedule"
      title="Schedule"
      subtitle="All chairs & bookings"
      hidePageHeader
    >
      <ShopOwnerPlanAccessCard summary={paywallSummary} compact />
      <OwnerScheduleWorkspace />
    </DashboardShell>
  );
}
