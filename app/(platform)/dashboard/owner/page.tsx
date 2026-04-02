import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerOverview } from "@/components/operations/owner-overview";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerDashboardPage() {
  const user = await getAuthorizedUser(["owner"]);
  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner"
      title="Owner control center"
      subtitle="See revenue, chair flow, team performance, and financial health from one owner-safe command view."
    >
      <OwnerOverview />
    </DashboardShell>
  );
}
