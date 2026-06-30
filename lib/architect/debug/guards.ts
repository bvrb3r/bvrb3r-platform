import { NextResponse } from "next/server";
import { hasArchitectAccess } from "@/lib/auth/guards";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import type { ArchitectActor } from "@/lib/architect/debug/types";

export async function requireArchitectDebugAccess() {
  const { authenticated, user } = await getCurrentUserFromServer();
  if (!authenticated) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Authentication is required." }, { status: 401 })
    };
  }

  if (user.accountStatus && user.accountStatus !== "active") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Account access is disabled." }, { status: 403 })
    };
  }

  if (!hasArchitectAccess(user)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Architect debug access is restricted to platform administrators." }, { status: 403 })
    };
  }

  return {
    ok: true as const,
    actor: user satisfies ArchitectActor
  };
}
