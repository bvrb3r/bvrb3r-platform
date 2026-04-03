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
    throw new Error("onboarding_auth_required");
  }

  return (await getCurrentUserFromServer()).user;
}

export function toOnboardingErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to complete the onboarding request.";
  if (message === "onboarding_auth_required") {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  if (message === "onboarding_role_forbidden") {
    return NextResponse.json({ error: "This account cannot launch that onboarding lane." }, { status: 403 });
  }

  if (message === "onboarding_role_mismatch") {
    return NextResponse.json({ error: "Finish or resume your current onboarding lane first." }, { status: 409 });
  }

  if (message === "contact_verification_required") {
    return NextResponse.json({ error: "Verify email and phone before selecting a lane." }, { status: 409 });
  }

  if (message === "shop_name_required") {
    return NextResponse.json({ error: "A shop name is required to open the owner lane." }, { status: 400 });
  }

  return NextResponse.json({ error: message }, { status: 500 });
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
