import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BarberWorkspace } from "@/components/operations/barber-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberDashboardPage() {
  const user = await getAuthorizedUser(["commission_barber", "booth_rent_barber"]);
  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber"
      title="Today"
      subtitle="Run today fast: next client, live chair posture, today&apos;s money snapshot, real gaps, and the next barber action that matters."
    >
      <BarberWorkspace barberName={user.name} barberTitle={user.title} barberSubtype={user.barberSubtype} />
    </DashboardShell>
  );
}
