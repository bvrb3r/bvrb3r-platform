import { NextResponse } from "next/server";
import { createGuestSessionValue, GUEST_SESSION_COOKIE } from "@/lib/guest/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL("/discover?entry=guest", url.origin));

  response.cookies.set({
    name: GUEST_SESSION_COOKIE,
    value: createGuestSessionValue("homepage"),
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/"
  });

  return response;
}
