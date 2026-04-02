import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isPlatformAdminUser } from "@/lib/auth/demo-auth";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { KIOSK_DEVICE_COOKIE, parseKioskDeviceCookieValue } from "@/lib/kiosk/device";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const [{ user, authenticated }, cookieStore] = await Promise.all([getCurrentUserFromServer(), cookies()]);
  if (!authenticated) {
    redirect("/login");
  }
  const kioskShopId = parseKioskDeviceCookieValue(cookieStore.get(KIOSK_DEVICE_COOKIE)?.value);

  if (kioskShopId && !isPlatformAdminUser(user) && (user.role === "owner" || user.role === "manager" || user.role === "front_desk")) {
    redirect(`/kiosk/${kioskShopId}`);
  }

  return <>{children}</>;
}
