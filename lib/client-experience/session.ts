import { cookies } from "next/headers";
import { findDemoUserByRole } from "@/lib/auth/demo-auth";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getEngagementProvider } from "@/lib/engagement/provider";
import { CLIENT_REFERRAL_COOKIE, normalizeReferralCode } from "@/lib/referrals/session";

export async function getClientExperienceContext() {
  const session = await getCurrentUserFromServer();
  const cookieStore = await cookies();
  const fallbackClient = findDemoUserByRole("client");

  if (!fallbackClient) {
    throw new Error("Client demo user is required for the client experience layer.");
  }

  const activeClient = session.user.role === "client" ? session.user : fallbackClient;
  const referralCode = normalizeReferralCode(cookieStore.get(CLIENT_REFERRAL_COOKIE)?.value);

  if (session.user.role === "client" && activeClient.clientId && referralCode) {
    try {
      const engagementProvider = await getEngagementProvider();
      await engagementProvider.syncReferralAttribution({
        referralCode,
        referredClientId: activeClient.clientId,
        referredClientEmail: activeClient.email
      });
    } catch {
      // Client context should still resolve even if referral attribution sync is unavailable.
    }
  }

  return {
    viewer: session.user,
    activeClient,
    clientId: activeClient.clientId ?? fallbackClient.clientId ?? "",
    isSignedInClient: session.user.role === "client",
    referralCode: referralCode ?? undefined
  };
}
