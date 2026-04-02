import { ReferralsWorkspace } from "@/components/engagement/referrals-workspace";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export default async function ReferralsPage() {
  await getClientExperienceContext();

  return (
    <ClientAppShell activeTab="activity">
      <ReferralsWorkspace />
    </ClientAppShell>
  );
}
