import { getAuthorizedUser } from "@/lib/auth/guards";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { MessagingInboxScreen } from "@/components/messages/messaging-inbox-screen";

export default async function ClientMessageThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  await getAuthorizedUser(["client"]);
  const { threadId } = await params;

  return (
    <ClientAppShell>
      <MessagingInboxScreen
        surface="client"
        basePath="/messages"
        selectedThreadId={threadId}
        title="Messages"
        subtitle="Keep appointment questions, barber updates, and shop support in one clean place tied to the visits you already have."
      />
    </ClientAppShell>
  );
}
