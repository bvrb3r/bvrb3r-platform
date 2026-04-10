import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPhoneVerificationChallenge } from "@/lib/auth/production-identity";
import {
  AUTH_NO_STORE_HEADERS,
  getAuthenticatedAuthUser,
  toAuthErrorResponse,
  withResolvedAuthNextPath
} from "@/app/api/auth/_shared";

const schema = z.object({
  code: z.string().trim().min(4).max(8)
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid verification code is required." }, { status: 400 });
    }

    const authUser = await getAuthenticatedAuthUser();
    const payload = await verifyPhoneVerificationChallenge(authUser, parsed.data.code);
    return NextResponse.json(await withResolvedAuthNextPath(authUser, payload), {
      headers: AUTH_NO_STORE_HEADERS
    });
  } catch (error) {
    return toAuthErrorResponse(error);
  }
}
