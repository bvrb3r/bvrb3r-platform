import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  SIGNUP_ROLE_INTENT_COOKIE,
  SIGNUP_ROLE_INTENT_MAX_AGE_SECONDS
} from "@/lib/auth/signup-role-intent";

const schema = z.object({
  role: z.enum(["client", "barber", "shop_owner"])
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid role before continuing." }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SIGNUP_ROLE_INTENT_COOKIE, parsed.data.role, {
    httpOnly: true,
    maxAge: SIGNUP_ROLE_INTENT_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}
