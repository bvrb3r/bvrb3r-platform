import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ManagerOverview } from "@/components/operations/manager-overview";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function ManagerDashboardPage() {
  const user = await getAuthorizedUser(["manager"]);
  const isBarberManager = Boolean(user.barberId);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/manager"
      title={isBarberManager ? "Barber manager command center" : "Shop command center"}
      subtitle={
        isBarberManager
          ? "Oversee the shop floor, keep barber coverage aligned, and stay close to chair-level reality without exposing owner-only controls."
          : "Run the entire floor, monitor every chair, direct walk-ins, and keep the shop moving without exposing owner-only controls."
      }
    >
      <ManagerOverview locationIds={user.locationIds} />
    </DashboardShell>
  );
}
