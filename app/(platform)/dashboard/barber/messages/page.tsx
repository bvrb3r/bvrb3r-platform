import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MessagingInboxScreen } from "@/components/messages/messaging-inbox-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberMessagesPage() {
  const user = await getAuthorizedUser(["commission_barber", "booth_rent_barber"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber/messages"
      title="Messages"
      subtitle="Client conversations, appointment threads, and support."
    >
      <MessagingInboxScreen
        surface="barber"
        basePath="/dashboard/barber/messages"
        title="Messages"
        subtitle="Client conversations, appointment threads, and support."
      />
    </DashboardShell>
  );
}
