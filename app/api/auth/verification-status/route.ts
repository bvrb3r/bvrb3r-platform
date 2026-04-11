import { NextResponse } from "next/server";
import { getContactVerificationState } from "@/lib/auth/production-identity";
import {
  AUTH_NO_STORE_HEADERS,
  createAuthRouteContext,
  getAuthenticatedAuthUserForRoute,
  logAuthRoute,
  toAuthErrorResponse,
  withResolvedAuthNextPath
} from "@/app/api/auth/_shared";

export async function GET() {
  const context = createAuthRouteContext("/api/auth/verification-status");
  try {
    logAuthRoute(context, "route_entry");
    const authUser = await getAuthenticatedAuthUserForRoute(context);
    const payload = await getContactVerificationState(authUser);
    const responseBody = await withResolvedAuthNextPath(authUser, payload);
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
