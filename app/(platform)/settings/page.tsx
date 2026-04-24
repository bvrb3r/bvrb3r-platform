import type { Route } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AccountSessionWorkspace } from "@/components/auth/account-session-workspace";
import { OwnerSettingsWorkspace } from "@/components/operations/owner-settings-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function SettingsPage() {
  const user = await getAuthorizedUser(["owner", "commission_barber", "booth_rent_barber", "client"]);
  const isOwner = user.role === "owner";

  if (user.role === "client") {
    redirect("/dashboard/client/profile?section=settings" as Route);
  }

  if (user.role === "commission_barber" || user.role === "booth_rent_barber") {
    redirect("/dashboard/barber/settings" as Route);
  }

  return (
    <DashboardShell
      user={user}
      activeHref="/settings"
      title={isOwner ? "Settings and shop posture" : "Account settings"}
      subtitle={isOwner
        ? "Control branding, permissions, billing health, and shop readiness without stepping outside the canonical owner systems."
        : "Manage account session safety and confirm the saved lane BVRB3R will restore on every login."}
    >
      <AccountSessionWorkspace user={user} />
      {isOwner ? <OwnerSettingsWorkspace user={user} /> : null}
    </DashboardShell>
  );
}
