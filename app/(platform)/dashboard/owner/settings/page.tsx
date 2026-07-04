import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerSettingsWorkspace } from "@/components/operations/owner-settings-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { resolveShopOwnerPaywallSummaryForUser } from "@/lib/entitlements/shop-owner-paywall";
import { resolveSubscriptionSettingsSummaryForUser } from "@/lib/entitlements/subscription-settings";

export default async function OwnerSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  const [paywallSummary, subscriptionSummary] = await Promise.all([
    resolveShopOwnerPaywallSummaryForUser({ user }),
    resolveSubscriptionSettingsSummaryForUser({ user })
  ]);
  const params = await searchParams;

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/more"
      title="More"
      subtitle="Account, shop settings, verification, payments, policies, compliance, activity, and help."
      hidePageHeader
      hideShellContext
    >
      <OwnerSettingsWorkspace
        user={user}
        initialSection={params.section}
        ownerPlanSummary={paywallSummary}
        subscriptionSummary={subscriptionSummary ?? undefined}
      />
    </DashboardShell>
  );
}
