import { CalendarSyncWorkspace } from "@/components/calendar-sync/calendar-sync-workspace";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function GoogleCalendarSyncPage() {
  const user = await getAuthorizedUser(["barber_user"]);
  return (
    <DashboardShell user={user} activeHref="/dashboard/barber/more" title="Google Calendar Sync" subtitle="Two directions · zero money" hidePageHeader>
      <CalendarSyncWorkspace provider="google" />
    </DashboardShell>
  );
}
