import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ShopSetupConsole } from "@/components/rent/shop-setup-console";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerKioskSetupPage() {
  const user = await getAuthorizedUser(["shop_owner_user", "owner"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/more"
      title="Shop Setup & Kiosk"
      subtitle="Twelve gates, device pairing, honest booking mode"
      hidePageHeader
    >
      <ShopSetupConsole />
    </DashboardShell>
  );
}
