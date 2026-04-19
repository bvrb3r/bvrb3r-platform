import { randomUUID } from "node:crypto";
import type { Route } from "next";
import { NextResponse } from "next/server";
import {
  applySignupRoleIntentForAuthUser,
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

export type AuthRouteContext = {
  requestId: string;
  route: string;
};

export function createAuthRouteContext(route: string): AuthRouteContext {
  return {
    requestId: randomUUID(),
    route
  };
}

export function logAuthRoute(context: AuthRouteContext, event: string, details?: Record<string, unknown>) {
  console.info(`[auth-route] ${event}`, {
    requestId: context.requestId,
    route: context.route,
    ...(details ?? {})
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unable to complete the authentication request.";
}

function getErrorDiagnostics(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  return {
    code: "code" in error ? error.code : undefined,
    details: "details" in error ? error.details : undefined,
    hint: "hint" in error ? error.hint : undefined,
    name: "name" in error ? error.name : undefined
  };
}

export async function readAuthJsonBody(request: Request, context: AuthRouteContext) {
  const rawBody = await request.text().catch(() => "");
  let body: unknown = {};

  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      logAuthRoute(context, "request_body_parse_failed", {
        rawBodyLength: rawBody.length
      });
      throw new Error("Request body must be valid JSON.");
    }
  }

  const loggedBody = body && typeof body === "object"
    ? {
        ...(body as Record<string, unknown>),
        code: "code" in body ? `[${`${(body as Record<string, unknown>).code ?? ""}`.length} chars]` : undefined
      }
    : body;

  logAuthRoute(context, "request_body_received", {
    rawBodyLength: rawBody.length,
    body: loggedBody
  });

  return body;
}

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

export async function getAuthenticatedAuthUserForRoute(context: AuthRouteContext): Promise<AuthUserLike> {
  logAuthRoute(context, "auth_lookup_started");

  try {
    const authUser = await getAuthenticatedAuthUser();
    logAuthRoute(context, "auth_lookup_succeeded", {
      userId: authUser.id,
      hasEmail: Boolean(authUser.email),
      emailVerified: Boolean(authUser.email_confirmed_at),
      hasPhone: Boolean(authUser.phone),
      phoneVerified: Boolean(authUser.phone_confirmed_at)
    });
    return authUser;
  } catch (error) {
    logAuthRoute(context, "auth_lookup_failed", {
      error: getErrorMessage(error),
      diagnostics: getErrorDiagnostics(error)
    });
    throw error;
  }
}

export async function resolveAuthenticatedNextPath(authUser: AuthUserLike): Promise<Route> {
  await applySignupRoleIntentForAuthUser(authUser);
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

export function toAuthErrorResponse(error: unknown, context?: AuthRouteContext) {
  const message = getErrorMessage(error);
  const diagnostics = getErrorDiagnostics(error);

  if (context) {
    logAuthRoute(context, "route_failed", {
      error: message,
      diagnostics
    });
  }

  if (message === "auth_required") {
    return NextResponse.json({
      error: "No authenticated server session found.",
      requestId: context?.requestId
    }, { status: 401, headers: AUTH_NO_STORE_HEADERS });
  }

  if (message === "canonical_profile_missing") {
    return NextResponse.json({
      error: "Canonical profile row could not be created or loaded for the authenticated user.",
      requestId: context?.requestId,
      diagnostics
    }, { status: 500, headers: AUTH_NO_STORE_HEADERS });
  }

  if (message.includes("verification code")) {
    return NextResponse.json({ error: message, requestId: context?.requestId }, { status: 400, headers: AUTH_NO_STORE_HEADERS });
  }

  if (message.includes("phone")) {
    return NextResponse.json({ error: message, requestId: context?.requestId }, { status: 400, headers: AUTH_NO_STORE_HEADERS });
  }

  if (message.includes("first") || message.includes("last") || message.includes("email")) {
    return NextResponse.json({ error: message, requestId: context?.requestId }, { status: 400, headers: AUTH_NO_STORE_HEADERS });
  }

  return NextResponse.json({
    error: message,
    requestId: context?.requestId,
    diagnostics
  }, { status: 500, headers: AUTH_NO_STORE_HEADERS });
}
