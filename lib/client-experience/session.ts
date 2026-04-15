import { cookies } from "next/headers";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { GUEST_SESSION_COOKIE, isGuestSessionCookieValue } from "@/lib/guest/session";
import { CLIENT_REFERRAL_COOKIE, normalizeReferralCode } from "@/lib/referrals/session";

export async function getClientExperienceContext() {
  const session = await getCurrentUserFromServer();
  const cookieStore = await cookies();
  const referralCode = normalizeReferralCode(cookieStore.get(CLIENT_REFERRAL_COOKIE)?.value);
  const guestSessionActive = isGuestSessionCookieValue(cookieStore.get(GUEST_SESSION_COOKIE)?.value);
  const isSignedInClient = session.user.role === "client" && Boolean(session.user.clientId);
  const clientId = isSignedInClient ? session.user.clientId ?? "" : "";
  const isGuest = !session.authenticated;

  if (isSignedInClient && clientId && referralCode) {
    try {
      const engagementProvider = await getEngagementProvider();
      await engagementProvider.syncReferralAttribution({
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
