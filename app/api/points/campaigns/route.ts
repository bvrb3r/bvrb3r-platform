import { NextResponse } from "next/server";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getPointsScopeForUser, readPointsCampaignsForRole } from "@/lib/points/engine";

export async function GET() {
  const { user } = await getCurrentUserFromServer();
  const scope = getPointsScopeForUser(user);

  if (!scope) {
    return NextResponse.json({ error: "This account does not have BVR Points access." }, { status: 403 });
  }

  try {
    const campaigns = await readPointsCampaignsForRole(scope.role);
    return NextResponse.json({ campaigns });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load BVR Points campaigns.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
