"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthSessionRecoveryMode = "callback" | "public";

function parseAuthHash(hash: string) {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    type: params.get("type"),
    error: params.get("error"),
    errorDescription: params.get("error_description")
  };
}

function removeHashFromUrl() {
  if (typeof window === "undefined" || !window.location.hash) {
    return;
  }

  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
}

function isJsdomRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  return /jsdom/i.test(window.navigator.userAgent);
}

function getOAuthSearchRedirect() {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  if (!params.has("code")) {
    return null;
  }

  if (params.get("type") === "recovery" && params.has("code")) {
    const resetSearch = new URLSearchParams();
    for (const key of ["code", "type", "error", "error_description", "error_code"]) {
      const value = params.get(key);
      if (value) {
        resetSearch.set(key, value);
      }
    }

    return `/reset-password?${resetSearch.toString()}`;
  }

  const callbackSearch = new URLSearchParams();
  for (const key of ["code", "error", "error_description", "error_code", "state", "next", "type"]) {
    const value = params.get(key);
    if (value) {
      callbackSearch.set(key, value);
    }
  }

  if (window.location.pathname === "/auth/callback") {
    return `/auth/callback/exchange?${callbackSearch.toString()}`;
  }

  return `/auth/callback?${callbackSearch.toString()}`;
}

export function redirectTo(path: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (isJsdomRuntime()) {
    window.history.replaceState({}, document.title, path);
    return;
  }

  window.location.replace(path);
}

export function AuthSessionRecovery({ mode }: { mode: AuthSessionRecoveryMode }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<"idle" | "recovering" | "failed">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function recoverSession() {
      if (!supabase) {
        if (mode === "callback") {
          redirectTo("/login");
        }
        return;
      }

      const oauthSearchRedirect = getOAuthSearchRedirect();
      if (oauthSearchRedirect) {
        console.info("[auth] routing OAuth query callback through canonical callback path", {
          pathname: window.location.pathname,
          target: oauthSearchRedirect
        });
        redirectTo(oauthSearchRedirect);
        return;
      }

      const { accessToken, refreshToken, type, error, errorDescription } = parseAuthHash(window.location.hash);
      if (error) {
        console.error("[auth] OAuth hash callback returned an error", {
          error,
          errorDescription
        });
        removeHashFromUrl();
        redirectTo(`/login?error=${encodeURIComponent(errorDescription ?? error)}`);
        return;
      }

      const hasHashTokens = Boolean(accessToken && refreshToken);
      if (hasHashTokens) {
        setStatus("recovering");
        const isPasswordRecovery = type === "recovery";
        console.info("[auth] recovering browser session from auth hash fragment", {
          pathname: window.location.pathname,
          isPasswordRecovery
        });
        removeHashFromUrl();
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken as string,
          refresh_token: refreshToken as string
        });

        if (setSessionError) {
          console.error("[auth] failed to restore session from OAuth hash fragment", setSessionError);
          if (!cancelled) {
            setStatus("failed");
            setMessage(setSessionError.message);
          }
          redirectTo(`/login?error=${encodeURIComponent(setSessionError.message)}`);
          return;
        }

        if (isPasswordRecovery) {
          window.sessionStorage.setItem("bvrb3r-password-recovery", "1");
          redirectTo("/reset-password?recovery=1");
          return;
        }

        redirectTo("/post-auth");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        console.info("[auth] browser session recovered; routing through post-auth", {
          pathname: window.location.pathname
        });
        removeHashFromUrl();
        redirectTo("/post-auth");
        return;
      }

      if (mode === "callback") {
        console.error("[auth] callback page could not recover an authenticated session");
        if (!cancelled) {
          setStatus("failed");
          setMessage("We couldn't restore your session. Please log in again.");
        }
        redirectTo("/login?error=We%20couldn%27t%20restore%20your%20session.");
      }
    }

    void recoverSession();

    return () => {
      cancelled = true;
    };
  }, [mode, supabase]);

  if (mode !== "callback") {
    return null;
  }

  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-center py-6 sm:py-10">
      <Card className="w-full rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Authenticating</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">
          Restoring your BVRB3R session.
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-white/66 sm:text-base">
          We&apos;re securing your session, syncing your app identity, and routing you to the next required onboarding step.
        </p>
        <div className="mt-6 rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm leading-7 text-white/68">
          {status === "failed" ? message ?? "We couldn&apos;t restore your session." : "One moment while we continue your sign-in."}
        </div>
      </Card>
    </section>
  );
}
