import { NextRequest, NextResponse } from "next/server";
import { DEMO_SESSION_COOKIE, findDemoUserByEmail, getDefaultRouteForUser } from "@/lib/auth/demo-auth";
import { KIOSK_DEVICE_COOKIE } from "@/lib/kiosk/device";

const DEMO_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function createDemoSessionResponse(response: NextResponse, email: string) {
  response.cookies.set(DEMO_SESSION_COOKIE, email, {
    httpOnly: true,
    maxAge: DEMO_SESSION_MAX_AGE,
    path: "/",
    sameSite: "lax"
  });

  return response;
}

function clearDemoSession(response: NextResponse) {
  response.cookies.delete(DEMO_SESSION_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email") ?? undefined;
  const user = findDemoUserByEmail(email);

  if (!user) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    return clearDemoSession(response);
  }

  const response = NextResponse.redirect(new URL(getDefaultRouteForUser(user), request.url));
  return createDemoSessionResponse(response, user.email);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { email?: unknown; unlockKiosk?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email : undefined;
  const unlockKiosk = typeof body?.unlockKiosk === "string" ? body.unlockKiosk.trim() : "";
  const user = findDemoUserByEmail(email);

  if (!user) {
    const response = NextResponse.json({ error: "Demo account not found." }, { status: 400 });
    return clearDemoSession(response);
  }

  const response = NextResponse.json({ redirectTo: getDefaultRouteForUser(user) });
  if (unlockKiosk) {
    response.cookies.delete(KIOSK_DEVICE_COOKIE);
  }
  return createDemoSessionResponse(response, user.email);
}
