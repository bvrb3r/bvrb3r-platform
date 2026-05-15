import { cookies } from "next/headers";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isClientRole } from "@/lib/auth/roles";
import { GUEST_SESSION_COOKIE, isGuestSessionCookieValue } from "@/lib/guest/session";
import { syncReferralAttribution } from "@/lib/referrals/service";
import { CLIENT_REFERRAL_COOKIE, normalizeReferralCode } from "@/lib/referrals/session";

export async function getClientExperienceContext() {
  const session = await getCurrentUserFromServer();
  const cookieStore = await cookies();
  const referralCode = normalizeReferralCode(cookieStore.get(CLIENT_REFERRAL_COOKIE)?.value);
  const guestSessionActive = isGuestSessionCookieValue(cookieStore.get(GUEST_SESSION_COOKIE)?.value);
  const isSignedInClient = session.authenticated
    && isClientRole(session.user.role)
    && session.user.id !== "guest-user";
  const fallbackClientId = isSignedInClient ? `client-${session.user.id.slice(0, 8)}` : "";
  const clientId = isSignedInClient ? session.user.clientId ?? fallbackClientId : "";
  const isGuest = !session.authenticated;

  if (isSignedInClient && clientId && referralCode) {
    try {
      await syncReferralAttribution({
        referralCode,
        referredClientId: clientId,
        referredClientEmail: session.user.email
      });
    } catch {
      // Client context should still resolve even if referral attribution sync is unavailable.
    }
  }

  return {
    viewer: session.user,
    activeClient: isSignedInClient ? session.user : null,
    clientId,
    isSignedInClient,
    isGuest,
    guestSessionActive,
    referralCode: referralCode ?? undefined
  };
}
