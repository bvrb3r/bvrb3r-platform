import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { ClientBookingsScreen } from "@/components/client-experience/client-bookings-screen";

export default async function BookingsPage() {
  return (
    <ClientAppShell activeTab="bookings">
      <ClientBookingsScreen />
    </ClientAppShell>
  );
}
