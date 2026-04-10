import type { Route } from "next";
import { NextResponse } from "next/server";
import {
  buildRuntimeUserFromProductionAuth,
  getContactVerificationState
} from "@/lib/auth/production-identity";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config/runtime";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const AUTH_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate"
} as const;

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

export async function resolveAuthenticatedNextPath(authUser: AuthUserLike): Promise<Route> {
  const contactState = await getContactVerificationState(authUser);
  console.info("[auth] resolve next path contact gate", {
    userId: authUser.id,
    fullName: contactState.fullName,
    email: contactState.email,
    phone: contactState.phone,
    missingFields: contactState.missingFields,
    onboardingState: contactState.onboardingState,
    canContinue: contactState.canContinue,
    requiresRoleSelection: contactState.requiresRoleSelection
  });

  if (!contactState.canContinue) {
    console.info("[auth] resolve next path result", {
      userId: authUser.id,
      reason: "contact_incomplete",
      nextPath: "/verify-contact"
    });
    return "/verify-contact";
  }

  if (contactState.requiresRoleSelection) {
    console.info("[auth] resolve next path result", {
      userId: authUser.id,
      reason: "role_selection_required",
      nextPath: "/role-select"
    });
    return "/role-select";
  }

  const runtimeUser = await buildRuntimeUserFromProductionAuth(authUser);
  const nextPath = await resolvePostAuthDestination(runtimeUser);
  console.info("[auth] resolve next path result", {
    userId: authUser.id,
    runtimeRole: runtimeUser.role,
    accountStatus: runtimeUser.accountStatus,
    primaryOnboardingRole: runtimeUser.primaryOnboardingRole,
    onboardingState: runtimeUser.onboardingState,
    nextPath
  });
  return nextPath;
}

export async function withResolvedAuthNextPath<T extends Record<string, unknown>>(
  authUser: AuthUserLike,
  payload: T
): Promise<T & { nextPath: Route }> {
  return {
    ...payload,
    nextPath: await resolveAuthenticatedNextPath(authUser)
  };
}

export function toAuthErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to complete the authentication request.";
  if (message === "auth_required") {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  if (message === "canonical_profile_missing") {
    return NextResponse.json({
      error: "We could not create or load your account profile. Please sign out and try again."
    }, { status: 500, headers: AUTH_NO_STORE_HEADERS });
  }

  if (message.includes("verification code")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (message.includes("phone")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (message.includes("first") || message.includes("last") || message.includes("email")) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ error: message }, { status: 500 });
}
