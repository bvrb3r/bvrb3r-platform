import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { StaffProfileWorkspace } from "@/components/operations/staff-profile-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function WorkspaceProfilePage() {
  const user = await getAuthorizedUser(["owner", "manager", "front_desk", "commission_barber", "booth_rent_barber"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/workspace/profile"
      title="Role profile and permissions"
      subtitle="Identity, photos, communication settings, and payout posture stay readable here without turning profile into a settings maze."
    >
      <StaffProfileWorkspace user={user} />
    </DashboardShell>
  );
}
