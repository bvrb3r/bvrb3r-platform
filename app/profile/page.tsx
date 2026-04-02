import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientProfileScreen } from "@/components/client-experience/client-profile-screen";
import { getClientProfilePayload } from "@/lib/booking/platform-service";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export default async function ProfilePage() {
  const context = await getClientExperienceContext();
  const payload = await getClientProfilePayload(context.clientId);

  return (
    <ClientAppShell activeTab="profile">
      <ClientProfileScreen payload={payload} isSignedInClient={context.isSignedInClient} />
    </ClientAppShell>
  );
}
