import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BarberScheduleWorkspace } from "@/components/operations/barber-schedule-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberCalendarPage() {
  const user = await getAuthorizedUser(["commission_barber", "booth_rent_barber"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber/calendar"
      title="Calendar"
      subtitle="Control working hours, blocked time, live appointments, and schedule posture from one barber-safe time surface."
    >
      <BarberScheduleWorkspace barberName={user.name} />
    </DashboardShell>
  );
}
