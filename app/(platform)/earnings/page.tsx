import { BarberEarningsWorkspace } from "@/components/operations/barber-earnings-workspace";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function EarningsPage() {
  const user = await getAuthorizedUser(["commission_barber", "booth_rent_barber"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/earnings"
      title="Money"
      subtitle="Check today earnings, available balance, payout readiness, and weekly momentum from the same locked money layer running the chair."
    >
      <BarberEarningsWorkspace barberName={user.name} />
    </DashboardShell>
  );
}
