import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { MessagingInboxScreen } from "@/components/messages/messaging-inbox-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function ClientMessageThreadDashboardPage({
  params
}: {
  params: Promise<{ threadId: string }>;
}) {
  await getAuthorizedUser(["client"]);
  const { threadId } = await params;

  return (
    <ClientAppShell activeTab="messages">
      <MessagingInboxScreen
        surface="client"
        basePath="/dashboard/client/messages"
        selectedThreadId={threadId}
        title="Messages"
        subtitle="Your conversations, appointments, and support."
      />
    </ClientAppShell>
  );
}
