import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { NotificationCenterScreen } from "@/components/notifications/notification-center-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { getNotificationCenter } from "@/lib/notifications/service";
import type { Role } from "@/types/domain";

const notificationRoles: Role[] = [
  "platform_admin",
  "architect",
  "shop_owner_user",
  "owner",
  "manager",
  "front_desk",
  "barber_user",
  "barber",
  "freelance_barber",
  "booth_rent_barber",
  "client_user",
  "client"
];

export default async function NotificationsPage() {
  const user = await getAuthorizedUser(notificationRoles);
  const payload = await getNotificationCenter(user);

  return (
    <DashboardShell
      user={user}
      activeHref="/notifications"
      title="Notification center and delivery truth"
      subtitle="Your channel choices, operational alerts, quiet hours, retries, failures, and corrections stay visible here."
    >
      <NotificationCenterScreen initial={payload} />
    </DashboardShell>
  );
}

