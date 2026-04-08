import { redirect } from "next/navigation";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientHomeScreen } from "@/components/client-experience/client-home-screen";
import { AuthSessionRecovery } from "@/components/auth/auth-session-recovery";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getClientExperienceContext } from "@/lib/client-experience/session";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

export default async function HomeRoutePage() {
  const session = await getCurrentUserFromServer();
  if (session.mode === "supabase" && session.authenticated) {
    redirect(await resolvePostAuthDestination(session.user));
  }

  const context = await getClientExperienceContext();

  return (
    <ClientAppShell activeTab="home">
      <AuthSessionRecovery mode="public" />
      <ClientHomeScreen
        clientId={context.clientId}
        isSignedInClient={context.isSignedInClient}
        displayName={context.activeClient?.name ?? context.viewer.name}
      />
    </ClientAppShell>
  );
}
