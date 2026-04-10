import { NextResponse } from "next/server";
import { getContactVerificationState } from "@/lib/auth/production-identity";
import {
  AUTH_NO_STORE_HEADERS,
  getAuthenticatedAuthUser,
  toAuthErrorResponse,
  withResolvedAuthNextPath
} from "@/app/api/auth/_shared";

export async function GET() {
  try {
    const authUser = await getAuthenticatedAuthUser();
    const payload = await getContactVerificationState(authUser);
    return NextResponse.json(await withResolvedAuthNextPath(authUser, payload), {
      headers: AUTH_NO_STORE_HEADERS
    });
  } catch (error) {
    return toAuthErrorResponse(error);
  }
}
