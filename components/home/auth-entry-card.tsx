"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearBrowserAccountState } from "@/lib/auth/session-isolation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type OAuthProvider = "google" | "apple";

export function AuthEntryCard() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const isBusy = isSubmitting || isPending;

  async function handleOAuth(provider: OAuthProvider) {
    setErrorMessage(null);

    if (!supabase) {
      setErrorMessage("Authentication is not configured in this environment.");
      return;
    }

    const redirectTo = `${window.location.origin}/auth/callback`;
    clearBrowserAccountState();
    console.info("[home] OAuth entry started", { provider, redirectTo });

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

  async function handleEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("identifier") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();

    if (!email || !password) {
      setErrorMessage("Enter your account identifier and password.");
      return;
    }

    if (!supabase) {
      setErrorMessage("Authentication is not configured in this environment.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    startTransition(() => {
      router.replace("/post-auth" as Route);
    });
  }

  return (
    <section
      aria-labelledby="auth-entry-title"
      className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(22,24,21,0.96),rgba(5,6,5,0.98))] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.54)] backdrop-blur-xl sm:p-6 lg:p-7"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(124,255,0,0.78),transparent)]"
      />
      <h2 id="auth-entry-title" className="sr-only">
        Account access
      </h2>

      <form onSubmit={handleEmailLogin} className="grid gap-4">
        <div className="grid gap-2">
          <label htmlFor="home-identifier" className="text-sm font-medium text-white/78">
            Mobile number, email, or username
          </label>
          <Input
            id="home-identifier"
            name="identifier"
            type="text"
            inputMode="text"
            autoComplete="username"
            className="border-white/10 bg-black/35"
            disabled={isBusy}
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="home-password" className="text-sm font-medium text-white/78">
            Password
          </label>
          <Input
            id="home-password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="border-white/10 bg-black/35"
            disabled={isBusy}
          />
        </div>

        <Button type="submit" className="mt-1 h-14 w-full text-[11px]" disabled={isBusy}>
          Log in
        </Button>
      </form>

      <div className="my-5 h-px bg-white/8" aria-hidden="true" />

      <div className="grid gap-3">
        <Button
          type="button"
          variant="secondary"
          className="h-[52px] w-full justify-center"
          onClick={() => void handleOAuth("google")}
          disabled={isBusy}
        >
          Continue with Google
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-[52px] w-full justify-center"
          onClick={() => void handleOAuth("apple")}
          disabled={isBusy}
        >
          Continue with Apple
        </Button>
        <Link
          href="/signup"
          className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-[#7cff00]/25 bg-[#7cff00]/8 px-5 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d7ffab] transition hover:border-[#7cff00]/45 hover:bg-[#7cff00]/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7cff00] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          Create account
        </Link>
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
