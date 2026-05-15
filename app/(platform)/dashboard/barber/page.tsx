import { BarberCalendarScreen } from "@/components/barber-experience/barber-calendar-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberDashboardPage() {
  const user = await getAuthorizedUser(["barber_user"]);
  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber"
      title="Calendar"
      subtitle="Manage your day, appointments & availability."
    >
      <BarberCalendarScreen barberName={user.name} barberTitle={user.title} barberSubtype={user.barberSubtype} />
    </DashboardShell>
  );
}
