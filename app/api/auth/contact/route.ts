import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AUTH_NO_STORE_HEADERS,
  getAuthenticatedAuthUser,
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
  try {
    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "First name, last name, and a valid phone number are required." }, { status: 400 });
    }

    const authUser = await getAuthenticatedAuthUser();
    const payload = await updateContactVerificationProfile(authUser, parsed.data);
    return NextResponse.json(await withResolvedAuthNextPath(authUser, payload), {
      headers: AUTH_NO_STORE_HEADERS
    });
  } catch (error) {
    return toAuthErrorResponse(error);
  }
}
