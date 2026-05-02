import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerSettingsWorkspace } from "@/components/operations/owner-settings-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getAuthorizedUser(["owner"]);
  const params = await searchParams;

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/settings"
      title="Settings"
      subtitle="Manage your shop & business controls"
      hidePageHeader
    >
      <OwnerSettingsWorkspace user={user} initialSection={params.section} />
    </DashboardShell>
  );
}
