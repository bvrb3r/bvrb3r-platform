import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerSettingsWorkspace } from "@/components/operations/owner-settings-workspace";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  const params = await searchParams;

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/more"
      title="More"
      subtitle="Account, shop settings, verification, payments, policies, compliance, activity, and help."
      hidePageHeader
      hideShellContext
    >
      <OwnerSettingsWorkspace user={user} initialSection={params.section} />
    </DashboardShell>
  );
}
