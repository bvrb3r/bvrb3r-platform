import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerSettingsWorkspace } from "@/components/operations/owner-settings-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function SettingsPage() {
  const user = await getAuthorizedUser(["owner"]);

  return (
    <DashboardShell user={user} activeHref="/settings" title="Settings and shop posture" subtitle="Control branding, permissions, billing health, and shop readiness without stepping outside the canonical owner systems.">
      <OwnerSettingsWorkspace user={user} />
    </DashboardShell>
  );
}
