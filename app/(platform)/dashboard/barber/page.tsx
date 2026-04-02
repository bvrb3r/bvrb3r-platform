import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BarberWorkspace } from "@/components/operations/barber-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberDashboardPage() {
  const user = await getAuthorizedUser(["commission_barber", "booth_rent_barber"]);
  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber"
      title="Chair calendar"
      subtitle="Run the day from the calendar, tap any booking for the full chair context, and fill open time without leaving the schedule."
    >
      <BarberWorkspace barberName={user.name} barberTitle={user.title} />
    </DashboardShell>
  );
}
