import { BarberCalendarScreen } from "@/components/barber-experience/barber-calendar-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberCalendarPage() {
  const user = await getAuthorizedUser(["commission_barber", "booth_rent_barber"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber"
      title="Calendar"
      subtitle="Open straight into today&apos;s chair schedule, then keep appointments, availability, gaps, next client, and live chair posture moving from the same barber-safe lane."
    >
      <BarberCalendarScreen barberName={user.name} barberTitle={user.title} barberSubtype={user.barberSubtype} />
    </DashboardShell>
  );
}
