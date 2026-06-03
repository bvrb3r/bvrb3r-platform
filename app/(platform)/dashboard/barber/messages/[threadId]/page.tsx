import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MessagingInboxScreen } from "@/components/messages/messaging-inbox-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberMessageThreadPage({
  params
}: {
  params: Promise<{ threadId: string }>;
}) {
  const user = await getAuthorizedUser(["barber_user"]);
  const { threadId } = await params;

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
        cultureHref="/dashboard/barber/culture"
        selectedThreadId={threadId}
        title="Messages"
        subtitle="Clients, bookings, shop lines, and support."
      />
    </DashboardShell>
  );
}
