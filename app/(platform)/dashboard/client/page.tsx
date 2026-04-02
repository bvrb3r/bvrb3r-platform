import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ClientWorkspace } from "@/components/operations/client-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function ClientDashboardPage() {
  const user = await getAuthorizedUser(["client"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/client"
      title="Your next visit, already in motion"
      subtitle="Follow rebooking cues, favorite-barber availability, offers, loyalty momentum, and client-only notifications from one personalized dashboard."
    >
      <ClientWorkspace clientId={user.clientId ?? ""} locationIds={user.locationIds} />
    </DashboardShell>
  );
}
