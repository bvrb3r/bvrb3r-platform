import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientCultureScreen } from "@/components/client-experience/client-culture-screen";
import { listCultureFeed, type CultureFeedResponse } from "@/lib/culture/service";
import { getClientExperienceContext } from "@/lib/client-experience/session";

async function loadClientCultureFeed(): Promise<CultureFeedResponse> {
  try {
    return await listCultureFeed({ role: "client" });
  } catch {
    return { items: [], cursor: null, hasMore: false };
  }
}

export default async function ClientCultureDashboardPage() {
  const context = await getClientExperienceContext();
  const feed = await loadClientCultureFeed();

  return (
    <ClientAppShell activeTab="culture" mode={context.isGuest ? "guest" : "client"}>
      <ClientCultureScreen feed={feed} />
    </ClientAppShell>
  );
}
