import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MessagingInboxScreen } from "@/components/messages/messaging-inbox-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function BarberMessagesPage() {
  const user = await getAuthorizedUser(["shop_owner_user", "manager", "front_desk", "barber_user"]);
  const isShopSurface = user.role === "owner" || user.role === "manager" || user.role === "front_desk";

  if (!isShopSurface) {
    redirect("/dashboard/barber/messages");
  }

  return (
    <DashboardShell
      user={user}
      activeHref="/workspace/messages"
      title={isShopSurface ? "Shop conversations" : "Client conversations"}
      subtitle={
        isShopSurface
          ? "Run shop messaging, direct location threads, and broadcasts without leaving the protected staff workspace."
          : "Keep appointment communication clean, professional, and limited to the chair relationships you already own."
      }
    >
      <MessagingInboxScreen
        surface={isShopSurface ? "shop" : "barber"}
        basePath="/workspace/messages"
        title={isShopSurface ? "Shop conversations" : "Client conversations"}
        subtitle={
          isShopSurface
            ? "Open direct client and barber lines from real location relationships, then broadcast through the same canonical thread system when the floor needs a wider update."
            : "Message clients from real appointment threads only, so the shop floor stays clear and the communication stays professional."
        }
      />
    </DashboardShell>
  );
}
