import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AUTH_NO_STORE_HEADERS,
  createAuthRouteContext,
  getAuthenticatedAuthUserForRoute,
  logAuthRoute,
  readAuthJsonBody,
  toAuthErrorResponse,
  withResolvedAuthNextPath
} from "@/app/api/auth/_shared";
import { updateContactVerificationProfile } from "@/lib/auth/production-identity";

const schema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().min(7),
  email: z.string().trim().email().optional()
});

export async function POST(request: NextRequest) {
  const context = createAuthRouteContext("/api/auth/contact");
  try {
    logAuthRoute(context, "route_entry");
    const body = await readAuthJsonBody(request, context);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      logAuthRoute(context, "request_validation_failed", {
        issues: parsed.error.issues
      });
      return NextResponse.json({
        error: "First name, last name, and a valid phone number are required.",
        requestId: context.requestId
      }, { status: 400, headers: AUTH_NO_STORE_HEADERS });
    }

    logAuthRoute(context, "request_body_normalized", {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      composedFullName: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
      email: parsed.data.email,
      phone: parsed.data.phone
    });
    const authUser = await getAuthenticatedAuthUserForRoute(context);
    const payload = await updateContactVerificationProfile(authUser, parsed.data);
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
