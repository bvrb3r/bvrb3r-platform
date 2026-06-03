import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MessagingInboxScreen } from "@/components/messages/messaging-inbox-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerMessageThreadPage({
  params
}: {
  params: Promise<{ threadId: string }>;
}) {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  const { threadId } = await params;

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/messages"
      title="Messages"
      subtitle="Clients, barbers, team, bookings, and support."
      hidePageHeader
      hideShellContext
    >
      <MessagingInboxScreen
        surface="shop"
        basePath="/dashboard/owner/messages"
        cultureHref="/dashboard/owner/culture"
        selectedThreadId={threadId}
        title="Messages"
        subtitle="Clients, barbers, team, bookings, and support."
      />
    </DashboardShell>
  );
}
