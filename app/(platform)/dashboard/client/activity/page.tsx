import { Suspense } from "react";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientBookingsScreen } from "@/components/client-experience/client-bookings-screen";
import { getClientExperienceContext } from "@/lib/client-experience/session";

export default async function ClientActivityDashboardPage() {
  await getClientExperienceContext();

  return (
    <ClientAppShell activeTab="more">
      <Suspense fallback={null}>
        <ClientBookingsScreen />
      </Suspense>
    </ClientAppShell>
  );
}
