import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientHomeScreen } from "@/components/client-experience/client-home-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { resolveClientPaywallSummaryForUser } from "@/lib/entitlements/client-paywall";

export default async function ClientDashboardPage() {
  const user = await getAuthorizedUser(["client_user"]);
  const paywallSummary = await resolveClientPaywallSummaryForUser({ user });

  return (
    <ClientAppShell activeTab="home" mode="client">
      <ClientHomeScreen
        isSignedInClient
        clientId={user.clientId}
        displayName={user.canonicalFullName ?? user.name}
        paywallSummary={paywallSummary}
      />
    </ClientAppShell>
  );
}
