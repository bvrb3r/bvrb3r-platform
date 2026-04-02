import { ClientActivityScreen } from "@/components/client-experience/client-activity-screen";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export default async function ActivityPage() {
  await getClientExperienceContext();

  return (
    <ClientAppShell activeTab="activity">
      <ClientActivityScreen />
    </ClientAppShell>
  );
}
