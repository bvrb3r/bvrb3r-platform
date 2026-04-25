import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MessagingInboxScreen } from "@/components/messages/messaging-inbox-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberMessageThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const user = await getAuthorizedUser(["owner", "manager", "front_desk", "commission_barber", "booth_rent_barber"]);
  const { threadId } = await params;
  const isShopSurface = user.role === "owner" || user.role === "manager" || user.role === "front_desk";

  if (!isShopSurface) {
    redirect(`/dashboard/barber/messages/${threadId}`);
  }

  return (
    <DashboardShell
      user={user}
      activeHref="/workspace/messages"
      title={isShopSurface ? "Shop conversations" : "Client conversations"}
      subtitle={
        isShopSurface
          ? "Keep location conversations, broadcasts, and direct client or barber follow-up visible in one protected workspace."
          : "Keep appointment communication clean, professional, and limited to the chair relationships you already own."
      }
    >
      <MessagingInboxScreen
        surface={isShopSurface ? "shop" : "barber"}
        basePath="/workspace/messages"
        selectedThreadId={threadId}
        title={isShopSurface ? "Shop conversations" : "Client conversations"}
        subtitle={
          isShopSurface
            ? "Every shop conversation stays tied to real location scope and existing participants, even when the message started as a broadcast."
            : "Message clients from real appointment threads only, so the shop floor stays clear and the communication stays professional."
        }
      />
    </DashboardShell>
  );
}
