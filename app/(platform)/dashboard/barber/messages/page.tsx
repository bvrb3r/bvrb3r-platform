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
      subtitle="Keep client, appointment, and support conversations in one barber-safe inbox without leaving the chair workflow."
    >
      <MessagingInboxScreen
        surface="barber"
        basePath="/dashboard/barber/messages"
        title="Messages"
        subtitle="Message clients from real appointment threads only, with shop and support contact still grounded in the same canonical conversation system."
      />
    </DashboardShell>
  );
}
