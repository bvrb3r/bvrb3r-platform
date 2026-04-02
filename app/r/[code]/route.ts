import { NextResponse } from "next/server";
import { buildReferralCookieOptions, CLIENT_REFERRAL_COOKIE, normalizeReferralCode } from "@/lib/referrals/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const requestUrl = new URL(request.url);
  const { code } = await params;
  const normalizedCode = normalizeReferralCode(code);
  const redirectUrl = new URL("/discover", requestUrl.origin);

  if (normalizedCode) {
    redirectUrl.searchParams.set("ref", normalizedCode);
  }

  const response = NextResponse.redirect(redirectUrl);
  if (normalizedCode) {
    response.cookies.set(CLIENT_REFERRAL_COOKIE, normalizedCode, buildReferralCookieOptions());
  }

  return response;
}
