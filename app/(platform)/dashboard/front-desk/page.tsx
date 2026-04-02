import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { FrontDeskWorkspace } from "@/components/operations/front-desk-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function FrontDeskDashboardPage() {
  const user = await getAuthorizedUser(["front_desk"]);
  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/front-desk"
      title="Front desk live board"
      subtitle="Check clients in, run the queue, move tickets toward checkout, and keep every guest handoff clear and fast."
    >
      <FrontDeskWorkspace locationIds={user.locationIds} />
    </DashboardShell>
  );
}