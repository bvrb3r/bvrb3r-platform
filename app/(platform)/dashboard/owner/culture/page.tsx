import { ClientCultureScreen } from "@/components/client-experience/client-culture-screen";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { listCultureFeed, type CultureFeedResponse } from "@/lib/culture/service";

async function loadOwnerCultureFeed(viewerProfileId: string): Promise<CultureFeedResponse> {
  try {
    return await listCultureFeed({ role: "owner", viewerProfileId });
  } catch {
    return { items: [], cursor: null, hasMore: false };
  }
}

export default async function OwnerCulturePage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  const feed = await loadOwnerCultureFeed(user.id);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/messages"
      title="Culture"
      subtitle="Cuts, shops, style, and community."
      hidePageHeader
      hideShellContext
    >
      <ClientCultureScreen feed={feed} surface="shop" />
    </DashboardShell>
  );
}
