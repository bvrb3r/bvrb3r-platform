import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const LOGIN_PATH = "/login";

function hasSupabaseAuthConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function isDemoRuntime() {
  return process.env.NEXT_PUBLIC_AUTH_MODE === "demo" || !hasSupabaseAuthConfig();
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = LOGIN_PATH;
  loginUrl.search = "";
  loginUrl.searchParams.set("redirect", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  if (isDemoRuntime()) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  let response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: {
              headers: requestHeaders
            }
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return redirectToLogin(request);
  }

  return response;
}

export const config = {
  matcher: [
    "/activation-status/:path*",
    "/activity",
    "/appointments/:path*",
    "/architect/:path*",
    "/clients/:path*",
    "/command/:path*",
    "/dashboard/:path*",
    "/earnings/:path*",
    "/onboarding/:path*",
    "/post-auth/:path*",
    "/pro/:path*",
    "/queue",
    "/reports/:path*",
    "/role-select/:path*",
    "/services/:path*",
    "/settings/:path*",
    "/shop/chairs",
    "/shop/chairfill",
    "/shop/ai",
    "/shop/analytics",
    "/shop/bridge",
    "/shop/floor",
    "/shop/home",
    "/shop/identity",
    "/shop/kiosk/:path*",
    "/shop/messages/:path*",
    "/shop/money",
    "/shop/more",
    "/shop/policies",
    "/shop/rent",
    "/shop/reports",
    "/shop/schedule",
    "/shop/switch",
    "/shop/sync",
    "/shop/team",
    "/shop/tv",
    "/shop/verify",
    "/team/:path*",
    "/verify-contact/:path*",
    "/workspace/:path*"
  ]
};
