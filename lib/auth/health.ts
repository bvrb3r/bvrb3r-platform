import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_SESSION_COOKIE, findDemoUserByEmail } from "@/lib/auth/demo-auth";
import { isDemoMode, runtimeConfig } from "@/lib/config/runtime";
import type { Role } from "@/types/domain";

export type SessionHealthSummary = {
  mode: "demo" | "supabase";
  authenticated: boolean;
  email?: string;
  role?: Role;
  loginPath: string;
  reason?: "demo_mode" | "authenticated" | "missing_session";
};

export async function readSessionHealthFromServer(): Promise<SessionHealthSummary> {
  if (isDemoMode()) {
    return {
      mode: "demo",
      authenticated: true,
      email: runtimeConfig.demoEmail,
      role: findDemoUserByEmail(runtimeConfig.demoEmail)?.role ?? "owner",
      loginPath: "/login",
      reason: "demo_mode"
    };
  }

  const cookieStore = await cookies();
  const selectedDemoUser = findDemoUserByEmail(cookieStore.get(DEMO_SESSION_COOKIE)?.value);
  const supabase = await createSupabaseServerClient();
  const result = await supabase?.auth.getUser();
  const email = result?.data.user?.email ?? undefined;
  const mappedUser = email ? findDemoUserByEmail(email) : undefined;

  if (email) {
    return {
      mode: "supabase",
      authenticated: true,
      email,
      role: mappedUser?.role,
      loginPath: "/login",
      reason: "authenticated"
    };
  }

  if (selectedDemoUser) {
    return {
      mode: "supabase",
      authenticated: true,
      email: selectedDemoUser.email,
      role: selectedDemoUser.role,
      loginPath: "/login",
      reason: "authenticated"
    };
  }

  return {
    mode: "supabase",
    authenticated: false,
    loginPath: "/login",
    reason: "missing_session"
  };
}
