import { ClientCultureScreen } from "@/components/client-experience/client-culture-screen";
import { BARBER_PRIMARY_TAB_HREFS } from "@/components/barber-experience/barber-tab-config";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { listCultureFeed, type CultureFeedResponse } from "@/lib/culture/service";

async function loadBarberCultureFeed(viewerProfileId: string): Promise<CultureFeedResponse> {
  try {
    return await listCultureFeed({ role: "barber", viewerProfileId });
  } catch {
    return { items: [], cursor: null, hasMore: false };
  }
}

export default async function BarberCulturePage() {
  const user = await getAuthorizedUser(["barber_user"]);
  const feed = await loadBarberCultureFeed(user.id);

  return (
    <DashboardShell
      user={user}
      activeHref={BARBER_PRIMARY_TAB_HREFS.home}
      title="Culture"
      subtitle="Cuts, shops, style, and community."
      hidePageHeader
    >
      <ClientCultureScreen feed={feed} surface="barber" />
    </DashboardShell>
  );
}
