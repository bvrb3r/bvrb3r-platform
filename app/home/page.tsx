import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientHomeScreen } from "@/components/client-experience/client-home-screen";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export default async function HomeRoutePage() {
  const context = await getClientExperienceContext();

  return (
    <ClientAppShell activeTab="home">
      <ClientHomeScreen clientId={context.clientId} isSignedInClient={context.isSignedInClient} displayName={context.activeClient.name} />
    </ClientAppShell>
  );
}
