import { AccountSessionWorkspace } from "@/components/auth/account-session-workspace";
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
      subtitle="Keep shop profile, services, compensation, verification, payout setup, account controls, and support together in one private owner tab."
    >
      <AccountSessionWorkspace user={user} />
      <OwnerSettingsWorkspace user={user} initialSection={params.section} />
    </DashboardShell>
  );
}
