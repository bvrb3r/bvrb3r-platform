import { ClientCultureScreen } from "@/components/client-experience/client-culture-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerCulturePage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/messages"
      title="Culture"
      subtitle="Cuts, shops, style, and community."
      hidePageHeader
      hideShellContext
    >
      <ClientCultureScreen surface="shop" />
    </DashboardShell>
  );
}
