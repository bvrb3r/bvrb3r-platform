import { NextResponse } from "next/server";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { getPointsScopeForUser, readPointsHistoryForScope } from "@/lib/points/engine";

export async function GET() {
  const { user } = await getCurrentUserFromServer();
  const scope = getPointsScopeForUser(user);

  if (!scope) {
    return NextResponse.json({ error: "This account does not have BVR Points access." }, { status: 403 });
  }

  try {
    const history = await readPointsHistoryForScope(scope);
    return NextResponse.json({ history });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load BVR Points history.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
