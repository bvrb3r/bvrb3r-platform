import { NextResponse } from "next/server";
import { readPublicBarberProfile } from "@/lib/marketplace/public-read-service";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { areProfilesCultureBlocked } from "@/lib/trust/product-pr31-blocks";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const identifier = id.trim();

  if (!identifier || identifier.length > 160) {
    return NextResponse.json({ error: "Invalid Barber identifier." }, { status: 400 });
  }

  try {
    const payload = await readPublicBarberProfile(identifier);
    if (!payload) {
      return NextResponse.json(
        { error: "Barber profile not found.", code: "barber_profile_not_found" },
        { status: 404 }
      );
    }
    const hasSessionCredential = Boolean(request.headers.get("cookie") || request.headers.get("authorization"));
    const session = hasSessionCredential ? await getCurrentUserFromServer() : null;
    if (session?.authenticated && session.user.id !== "guest-user" && isSupabaseEnabled()) {
      const supabase = createSupabaseAdminClient();
      if (!supabase) throw new Error("Unable to verify public profile access.");
      if (await areProfilesCultureBlocked(supabase, session.user.id, payload.barber.userId)) {
        return NextResponse.json(
          { error: "Barber profile not found.", code: "barber_profile_not_found" },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(payload);
  } catch {
    console.error("[barbers-api] public profile unavailable", {
      reference: "public_barber_profile_load_failed"
    });
    return NextResponse.json(
      { error: "Barber profile is temporarily unavailable.", code: "public_barber_profile_load_failed" },
      { status: 500 }
    );
  }
}
