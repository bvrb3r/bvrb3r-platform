import { PushPermissionScreen } from "@/components/notifications/push-permission-screen";
import { getAuthorizedUser } from "@/lib/auth/guards";
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

export default async function PushPermissionPage() {
  await getAuthorizedUser(notificationRoles);
  return <PushPermissionScreen />;
}
