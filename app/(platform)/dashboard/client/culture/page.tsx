import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientCultureScreen } from "@/components/client-experience/client-culture-screen";
import { listCultureFeed, type CultureFeedResponse } from "@/lib/culture/service";
import { getClientExperienceContext } from "@/lib/client-experience/session";

async function loadClientCultureFeed(): Promise<CultureFeedResponse> {
  try {
    return await listCultureFeed({ role: "client" });
  } catch (error) {
    console.error("[culture-feed] client_feed_failed", {
      error: error instanceof Error ? error.message : "Unknown Culture feed error."
    });
    return {
      items: [],
      cursor: null,
      hasMore: false,
      error: "Unable to load Culture feed. Try again."
    };
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
