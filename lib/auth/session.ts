import { cookies } from "next/headers";
import { buildRuntimeUserFromProductionAuth, applySignupRoleIntentForAuthUser } from "@/lib/auth/production-identity";
import { DEMO_SESSION_COOKIE, resolveDemoUser } from "@/lib/auth/demo-auth";
import { applyInternalOperatorAccessOverlay } from "@/lib/auth/internal-operator";
import { SIGNUP_ROLE_INTENT_COOKIE } from "@/lib/auth/signup-role-intent";
import { isDemoMode, runtimeConfig } from "@/lib/config/runtime";
import { applyPlatformAdminOverlay } from "@/lib/platform-admin/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserAccount } from "@/types/domain";

const unauthenticatedUser: UserAccount = {
  id: "guest-user",
  role: "client_user",
  email: "guest@bvrb3r.local",
  password: "",
  name: "Guest",
  title: "Guest",
  locationIds: [],
  accountStatus: "profile_only"
};

async function applySessionOverlays(user: UserAccount) {
  const operatorResolvedUser = await applyInternalOperatorAccessOverlay(user);
  return applyPlatformAdminOverlay(operatorResolvedUser);
}

export async function getCurrentUserFromServer() {
  const cookieStore = await cookies();
  const selectedDemoEmail = cookieStore.get(DEMO_SESSION_COOKIE)?.value;

  if (isDemoMode()) {
    return {
      mode: "demo" as const,
      authenticated: true,
      user: await applySessionOverlays(resolveDemoUser(selectedDemoEmail, runtimeConfig.demoEmail))
    };
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase?.auth.getUser();
  const authUser = result?.data.user;

  if (!authUser) {
    return {
      mode: "supabase" as const,
      authenticated: false,
      user: await applySessionOverlays(unauthenticatedUser)
    };
  }

  const identityUser = {
    id: authUser.id,
    email: authUser.email,
    phone: authUser.phone,
    email_confirmed_at: authUser.email_confirmed_at,
    phone_confirmed_at: authUser.phone_confirmed_at,
    user_metadata: authUser.user_metadata as Record<string, unknown> | undefined
  };

  await applySignupRoleIntentForAuthUser(identityUser, cookieStore.get(SIGNUP_ROLE_INTENT_COOKIE)?.value);
  const runtimeUser = await buildRuntimeUserFromProductionAuth(identityUser);

  return {
    mode: "supabase" as const,
    authenticated: true,
    user: await applySessionOverlays(runtimeUser)
  };
}
