import { cookies } from "next/headers";
import { DEMO_SESSION_COOKIE, findDemoUserByEmail, resolveDemoUser } from "@/lib/auth/demo-auth";
import { isDemoMode, runtimeConfig } from "@/lib/config/runtime";
import { getActivationStatusForUser, getOnboardingSummaryForRuntimeUser } from "@/lib/onboarding/service";
import { applyPlatformAdminOverlay } from "@/lib/platform-admin/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Role, UserAccount } from "@/types/domain";

function titleForRole(role: Role) {
  switch (role) {
    case "owner":
      return "Shop Owner";
    case "commission_barber":
      return "Commission Barber";
    case "booth_rent_barber":
      return "Barber";
    case "client":
      return "Client";
    default:
      return "Account";
  }
}

function synthesizeRuntimeRole(
  selectedRole: "client" | "barber" | "shop_owner" | null | undefined,
  profileData: Record<string, unknown>
): Role {
  if (selectedRole === "shop_owner") {
    return "owner";
  }

  if (selectedRole === "barber") {
    return profileData.compensationModel === "commission" ? "commission_barber" : "booth_rent_barber";
  }

  return "client";
}

async function createRuntimeUserFromSupabaseAuth(authUser: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): Promise<UserAccount> {
  const summary = await getOnboardingSummaryForRuntimeUser(authUser.id).catch(() => ({
    selectedRole: null,
    current: undefined,
    lanes: []
  }));
  const role = synthesizeRuntimeRole(summary.selectedRole, summary.current?.profileData ?? {});
  const metadata = authUser.user_metadata ?? {};
  const fullName = typeof metadata.full_name === "string" && metadata.full_name.trim()
    ? metadata.full_name.trim()
    : typeof metadata.name === "string" && metadata.name.trim()
      ? metadata.name.trim()
      : (authUser.email?.split("@")[0] ?? "New account");

  const runtimeUser: UserAccount = {
    id: authUser.id,
    role,
    email: authUser.email ?? `${authUser.id}@local.bvrb3r`,
    password: "",
    name: fullName,
    title: titleForRole(role),
    locationIds: [],
    accountStatus: "profile_only",
    barberId: typeof summary.current?.profileData.barberId === "string" ? summary.current.profileData.barberId : undefined,
    clientId: typeof summary.current?.profileData.clientId === "string" ? summary.current.profileData.clientId : undefined
  };

  const activation = await getActivationStatusForUser(runtimeUser).catch(() => null);
  if (activation?.lanes.some((lane) => lane.isActive)) {
    runtimeUser.accountStatus = "active";
  }

  return runtimeUser;
}

export async function getCurrentUserFromServer() {
  const cookieStore = await cookies();
  const selectedDemoEmail = cookieStore.get(DEMO_SESSION_COOKIE)?.value;

  if (isDemoMode()) {
    return {
      mode: "demo" as const,
      authenticated: true,
      user: await applyPlatformAdminOverlay(resolveDemoUser(selectedDemoEmail, runtimeConfig.demoEmail))
    };
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase?.auth.getUser();
  const authUser = result?.data.user;
  const email = authUser?.email;
  const resolvedDemoUser = findDemoUserByEmail(selectedDemoEmail);
  const runtimeUser = authUser && !findDemoUserByEmail(email) && !resolvedDemoUser
    ? await createRuntimeUserFromSupabaseAuth({
        id: authUser.id,
        email: authUser.email,
        user_metadata: authUser.user_metadata as Record<string, unknown> | undefined
      })
    : null;

  const unauthenticatedUser: UserAccount = {
    id: "guest-user",
    role: "client",
    email: "guest@bvrb3r.local",
    password: "",
    name: "Guest",
    title: "Guest",
    locationIds: [],
    accountStatus: "profile_only"
  };

  return {
    mode: "supabase" as const,
    authenticated: Boolean(authUser) || Boolean(resolvedDemoUser),
    user: await applyPlatformAdminOverlay(
      runtimeUser ?? findDemoUserByEmail(email) ?? resolvedDemoUser ?? unauthenticatedUser
    )
  };
}
