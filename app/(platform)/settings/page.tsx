import type { Route } from "next";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AccountSessionWorkspace } from "@/components/auth/account-session-workspace";
import { OwnerSettingsWorkspace } from "@/components/operations/owner-settings-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { isBarberAccountRole, isClientRole, isShopOwnerRole } from "@/lib/auth/roles";

export default async function SettingsPage() {
  const user = await getAuthorizedUser(["shop_owner_user", "barber_user", "client_user"]);
  const isOwner = isShopOwnerRole(user.role);

  if (isClientRole(user.role)) {
    redirect("/dashboard/client/profile?section=settings" as Route);
  }

  if (isOwner) {
    redirect("/dashboard/owner/more" as Route);
  }

  if (isBarberAccountRole(user.role)) {
    redirect("/dashboard/barber/more?section=settings" as Route);
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
