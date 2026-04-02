import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BarberCommandWorkspace } from "@/components/operations/barber-command-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberCommandPage() {
  const user = await getAuthorizedUser(["commission_barber", "booth_rent_barber"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/command"
      title="Barber Command"
      subtitle="Control live chair status, next guest actions, weekly availability, and core service setup without cluttering the home calendar."
    >
      <BarberCommandWorkspace barberName={user.name} />
    </DashboardShell>
  );
}
