import type { Route } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { TeamWorkspace } from "@/components/operations/team-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { isShopOwnerRole } from "@/lib/auth/roles";

export default async function TeamPage() {
  const user = await getAuthorizedUser(["shop_owner_user", "manager", "front_desk"]);

  if (isShopOwnerRole(user.role)) {
    redirect("/dashboard/owner/team" as Route);
  }

  return (
    <DashboardShell
      user={user}
      activeHref="/team"
      title={user.role === "manager" ? "Team coverage and chair readiness" : "Barber coverage and desk visibility"}
      subtitle={user.role === "manager"
          ? "Keep the staff roster, chair load, and attendance visible so schedule changes and walk-in pressure stay manageable."
          : "See which barbers are available, how the floor is staffed, and who is best positioned for the next guest."}
    >
      <TeamWorkspace viewerRole={user.role as "manager" | "front_desk"} locationIds={user.locationIds} />
    </DashboardShell>
  );
}

