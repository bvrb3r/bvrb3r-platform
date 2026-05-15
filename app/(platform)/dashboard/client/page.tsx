import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientHomeScreen } from "@/components/client-experience/client-home-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function ClientDashboardPage() {
  const user = await getAuthorizedUser(["client_user"]);

  return (
    <ClientAppShell activeTab="home" mode="client">
      <ClientHomeScreen
        isSignedInClient
        displayName={user.canonicalFullName ?? user.name}
      />
    </ClientAppShell>
  );
}
