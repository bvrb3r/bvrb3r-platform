import { NextResponse } from "next/server";
import {
  AUTH_NO_STORE_HEADERS,
  createAuthRouteContext,
  getAuthenticatedAuthUserForRoute,
  logAuthRoute,
  toAuthErrorResponse
} from "@/app/api/auth/_shared";
import { buildRuntimeUserFromProductionAuth } from "@/lib/auth/production-identity";
import { getContactVerificationDebugState } from "@/lib/auth/production-identity";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

export async function GET() {
  const context = createAuthRouteContext("/api/auth/debug-contact-state");
  try {
    logAuthRoute(context, "route_entry");
    const authUser = await getAuthenticatedAuthUserForRoute(context);
    const debugState = await getContactVerificationDebugState(authUser);
    const contactComplete = Boolean(debugState.computed.contactComplete);
    const requiresRoleSelection = Boolean(debugState.computed.requiresRoleSelection);
    let nextPath: string;
    if (!contactComplete) {
      nextPath = "/verify-contact";
    } else if (requiresRoleSelection) {
      nextPath = "/role-select";
    } else {
      nextPath = await resolvePostAuthDestination(await buildRuntimeUserFromProductionAuth(authUser));
    }
    const responseBody = {
      userId: authUser.id,
      profile: debugState.profile,
      computed: debugState.computed,
      nextPath
    };

    logAuthRoute(context, "route_response", {
      status: 200,
      responseBody
    });

    return NextResponse.json(responseBody, {
      headers: AUTH_NO_STORE_HEADERS
    });
  } catch (error) {
    return toAuthErrorResponse(error, context);
  }
}
