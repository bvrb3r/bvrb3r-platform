import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { DEMO_SESSION_COOKIE } from "@/lib/auth/demo-auth";

export const dynamic = "force-dynamic";

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function POST(request: NextRequest) {
  const response = noStore(NextResponse.json({ ok: true }));
  response.cookies.set(DEMO_SESSION_COOKIE, "", {
    path: "/",
    maxAge: 0,
    sameSite: "lax"
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.info("[auth] logout completed without Supabase config");
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
        status: error.status
      });
    } else {
      console.info("[auth] logout completed");
    }
  } catch (error) {
    console.error("[auth] logout failed before cookies could be fully cleared", error);
    const errorResponse = noStore(NextResponse.json({
      ok: false,
      error: "LOGOUT_FAILED",
      message: error instanceof Error ? error.message : "Unable to complete logout."
    }, { status: 500 }));
    errorResponse.cookies.set(DEMO_SESSION_COOKIE, "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax"
    });
    return errorResponse;
  }

  return response;
}
