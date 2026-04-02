export const CLIENT_REFERRAL_COOKIE = "bvrb3r_referral_code";
const REFERRAL_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function normalizeReferralCode(value?: string | null) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return normalized || null;
}

export function buildReferralCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS
  };
}
