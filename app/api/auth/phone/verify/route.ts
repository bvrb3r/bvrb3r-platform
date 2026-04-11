import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPhoneVerificationChallenge } from "@/lib/auth/production-identity";
import {
  AUTH_NO_STORE_HEADERS,
  createAuthRouteContext,
  getAuthenticatedAuthUserForRoute,
  logAuthRoute,
  readAuthJsonBody,
  toAuthErrorResponse,
  withResolvedAuthNextPath
} from "@/app/api/auth/_shared";

const schema = z.object({
  code: z.string().trim().min(4).max(8),
  phone: z.string().trim().min(7).optional()
});

export async function POST(request: NextRequest) {
  const context = createAuthRouteContext("/api/auth/phone/verify");
  try {
    logAuthRoute(context, "route_entry");
    const body = await readAuthJsonBody(request, context);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      logAuthRoute(context, "request_validation_failed", {
        issues: parsed.error.issues
      });
      return NextResponse.json({
        error: "A valid verification code is required.",
        requestId: context.requestId
      }, { status: 400, headers: AUTH_NO_STORE_HEADERS });
    }

    logAuthRoute(context, "request_body_normalized", {
      codeLength: parsed.data.code.length,
      phone: parsed.data.phone
    });
    const authUser = await getAuthenticatedAuthUserForRoute(context);
    const payload = await verifyPhoneVerificationChallenge(authUser, parsed.data.code, {
      phone: parsed.data.phone
    });
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
