import { BarberSettingsScreen } from "@/components/barber-experience/barber-settings-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { DashboardHeaderNotificationItem } from "@/components/dashboard/dashboard-header-actions";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { resolveSubscriptionSettingsSummaryForUser } from "@/lib/entitlements/subscription-settings";
import { getStripeConnectEnvironment } from "@/lib/stripe/connect";

export default async function BarberMorePage({
  searchParams
}: {
  searchParams: Promise<{ section?: string; stripe?: string }>;
}) {
  const user = await getAuthorizedUser(["barber_user"]);
  const subscriptionSummary = await resolveSubscriptionSettingsSummaryForUser({ user });
  const params = await searchParams;
  const stripeReturnState = params.stripe === "return" || params.stripe === "refresh" ? params.stripe : null;
  const stripeEnvironment = getStripeConnectEnvironment();
  const headerNotificationItems: DashboardHeaderNotificationItem[] = stripeEnvironment.blocksLivePayouts
    ? [
        {
          id: "stripe-test-mode-payouts",
          category: "PAYOUTS",
          severity: "warning",
          title: "Payout setup",
          body: "Stripe is in test mode. Live payouts are not active yet.",
          action: {
            label: "View payout setup",
            href: "/dashboard/barber/more#payouts"
          }
        }
      ]
    : [];

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber/more"
      title="More"
      subtitle="Manage your account, payouts & settings"
      hidePageHeader
      headerNotificationItems={headerNotificationItems}
    >
      <BarberSettingsScreen
        user={user}
        initialSection={params.section}
        stripeReturnState={stripeReturnState}
        subscriptionSummary={subscriptionSummary ?? undefined}
      />
    </DashboardShell>
  );
}
