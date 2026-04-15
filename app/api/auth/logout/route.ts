import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { DEMO_SESSION_COOKIE } from "@/lib/auth/demo-auth";
import { isSessionIsolationCookieName } from "@/lib/auth/session-isolation";

export const dynamic = "force-dynamic";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

function expireCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    sameSite: "lax"
  });
}

function expireSessionCookies(request: NextRequest, response: NextResponse) {
  const cookieNames = new Set([
    DEMO_SESSION_COOKIE,
    ...request.cookies.getAll().map((cookie) => cookie.name).filter(isSessionIsolationCookieName)
  ]);

  cookieNames.forEach((name) => expireCookie(response, name));
  return [...cookieNames];
}

export async function POST(request: NextRequest) {
  const response = noStore(NextResponse.json({ ok: true }));
  const expiredCookieNames = expireSessionCookies(request, response);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.info("[auth] logout completed without Supabase config", { expiredCookieNames });
    return response;
  }

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    });

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn("[auth] logout signOut returned a non-fatal error", {
        message: error.message,
        status: error.status,
        expiredCookieNames
      });
    } else {
      console.info("[auth] logout completed", { expiredCookieNames });
    }
  } catch (error) {
    console.error("[auth] logout failed before cookies could be fully cleared", error);
    const errorResponse = noStore(NextResponse.json({
      ok: false,
      error: "LOGOUT_FAILED",
      message: error instanceof Error ? error.message : "Unable to complete logout."
    }, { status: 500 }));
    expireSessionCookies(request, errorResponse);
    return errorResponse;
  }

  return response;
}
