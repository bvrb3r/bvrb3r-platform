import { BarberSettingsScreen } from "@/components/barber-experience/barber-settings-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberMorePage({
  searchParams
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getAuthorizedUser(["commission_barber", "booth_rent_barber"]);
  const params = await searchParams;

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber/more"
      title="More"
      subtitle="Keep verification, payouts, business setup, notifications, support, and account controls together without cluttering the public barber profile."
    >
      <BarberSettingsScreen user={user} initialSection={params.section} />
    </DashboardShell>
  );
}
