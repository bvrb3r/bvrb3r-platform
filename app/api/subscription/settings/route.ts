import { NextResponse } from "next/server";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { resolveSubscriptionSettingsSummaryForUser } from "@/lib/entitlements/subscription-settings";

function unauthenticatedResponse() {
  return NextResponse.json({ error: "A signed-in account is required to refresh plan status." }, { status: 401 });
}

async function readSubscriptionSettings() {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || session.user.id === "guest-user") {
    return unauthenticatedResponse();
  }

  const subscription = await resolveSubscriptionSettingsSummaryForUser({ user: session.user });
  if (!subscription) {
    return NextResponse.json({ error: "Subscription settings are available only for Client, Barber, and Shop Owner accounts." }, { status: 403 });
  }

  return NextResponse.json({ ok: true, subscription });
}

export async function GET() {
  return readSubscriptionSettings();
}

export async function POST() {
  return readSubscriptionSettings();
}
