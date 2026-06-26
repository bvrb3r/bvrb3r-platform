import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BarberWorkspace } from "@/components/operations/barber-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberDashboardPage() {
  const user = await getAuthorizedUser(["barber_user"]);
  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber"
      title=""
      subtitle=""
      hidePageHeader
    >
      <BarberWorkspace barberName={user.name} barberTitle={user.title} barberSubtype={user.barberSubtype} />
    </DashboardShell>
  );
}
