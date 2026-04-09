import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendPhoneVerificationChallenge } from "@/lib/auth/production-identity";
import {
  getAuthenticatedAuthUser,
  toAuthErrorResponse,
  withResolvedAuthNextPath
} from "@/app/api/auth/_shared";

const schema = z.object({
  phone: z.string().trim().min(7)
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "A valid phone number is required." }, { status: 400 });
    }

    const authUser = await getAuthenticatedAuthUser();
    const payload = await sendPhoneVerificationChallenge(authUser, parsed.data);
    return NextResponse.json(await withResolvedAuthNextPath(authUser, payload));
  } catch (error) {
    return toAuthErrorResponse(error);
  }
}
