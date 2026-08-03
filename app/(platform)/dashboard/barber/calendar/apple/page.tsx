import { CalendarSyncWorkspace } from "@/components/calendar-sync/calendar-sync-workspace";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function AppleCalendarSyncPage() {
  const user = await getAuthorizedUser(["barber_user"]);
  return (
    <DashboardShell user={user} activeHref="/dashboard/barber/more" title="Apple Calendar Sync" subtitle="Two directions · zero money" hidePageHeader>
      <CalendarSyncWorkspace provider="apple" />
    </DashboardShell>
  );
}
