import { NextResponse } from "next/server";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getPointsScopeForUser, readPointsBalanceForScope } from "@/lib/points/engine";

export async function GET() {
  const { user } = await getCurrentUserFromServer();
  const scope = getPointsScopeForUser(user);

  if (!scope) {
    return NextResponse.json({ error: "This account does not have BVR Points access." }, { status: 403 });
  }

  try {
    const balance = await readPointsBalanceForScope(scope);
    return NextResponse.json({ balance });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load BVR Points balance.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
