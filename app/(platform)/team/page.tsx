import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerTeamWorkspace } from "@/components/operations/owner-team-workspace";
import { TeamWorkspace } from "@/components/operations/team-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function TeamPage() {
  const user = await getAuthorizedUser(["owner", "manager", "front_desk"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/team"
      title={user.role === "owner" ? "Team performance and staffing" : user.role === "manager" ? "Team coverage and chair readiness" : "Barber coverage and desk visibility"}
      subtitle={user.role === "owner"
        ? "Manage the team like a business: see who is earning, who needs support, and where the next staffing action lives."
        : user.role === "manager"
          ? "Keep the staff roster, chair load, and attendance visible so schedule changes and walk-in pressure stay manageable."
          : "See which barbers are available, how the floor is staffed, and who is best positioned for the next guest."}
    >
      {user.role === "owner" ? (
        <OwnerTeamWorkspace />
      ) : (
        <TeamWorkspace viewerRole={user.role as "manager" | "front_desk"} locationIds={user.locationIds} />
      )}
    </DashboardShell>
  );
}

