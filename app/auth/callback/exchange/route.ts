import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildRuntimeUserFromProductionAuth, ensureCanonicalProfileForAuthUser } from "@/lib/auth/production-identity";
import { resolvePostAuthDestination } from "@/lib/onboarding/service";

const CALLBACK_REDIRECT_PATH = "/auth/callback";

type AuthCookie = Parameters<SetAllCookies>[0][number];

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `auth-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toLoginUrl(origin: string, message: string) {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", message);
  return loginUrl;
}

function describeAuthError(error: unknown) {
  if (!error || typeof error !== "object") {
    return `${error ?? "unknown error"}`;
  }

  const candidate = error as { message?: string | null; code?: string | null; status?: number | null };
  return [
    candidate.message,
    candidate.code ? `code=${candidate.code}` : null,
    candidate.status ? `status=${candidate.status}` : null
  ].filter(Boolean).join(" | ") || "unknown error";
}

function redirectWithAuthCookies(url: URL, cookiesToSet: AuthCookie[]) {
  const response = NextResponse.redirect(url);
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, options);
  }
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const requestId = createRequestId();
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");

  console.info("[auth] OAuth callback exchange entered", {
    requestId,
    origin: requestUrl.origin,
    hasCode: Boolean(code),
    hasError: Boolean(error),
    hasNext: requestUrl.searchParams.has("next")
  });

  if (error) {
    console.error("[auth] OAuth callback exchange received provider error", {
      requestId,
      error,
      errorDescription
    });
    return NextResponse.redirect(toLoginUrl(requestUrl.origin, errorDescription ?? error));
  }

  const callbackUrl = new URL(CALLBACK_REDIRECT_PATH, requestUrl.origin);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!code) {
    console.error("[auth] OAuth callback exchange missing code", {
      requestId,
      origin: requestUrl.origin
    });
    return NextResponse.redirect(toLoginUrl(requestUrl.origin, "Missing OAuth callback code."));
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[auth] OAuth callback exchange missing Supabase env", {
      requestId,
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasSupabaseAnonKey: Boolean(supabaseAnonKey)
    });
    return NextResponse.redirect(toLoginUrl(requestUrl.origin, "Supabase auth is not configured for this deployment."));
  }

  const cookieStore = await cookies();
  let authCookiesToSet: AuthCookie[] = [];
  const exchangeResponse = NextResponse.redirect(callbackUrl);
  const setAllCookies: SetAllCookies = (cookiesToSet) => {
    authCookiesToSet = cookiesToSet;
    cookiesToSet.forEach(({ name, value, options }) => {
      cookieStore.set(name, value, options);
      exchangeResponse.cookies.set(name, value, options);
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

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    console.error("[auth] Supabase OAuth code exchange failed", {
      requestId,
      error: describeAuthError(exchangeError)
    });
    return redirectWithAuthCookies(toLoginUrl(requestUrl.origin, exchangeError.message), authCookiesToSet);
  }

  console.info("[auth] Supabase OAuth code exchange succeeded", {
    requestId,
    authCookieCount: authCookiesToSet.length
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const authUser = userData.user;
  if (!authUser) {
    console.error("[auth] OAuth exchange completed but no server session user was available", {
      requestId,
      error: userError ? describeAuthError(userError) : null
    });
    return redirectWithAuthCookies(
      toLoginUrl(requestUrl.origin, "OAuth succeeded but the server session could not be established."),
      authCookiesToSet
    );
  }

  console.info("[auth] OAuth session established", {
    requestId,
    userId: authUser.id,
    email: authUser.email ?? null
  });

  try {
    const identityUser = {
      id: authUser.id,
      email: authUser.email,
      phone: authUser.phone,
      email_confirmed_at: authUser.email_confirmed_at,
      phone_confirmed_at: authUser.phone_confirmed_at,
      user_metadata: authUser.user_metadata as Record<string, unknown> | undefined
    };

    await ensureCanonicalProfileForAuthUser(identityUser);
    const runtimeUser = await buildRuntimeUserFromProductionAuth(identityUser);
    const destination = await resolvePostAuthDestination(runtimeUser);

    console.info("[auth] OAuth callback next path resolved", {
      requestId,
      userId: authUser.id,
      destination
    });

    return redirectWithAuthCookies(new URL(destination, requestUrl.origin), authCookiesToSet);
  } catch (routingError) {
    console.error("[auth] OAuth callback post-auth resolution failed; falling back to /post-auth", {
      requestId,
      userId: authUser.id,
      error: describeAuthError(routingError)
    });
    return redirectWithAuthCookies(new URL("/post-auth", requestUrl.origin), authCookiesToSet);
  }
}
