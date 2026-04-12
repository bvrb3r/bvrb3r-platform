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

  if (message === "onboarding_role_forbidden") {
    return NextResponse.json({
      error: "Lane launch blocked because this account is already assigned to a different active lane.",
      code: message,
      diagnostics
    }, { status: 403 });
  }

  if (message === "onboarding_role_mismatch") {
    return NextResponse.json({
      error: "Lane launch blocked because an official onboarding lane is already selected.",
      code: message,
      diagnostics
    }, { status: 409 });
  }

  if (message === "contact_verification_required") {
    return NextResponse.json({
      error: "Lane launch blocked because contact verification is incomplete.",
      code: message,
      diagnostics
    }, { status: 409 });
  }

  if (message === "shop_name_required") {
    return NextResponse.json({ error: "A shop name is required to open the owner lane." }, { status: 400 });
  }

  return NextResponse.json({ error: message, diagnostics }, { status: 500 });
}

export function roleToRuntimeRole(role: OnboardingRole, profileData: Record<string, unknown>): UserAccount["role"] {
  if (role === "client") {
    return "client";
  }

  if (role === "shop_owner") {
    return "owner";
  }

  return profileData.compensationModel === "commission" ? "commission_barber" : "booth_rent_barber";
}
