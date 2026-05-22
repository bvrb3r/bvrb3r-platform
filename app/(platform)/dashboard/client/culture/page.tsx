import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientCultureScreen } from "@/components/client-experience/client-culture-screen";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export default async function ClientCultureDashboardPage() {
  const context = await getClientExperienceContext();

  return (
    <ClientAppShell activeTab="culture" mode={context.isGuest ? "guest" : "client"}>
      <ClientCultureScreen />
    </ClientAppShell>
  );
}
