import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerScheduleWorkspace } from "@/components/operations/owner-schedule-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerSchedulePage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/schedule"
      title="Schedule"
      subtitle="All chairs & bookings"
      hidePageHeader
    >
      <OwnerScheduleWorkspace />
    </DashboardShell>
  );
}
