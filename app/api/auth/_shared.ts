import { NextResponse } from "next/server";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthUserLike = {
  id: string;
  email?: string | null;
  phone?: string | null;
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
};

export async function getAuthenticatedAuthUser(): Promise<AuthUserLike> {
  if (isDemoMode()) {
    const session = await getCurrentUserFromServer();
    if (!session.authenticated) {
      throw new Error("auth_required");
    }

    return {
      id: session.user.id,
      email: session.user.email,
      phone: session.user.phone,
      email_confirmed_at: session.user.emailVerified === false ? null : new Date().toISOString(),
      phone_confirmed_at: session.user.phoneVerified === false ? null : new Date().toISOString(),
      user_metadata: {
        full_name: session.user.name,
        phone: session.user.phone ?? ""
      }
    };
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase?.auth.getUser();
  if (!result?.data.user) {
    throw new Error("auth_required");
  }

  return {
    id: result.data.user.id,
    email: result.data.user.email,
    phone: result.data.user.phone,
    email_confirmed_at: result.data.user.email_confirmed_at,
    phone_confirmed_at: result.data.user.phone_confirmed_at,
    user_metadata: result.data.user.user_metadata as Record<string, unknown> | undefined
  };
}

export function toAuthErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to complete the authentication request.";
  if (message === "auth_required") {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  if (message.includes("verification code")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (message.includes("phone")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ error: message }, { status: 500 });
}
