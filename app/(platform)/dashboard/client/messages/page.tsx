import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { MessagingInboxScreen } from "@/components/messages/messaging-inbox-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function ClientMessagesDashboardPage({
  searchParams
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  await getAuthorizedUser(["client_user"]);
  const params = await searchParams;

  return (
    <ClientAppShell activeTab="messages">
      <MessagingInboxScreen
        surface="client"
        basePath="/dashboard/client/messages"
        startSupportIntent={params.thread === "support"}
        title="Messages"
        subtitle="Barbers, shops, bookings, and support."
      />
    </ClientAppShell>
  );
}
