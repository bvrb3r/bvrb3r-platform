import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { isDemoMode } from "@/lib/config/runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserAccount } from "@/types/domain";
import type { OnboardingRole } from "@/types/onboarding";

export const onboardingRoleSchema = z.enum(["client", "barber", "shop_owner"]);

export async function getOnboardingSessionUser() {
  if (isDemoMode()) {
    return (await getCurrentUserFromServer()).user;
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase?.auth.getUser();
  if (!result?.data.user) {
    console.error("[onboarding-route] authenticated Supabase user missing", {
      hasSupabaseClient: Boolean(supabase),
      error: result?.error
    });
    throw new Error("onboarding_auth_required");
  }

  console.info("[onboarding-route] authenticated Supabase user resolved", {
    userId: result.data.user.id,
    hasEmail: Boolean(result.data.user.email)
  });

  return (await getCurrentUserFromServer()).user;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Unable to complete the onboarding request.";
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

export function toOnboardingErrorResponse(error: unknown) {
  const message = getErrorMessage(error);
  const diagnostics = getErrorDiagnostics(error);
  console.error("[onboarding-route] request failed", {
    error: message,
    diagnostics
  });

  if (message === "onboarding_auth_required") {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  if (message === "CONTACT_NOT_COMPLETE" || message === "contact_verification_required") {
    return NextResponse.json({
      error: "CONTACT_NOT_COMPLETE",
      message: "Contact verification is incomplete.",
      code: "CONTACT_NOT_COMPLETE",
      diagnostics
    }, { status: 409 });
  }

  if (message === "ACTIVE_LANE_LOCKED" || message === "onboarding_role_forbidden" || message === "onboarding_role_mismatch") {
    return NextResponse.json({
      error: "ACTIVE_LANE_LOCKED",
      message: "An active completed lane is already locked for this account.",
      code: "ACTIVE_LANE_LOCKED",
      diagnostics
    }, { status: 409 });
  }

  if (message.startsWith("SERVER_WRITE_FAILED")) {
    return NextResponse.json({
      error: "SERVER_WRITE_FAILED",
      message,
      code: "SERVER_WRITE_FAILED",
      diagnostics
    }, { status: 500 });
  }

  if (message === "shop_name_required") {
    return NextResponse.json({ error: "A shop name is required to open the owner lane." }, { status: 400 });
  }

  return NextResponse.json({ error: message, diagnostics }, { status: 500 });
}

export function roleToRuntimeRole(role: OnboardingRole): UserAccount["role"] {
  if (role === "client") {
    return "client_user";
  }

  if (role === "shop_owner") {
    return "shop_owner_user";
  }

  return "barber_user";
}
