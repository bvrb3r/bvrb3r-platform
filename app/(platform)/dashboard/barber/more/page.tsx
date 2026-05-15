import { BarberSettingsScreen } from "@/components/barber-experience/barber-settings-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberMorePage({
  searchParams
}: {
  searchParams: Promise<{ section?: string; stripe?: string }>;
}) {
  const user = await getAuthorizedUser(["barber_user"]);
  const params = await searchParams;
  const stripeReturnState = params.stripe === "return" || params.stripe === "refresh" ? params.stripe : null;

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber/more"
      title="More"
      subtitle="Manage your account, payouts & settings"
    >
      <BarberSettingsScreen user={user} initialSection={params.section} stripeReturnState={stripeReturnState} />
    </DashboardShell>
  );
}
