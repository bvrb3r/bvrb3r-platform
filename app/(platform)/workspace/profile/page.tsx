import type { Route } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { StaffProfileWorkspace } from "@/components/operations/staff-profile-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function WorkspaceProfilePage() {
  const user = await getAuthorizedUser(["owner", "manager", "front_desk", "commission_barber", "booth_rent_barber"]);

  if (user.role === "commission_barber" || user.role === "booth_rent_barber") {
    redirect("/dashboard/barber/profile" as Route);
  }

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
