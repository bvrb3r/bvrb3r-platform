import { NextResponse } from "next/server";
import {
  AUTH_NO_STORE_HEADERS,
  getAuthenticatedAuthUser,
  resolveAuthenticatedNextPath,
  toAuthErrorResponse
} from "@/app/api/auth/_shared";
import { getContactVerificationDebugState } from "@/lib/auth/production-identity";

export async function GET() {
  try {
    const authUser = await getAuthenticatedAuthUser();
    const [debugState, nextPath] = await Promise.all([
      getContactVerificationDebugState(authUser),
      resolveAuthenticatedNextPath(authUser)
    ]);

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
