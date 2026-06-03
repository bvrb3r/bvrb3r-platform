import { ClientCultureScreen } from "@/components/client-experience/client-culture-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberCulturePage() {
  const user = await getAuthorizedUser(["barber_user"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber/messages"
      title="Culture"
      subtitle="Cuts, shops, style, and community."
      hidePageHeader
    >
      <ClientCultureScreen surface="barber" />
    </DashboardShell>
  );
}
