import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MessagingInboxScreen } from "@/components/messages/messaging-inbox-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerMessagesPage() {
  const user = await getAuthorizedUser(["shop_owner_user"]);

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/messages"
      title="Messages"
      subtitle="Client, barber, team, booking, and support conversations."
      hidePageHeader
      hideShellContext
    >
      <MessagingInboxScreen
        surface="shop"
        basePath="/dashboard/owner/messages"
        title="Messages"
        subtitle="Client, barber, team, booking, and support conversations."
      />
    </DashboardShell>
  );
}
