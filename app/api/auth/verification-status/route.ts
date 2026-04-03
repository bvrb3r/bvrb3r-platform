import { NextResponse } from "next/server";
import { getContactVerificationState } from "@/lib/auth/production-identity";
import { getAuthenticatedAuthUser, toAuthErrorResponse } from "@/app/api/auth/_shared";

export async function GET() {
  try {
    const authUser = await getAuthenticatedAuthUser();
    const payload = await getContactVerificationState(authUser);
    return NextResponse.json(payload);
  } catch (error) {
    return toAuthErrorResponse(error);
  }
}
