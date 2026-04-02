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

export function AuthEntryWorkspace({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const unlockKiosk = getUnlockShopId(searchParams);
  const nextPath: Route = "/post-auth";
  const title = mode === "login" ? "Get back into the lane that makes you money." : "Create an account fast, then choose how you run on BVRB3R.";
  const subtitle = mode === "login"
    ? "Use Google, Apple, or email to re-enter your lane. If your onboarding is incomplete, BVRB3R will resume you at the exact right step."
    : "Account creation stays low-friction. Role selection, onboarding, and verification happen after auth so trust stays strict without killing conversion.";

  async function handleOAuth(provider: "google" | "apple") {
    setErrorMessage(null);
    if (!supabase) {
      setErrorMessage("Supabase auth is not configured in this runtime. Use demo mode locally.");
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
      }
    });

    if (error) {
      setErrorMessage(error.message);
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();
    const fullName = String(formData.get("fullName") ?? "").trim();

    if (!email || !password) {
      setErrorMessage("Email and password are required.");
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
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/post-auth`,
          data: {
            full_name: fullName
          }
        }
      });

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
      <div className="grid w-full gap-4 lg:grid-cols-[1fr_0.9fr]">
        <Card className="rounded-[34px] p-6 sm:p-8 lg:p-10">
          <Badge>{mode === "login" ? "Welcome back" : "Create account"}</Badge>
          <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">{title}</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/66 sm:text-base">{subtitle}</p>
          <div className="mt-8 grid gap-3">
            <Button type="button" variant="secondary" className="h-12 w-full" onClick={() => void handleOAuth("google")} disabled={isPending}>Continue with Google</Button>
            <Button type="button" variant="secondary" className="h-12 w-full" onClick={() => void handleOAuth("apple")} disabled={isPending}>Continue with Apple</Button>
            <form onSubmit={handleEmailSubmit} className="grid gap-3 rounded-[28px] border border-white/8 bg-black/20 p-4">
              {mode === "signup" ? <Input name="fullName" placeholder="Full name" /> : null}
              <Input name="email" placeholder="Email" type="email" />
              <Input name="password" placeholder="Password" type="password" />
              <Button type="submit" className="h-12 w-full" disabled={isPending}>
                {mode === "login" ? "Continue with Email" : "Create account with Email"}
              </Button>
            </form>
          </div>
          {errorMessage ? <p className="mt-4 text-sm leading-7 text-[#ff8f8f]">{errorMessage}</p> : null}
          <p className="mt-6 text-sm leading-7 text-white/52">
            {mode === "login" ? "Need an account?" : "Already have an account?"}{" "}
            <Link href={mode === "login" ? "/signup" : "/login"} className="text-[#cfff93]">{mode === "login" ? "Create one" : "Log in"}</Link>
          </p>
          {unlockKiosk ? (
            <p className="mt-3 text-sm leading-7 text-[#d7ffab]">
              Staff sign-in will unlock kiosk mode on this device and return you to the protected operator flow.
            </p>
          ) : null}
        </Card>
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
                className="flex w-full items-start justify-between gap-4 rounded-[22px] border border-white/8 bg-black/20 px-4 py-4 text-left hover:border-[#7CFF00]/20 hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="min-w-0">
                  <span className="block text-base font-medium text-white">{account.user.name}</span>
                  <span className="mt-1 block text-[11px] uppercase tracking-[0.22em] text-[#cfff93]">{account.roleLabel}</span>
                  <span className="mt-2 block text-sm leading-6 text-white/58">{account.description}</span>
                </span>
                <span className="shrink-0 text-right text-xs text-white/42">{account.user.email}</span>
              </button>
            ))}
          </div>
          <p className="mt-5 text-sm leading-7 text-white/52">
            Demo mode still works for fast local testing. Supabase auth is used when the runtime is configured.
          </p>
        </Card>
      </div>
    </section>
  );
}
