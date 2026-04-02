import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const DEFAULT_REDIRECT_PATH = "/post-auth";

function resolveNextPath(requestUrl: URL) {
  const next = requestUrl.searchParams.get("next");
  if (!next || !next.startsWith("/")) {
    return DEFAULT_REDIRECT_PATH;
  }

  return next;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  if (error) {
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("error", errorDescription ?? error);
    return NextResponse.redirect(loginUrl);
  }

  const redirectPath = resolveNextPath(requestUrl);
  const redirectUrl = new URL(redirectPath, requestUrl.origin);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!code || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(redirectUrl);
  }

  const cookieStore = await cookies();
  const response = NextResponse.redirect(redirectUrl);
  const setAllCookies: SetAllCookies = (cookiesToSet) => {
    cookiesToSet.forEach(({ name, value, options }) => {
      cookieStore.set(name, value, options);
      response.cookies.set(name, value, options);
    });
  };

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll: setAllCookies
    }
  });

  await supabase.auth.exchangeCodeForSession(code);
  return response;
}
