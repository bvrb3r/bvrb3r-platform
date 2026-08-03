import { NotificationCenterScreen } from "@/components/notifications/notification-center-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { getNotificationCenter } from "@/lib/notifications/service";
import { normalizeAccountRole } from "@/lib/auth/roles";
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
  const role = normalizeAccountRole(user.role);
  const roleLabel = role === "client"
    ? "Client"
    : role === "barber" || role === "booth_rent_barber" || role === "freelance_barber"
      ? "Barber"
      : role === "owner" || role === "shop_owner_user"
        ? "Owner"
        : role === "architect" || role === "platform_admin"
          ? "Architect"
          : "Team";

  return <NotificationCenterScreen initial={payload} roleLabel={roleLabel} />;
}
