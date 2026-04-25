import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MessagingInboxScreen } from "@/components/messages/messaging-inbox-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberMessageThreadPage({
  params
}: {
  params: Promise<{ threadId: string }>;
}) {
  const user = await getAuthorizedUser(["commission_barber", "booth_rent_barber"]);
  const { threadId } = await params;

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/barber/messages"
      title="Messages"
      subtitle="Stay inside the active appointment or support conversation without losing the barber-safe messaging scope."
    >
      <MessagingInboxScreen
        surface="barber"
        basePath="/dashboard/barber/messages"
        selectedThreadId={threadId}
        title="Messages"
        subtitle="Every thread stays tied to the real appointment, shop, or support relationship that created it."
      />
    </DashboardShell>
  );
}
