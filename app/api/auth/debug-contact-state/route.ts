import { NextResponse } from "next/server";
import {
  AUTH_NO_STORE_HEADERS,
  getAuthenticatedAuthUser,
  toAuthErrorResponse
} from "@/app/api/auth/_shared";
import { buildRuntimeUserFromProductionAuth } from "@/lib/auth/production-identity";
import { getContactVerificationDebugState } from "@/lib/auth/production-identity";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

export async function GET() {
  try {
    const authUser = await getAuthenticatedAuthUser();
    const debugState = await getContactVerificationDebugState(authUser);
    const nextPath = !debugState.computed.contactComplete
      ? "/verify-contact"
      : debugState.computed.requiresRoleSelection
        ? "/role-select"
        : await resolvePostAuthDestination(await buildRuntimeUserFromProductionAuth(authUser));

    return NextResponse.json({
      userId: authUser.id,
      profile: debugState.profile,
      computed: debugState.computed,
      nextPath
    }, {
      headers: AUTH_NO_STORE_HEADERS
    });
  } catch (error) {
    return toAuthErrorResponse(error);
  }
}
