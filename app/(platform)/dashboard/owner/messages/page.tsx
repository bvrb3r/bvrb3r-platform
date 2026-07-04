import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ShopOwnerPlanAccessCard } from "@/components/owner-experience/shop-owner-plan-access-card";
import { MessagingInboxScreen } from "@/components/messages/messaging-inbox-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { resolveShopOwnerPaywallSummaryForUser } from "@/lib/entitlements/shop-owner-paywall";

export default async function OwnerMessagesPage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  const paywallSummary = await resolveShopOwnerPaywallSummaryForUser({ user });

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/messages"
      title="Messages"
      subtitle="Clients, barbers, team, bookings, and support."
      hidePageHeader
      hideShellContext
    >
      <ShopOwnerPlanAccessCard summary={paywallSummary} compact />
      <MessagingInboxScreen
        surface="shop"
        basePath="/dashboard/owner/messages"
        cultureHref="/dashboard/owner/culture"
        title="Messages"
        subtitle="Clients, barbers, team, bookings, and support."
      />
    </DashboardShell>
  );
}
