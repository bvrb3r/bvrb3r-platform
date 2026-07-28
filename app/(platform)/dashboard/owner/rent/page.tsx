import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { RentWorkspace } from "@/components/rent/rent-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerRentPage() {
  const user = await getAuthorizedUser(["shop_owner_user", "owner"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/money"
      title="Booth Rent"
      subtitle="Rent funding only — never barber earnings or tips"
      hidePageHeader
    >
      <RentWorkspace viewer="owner" />
    </DashboardShell>
  );
}
