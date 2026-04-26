import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerScheduleWorkspace } from "@/components/operations/owner-schedule-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerSchedulePage() {
  const user = await getAuthorizedUser(["owner"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/schedule"
      title="Schedule"
      subtitle="View shop-wide appointments, hours, and capacity."
    >
      <OwnerScheduleWorkspace />
    </DashboardShell>
  );
}
