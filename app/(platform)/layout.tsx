import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProtectedSessionBoundary } from "@/components/auth/protected-session-boundary";
import { isPlatformAdminUser } from "@/lib/auth/demo-auth";
import { normalizeAccountRole } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { assertPr34BillingRiskAction } from "@/lib/billing/pr34-service";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { roleToEntitlementRole } from "@/lib/entitlements/domain";
import { KIOSK_DEVICE_COOKIE, parseKioskDeviceCookieValue } from "@/lib/kiosk/device";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const [{ user, authenticated }, cookieStore] = await Promise.all([getCurrentUserFromServer(), cookies()]);
  if (!authenticated) {
    redirect("/login");
  }

  const canonicalRole = normalizeAccountRole(user.role);
  if (isSupabaseEnabled() && roleToEntitlementRole(canonicalRole)) {
    try {
      await assertPr34BillingRiskAction({
        user: { id: user.id, role: canonicalRole },
        action: "booking"
      });
    } catch {
      // The balance lock is global for canonical app shells. `/locked` lives
      // outside this layout so the user can always review, dispute, or pay.
      redirect("/locked");
    }
  }

  const kioskShopId = parseKioskDeviceCookieValue(cookieStore.get(KIOSK_DEVICE_COOKIE)?.value);

  if (kioskShopId && !isPlatformAdminUser(user) && (user.role === "owner" || user.role === "manager" || user.role === "front_desk")) {
    redirect(`/kiosk/shop/${kioskShopId}`);
  }

  return (
    <>
      <ProtectedSessionBoundary />
      {children}
    </>
  );
}
