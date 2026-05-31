import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OwnerPublicProfileEditor } from "@/components/operations/owner-public-profile-editor";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerPublicProfilePage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/more"
      title="Public Profile"
      subtitle="Edit the public shop profile clients see."
      hidePageHeader
      hideShellContext
    >
      <OwnerPublicProfileEditor user={user} />
    </DashboardShell>
  );
}
