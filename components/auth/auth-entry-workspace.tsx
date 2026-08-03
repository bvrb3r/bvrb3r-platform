"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDemoLauncherAccounts } from "@/lib/auth/demo-auth";
import { clearBrowserAccountState } from "@/lib/auth/session-isolation";
import { normalizeSafePostAuthReturnPath } from "@/lib/auth/post-auth-return";
import {
  SIGNUP_ROLE_INTENT_METADATA_KEY,
  SIGNUP_ROLE_OPTIONS,
  type SignupRoleIntent
} from "@/lib/auth/signup-role-intent";
import { isDemoMode } from "@/lib/config/runtime";
import { clearKioskDeviceState } from "@/lib/kiosk/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthMode = "login" | "signup";

const demoAccounts = getDemoLauncherAccounts();

async function startDemoSession(email: string): Promise<Route> {
  const response = await fetch("/auth/demo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ email })
  });

  const body = await response.json().catch(() => ({})) as { error?: string; redirectTo?: string };
  if (!response.ok || !body.redirectTo) {
    throw new Error(body.error ?? "Unable to start the demo session.");
  }

  return body.redirectTo as Route;
}

function getUnlockShopId(searchParams: ReturnType<typeof useSearchParams>) {
  const explicit = searchParams.get("unlockKiosk");
  if (explicit) {
    return explicit;
  }

  if (searchParams.get("unlock") !== "true") {
    return null;
  }

  const redirect = searchParams.get("redirect");
  if (!redirect?.startsWith("/kiosk/")) {
    return null;
  }

  const [, , shopId] = redirect.split("/");
  return shopId ? decodeURIComponent(shopId) : null;
}

function getSearchFeedback(searchParams: ReturnType<typeof useSearchParams>) {
  const authError = searchParams.get("error");
  if (authError) {
    return {
      kind: "error" as const,
      message: decodeURIComponent(authError)
    };
  }

  if (searchParams.get("password_reset") === "1") {
    return {
      kind: "success" as const,
      message: "Password updated. Log in with your new password."
    };
  }

  if (searchParams.get("account") === "disabled") {
    return {
      kind: "error" as const,
      message: "This account is disabled. Contact support if you believe this is a mistake."
    };
  }

  return null;
}

export function AuthEntryWorkspace({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [signupRole, setSignupRole] = useState<SignupRoleIntent | null>(null);
  const [isPending, startTransition] = useTransition();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const unlockKiosk = getUnlockShopId(searchParams);
  const nextPath = useMemo(
    () => normalizeSafePostAuthReturnPath(searchParams.get("redirect")) ?? "/post-auth",
    [searchParams]
  ) as Route;
  const isProductionAuth = Boolean(supabase);
  const title = mode === "login"
    ? "Continue into your BVRB3R lane."
    : "Create your account and choose your BVRB3R lane.";
  const subtitle = mode === "login"
    ? "Google, Apple, and email all route back into the correct lane. New accounts resume verification and role selection automatically."
    : "Choose your lane now so verification can route you into the right setup without an extra generic role step.";
  const searchFeedback = getSearchFeedback(searchParams);
  const visibleError = errorMessage ?? (searchFeedback?.kind === "error" ? searchFeedback.message : null);
  const visibleSuccess = successMessage ?? (searchFeedback?.kind === "success" ? searchFeedback.message : null);

  async function persistSignupRoleIntent(role: SignupRoleIntent) {
    const response = await fetch("/api/auth/signup-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ role })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? "Choose a valid role before continuing.");
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!supabase) {
      setErrorMessage("Supabase auth is not configured in this runtime. Use local demo mode below.");
      return;
    }

    if (mode === "signup") {
      if (!signupRole) {
        setErrorMessage("Choose your lane before continuing.");
        return;
      }

      try {
        await persistSignupRoleIntent(signupRole);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to save your signup lane.");
        return;
      }
    }

    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (nextPath !== "/post-auth") {
      callbackUrl.searchParams.set("next", nextPath);
    }
    const redirectTo = callbackUrl.toString();
    clearBrowserAccountState();
    console.info("[auth] OAuth sign-in started", {
      provider,
      redirectTo
    });

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined
      }
    });

    if (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();
    const fullName = String(formData.get("fullName") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const selectedRole = mode === "signup" ? signupRole : null;

    if (!email || !password) {
      setErrorMessage("Email and password are required.");
      return;
    }

    if (mode === "signup" && (!fullName || !phone)) {
      setErrorMessage("Full name, email, phone number, and password are required.");
      return;
    }

    if (mode === "signup" && !selectedRole) {
      setErrorMessage("Choose your lane before creating the account.");
      return;
    }

    if (!supabase) {
      try {
        const redirectTo = await startDemoSession(email || demoAccounts[0]?.user.email || "owner@bvrb3r.demo");
        if (unlockKiosk) {
          clearKioskDeviceState();
        }
        startTransition(() => {
          router.replace(redirectTo);
        });
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to continue in demo mode.");
      }
      return;
    }

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: fullName,
            phone,
            [SIGNUP_ROLE_INTENT_METADATA_KEY]: selectedRole,
            primary_onboarding_role: selectedRole
          }
        }
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data.session) {
        startTransition(() => {
          if (unlockKiosk) {
            clearKioskDeviceState();
          }
          router.replace("/verify-contact");
        });
        return;
      }

      setSuccessMessage("Check your email to verify this account. Your selected lane will resume after verification.");
      setSignupRole(null);
      form.reset();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setErrorMessage(error.message);
      return;
    }

    startTransition(() => {
      if (unlockKiosk) {
        clearKioskDeviceState();
      }
      router.replace(nextPath);
    });
  }

  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10">
      <div className={`grid w-full gap-4 ${isProductionAuth ? "lg:grid-cols-[1fr]" : "lg:grid-cols-[1fr_0.9fr]"}`}>
        <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
          <Badge>{mode === "login" ? "Log in" : "Create account"}</Badge>
          <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">{title}</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/66 sm:text-base">{subtitle}</p>

          <div className="mt-8 grid gap-3">
            {mode === "login" ? (
              <>
                <Button type="button" variant="secondary" className="h-12 w-full" onClick={() => void handleOAuth("google")} disabled={isPending}>
                  Continue with Google
                </Button>
                <Button type="button" variant="secondary" className="h-12 w-full" onClick={() => void handleOAuth("apple")} disabled={isPending}>
                  Continue with Apple
                </Button>
              </>
            ) : null}

            <form onSubmit={handleEmailSubmit} className="grid gap-3 rounded-[28px] border border-white/8 bg-black/20 p-4">
              {mode === "signup" ? (
                <>
                  <Input name="fullName" placeholder="Full name" autoComplete="name" />
                  <Input name="phone" placeholder="Phone number" type="tel" autoComplete="tel" />
                </>
              ) : null}
              <Input name="email" placeholder="Email" type="email" autoComplete="email" />
              <Input name="password" placeholder="Password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} />
              {mode === "signup" ? (
                <fieldset className="grid gap-3 rounded-[22px] border border-white/8 bg-black/20 p-3">
                  <legend className="px-1 text-sm font-medium text-white/78">Choose your lane</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {SIGNUP_ROLE_OPTIONS.map((option) => {
                      const selected = signupRole === option.value;
                      return (
                        <label
                          key={option.value}
                          className={`grid cursor-pointer gap-2 rounded-[18px] border p-3 text-left transition focus-within:ring-2 focus-within:ring-[#c4f24e] focus-within:ring-offset-2 focus-within:ring-offset-black ${
                            selected
                              ? "border-[#c4f24e]/40 bg-[#c4f24e]/10 text-white"
                              : "border-white/8 bg-black/20 text-white/66 hover:border-[#c4f24e]/24 hover:text-white"
                          }`}
                        >
                          <input
                            type="radio"
                            name="signupRole"
                            value={option.value}
                            checked={selected}
                            onChange={() => setSignupRole(option.value)}
                            className="sr-only"
                            required
                          />
                          <span className="text-sm font-semibold">{option.label}</span>
                          <span className="text-xs leading-5 text-white/56">{option.description}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}
              {mode === "login" ? (
                <Link href="/forgot-password" className="w-fit text-sm text-[#e0f6a0] underline-offset-4 hover:underline">
                  Forgot password?
                </Link>
              ) : null}
              <Button type="submit" className="h-12 w-full" disabled={isPending || (mode === "signup" && !signupRole)}>
                {mode === "login" ? "Log in" : "Create account"}
              </Button>
            </form>

            {mode === "signup" ? (
              <>
                <Button type="button" variant="secondary" className="h-12 w-full" onClick={() => void handleOAuth("google")} disabled={isPending}>
                  Continue with Google
                </Button>
                <Button type="button" variant="secondary" className="h-12 w-full" onClick={() => void handleOAuth("apple")} disabled={isPending}>
                  Continue with Apple
                </Button>
              </>
            ) : null}
          </div>

          {visibleError ? <p className="mt-4 text-sm leading-7 text-[#ff8f8f]">{visibleError}</p> : null}
          {visibleSuccess ? <p className="mt-4 text-sm leading-7 text-[#e4f9b8]">{visibleSuccess}</p> : null}

          <p className="mt-6 text-sm leading-7 text-white/52">
            {mode === "login" ? "Need an account?" : "Already have an account?"}{" "}
            <Link href={mode === "login" ? "/signup" : "/login"} className="text-[#e0f6a0]">
              {mode === "login" ? "Create account" : "Log in"}
            </Link>
          </p>
          {unlockKiosk ? (
            <p className="mt-3 text-sm leading-7 text-[#e4f9b8]">
              Staff sign-in will unlock kiosk mode on this device and return you to the protected operator flow.
            </p>
          ) : null}
        </Card>

        {!isProductionAuth && isDemoMode() ? (
          <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
            <p className="surface-label">Local demo</p>
            <div className="mt-5 grid gap-3">
              {demoAccounts.map((account) => (
                <button
                  key={account.user.id}
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    void startDemoSession(account.user.email)
                      .then((redirectTo) => router.replace(redirectTo))
                      .catch((error) => setErrorMessage(error instanceof Error ? error.message : "Demo sign-in failed."))
                  }
                  className="flex w-full items-start justify-between gap-4 rounded-[22px] border border-white/8 bg-black/20 px-4 py-4 text-left hover:border-[#C4F24E]/20 hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <span className="min-w-0">
                    <span className="block text-base font-medium text-white">{account.user.name}</span>
                    <span className="mt-1 block text-[11px] uppercase tracking-[0.22em] text-[#e0f6a0]">{account.roleLabel}</span>
                    <span className="mt-2 block text-sm leading-6 text-white/58">{account.description}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-white/42">{account.user.email}</span>
                </button>
              ))}
            </div>
            <p className="mt-5 text-sm leading-7 text-white/52">
              Demo mode stays available locally when Supabase auth is not configured.
            </p>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
