import { z } from "zod";
import { NextResponse } from "next/server";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isPlatformAdminUser } from "@/lib/auth/demo-auth";

export const architectVerificationActionSchema = z.object({
  reason: z.string().trim().min(1).max(400),
  internalNotes: z.string().trim().max(1200).optional()
});

export async function requireArchitectAdmin() {
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

  if (!isPlatformAdminUser(user)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Architect verification access is restricted to the platform admin." }, { status: 403 })
    };
  }

  return {
    ok: true as const,
    user
  };
}
