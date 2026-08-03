import { CalendarSyncWorkspace } from "@/components/calendar-sync/calendar-sync-workspace";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function SquareCalendarConnectPage() {
  const user = await getAuthorizedUser(["barber_user"]);
  return (
    <DashboardShell user={user} activeHref="/dashboard/barber/more" title="Square Calendar Connect" subtitle="Calendar only · money never moves" hidePageHeader>
      <CalendarSyncWorkspace provider="square" />
    </DashboardShell>
  );
}
