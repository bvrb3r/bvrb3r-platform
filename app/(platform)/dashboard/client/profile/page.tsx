import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientProfileScreen } from "@/components/client-experience/client-profile-screen";
import { getClientProfilePayload } from "@/lib/booking/platform-service";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export default async function ClientProfileDashboardPage({
  searchParams
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const context = await getClientExperienceContext();
  const payload = await getClientProfilePayload(context.clientId);
  const params = await searchParams;

  return (
    <ClientAppShell activeTab="profile">
      <ClientProfileScreen
        payload={payload}
        isSignedInClient={context.isSignedInClient}
        initialSection={params.section}
      />
    </ClientAppShell>
  );
}
