import { getAuthorizedUser } from "@/lib/auth/guards";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { MessagingInboxScreen } from "@/components/messages/messaging-inbox-screen";

export default async function ClientMessagesPage() {
  await getAuthorizedUser(["client"]);

  return (
    <ClientAppShell>
      <MessagingInboxScreen
        surface="client"
        basePath="/messages"
        title="Messages"
        subtitle="Keep appointment questions, barber updates, and shop support in one clean place tied to the visits you already have."
      />
    </ClientAppShell>
  );
}
