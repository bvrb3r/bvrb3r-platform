import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MessagingInboxScreen } from "@/components/messages/messaging-inbox-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberMessagesPage() {
  const user = await getAuthorizedUser(["barber_user"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber/messages"
      title="Messages"
      subtitle="Clients, bookings, shop lines, and support."
      hidePageHeader
    >
      <MessagingInboxScreen
        surface="barber"
        basePath="/dashboard/barber/messages"
        title="Messages"
        subtitle="Clients, bookings, shop lines, and support."
      />
    </DashboardShell>
  );
}
