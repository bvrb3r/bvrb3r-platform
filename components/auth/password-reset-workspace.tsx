"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearBrowserAccountState } from "@/lib/auth/session-isolation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const RECOVERY_SESSION_STORAGE_KEY = "bvrb3r-password-recovery";
const RESET_PASSWORD_PATH = "/reset-password";
const RESET_COMPLETE_LOGIN_PATH = "/login?password_reset=1";

type ResetStatus = "checking" | "ready" | "invalid" | "saving" | "success";

function parseRecoveryHash(hash: string) {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
    type: params.get("type"),
    error: params.get("error"),
    errorDescription: params.get("error_description")
  };
}

function cleanResetPasswordUrl() {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState({}, document.title, RESET_PASSWORD_PATH);
}

function isJsdomRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  return /jsdom/i.test(window.navigator.userAgent);
}

function redirectBrowser(path: string) {
  if (isJsdomRuntime()) {
    window.history.replaceState({}, document.title, path);
    return;
  }

  window.location.replace(path);
}

function markRecoverySessionVerified() {
  window.sessionStorage.setItem(RECOVERY_SESSION_STORAGE_KEY, "1");
}

function clearRecoverySessionFlag() {
  window.sessionStorage.removeItem(RECOVERY_SESSION_STORAGE_KEY);
}

function hasVerifiedRecoveryFlag() {
  return window.sessionStorage.getItem(RECOVERY_SESSION_STORAGE_KEY) === "1";
}

function getRecoverySearchParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    code: params.get("code"),
    type: params.get("type"),
    recovery: params.get("recovery")
  };
}

export function ForgotPasswordWorkspace() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setErrorMessage("Enter the email for your BVRB3R account.");
      return;
    }

    if (!supabase) {
      setErrorMessage("Password recovery is not configured in this runtime.");
      return;
    }

    setIsPending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}${RESET_PASSWORD_PATH}`
    });
    setIsPending(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage("Check your email for a secure password reset link.");
  }

  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10">
      <Card className="w-full rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Password reset</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">
          Reset your BVRB3R password.
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-white/66 sm:text-base">
          Enter the email on your account. We&apos;ll send a secure link that opens the password reset screen.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-3 rounded-[28px] border border-white/8 bg-black/20 p-4">
          <Input
            aria-label="Account email"
            autoComplete="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            type="email"
            value={email}
          />
          <Button type="submit" className="h-12 w-full" disabled={isPending}>
            {isPending ? "Sending reset link" : "Send reset link"}
          </Button>
        </form>

        {errorMessage ? <p className="mt-4 text-sm leading-7 text-[#ff8f8f]">{errorMessage}</p> : null}
        {successMessage ? <p className="mt-4 text-sm leading-7 text-[#d7ffab]">{successMessage}</p> : null}

        <p className="mt-6 text-sm leading-7 text-white/52">
          Remembered it?{" "}
          <Link href="/login" className="text-[#cfff93]">
            Log in
          </Link>
        </p>
      </Card>
    </section>
  );
}

export function ResetPasswordWorkspace() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<ResetStatus>("checking");
  const [message, setMessage] = useState("Checking your secure reset link.");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function prepareRecoverySession() {
      if (!supabase) {
        setStatus("invalid");
        setMessage("Password reset is not configured in this runtime.");
        return;
      }

      const hash = parseRecoveryHash(window.location.hash);
      if (hash.error) {
        cleanResetPasswordUrl();
        setStatus("invalid");
        setMessage(hash.errorDescription ?? hash.error);
        return;
      }

      const { code, type, recovery } = getRecoverySearchParams();
      if (code) {
        if (type !== "recovery") {
          cleanResetPasswordUrl();
          setStatus("invalid");
          setMessage("Open the latest password reset link from your email.");
          return;
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) {
          return;
        }

        cleanResetPasswordUrl();
        if (error) {
          setStatus("invalid");
          setMessage(error.message);
          return;
        }

        markRecoverySessionVerified();
        setStatus("ready");
        setMessage("Enter a new password to finish the reset.");
        return;
      }

      if (hash.accessToken && hash.refreshToken) {
        if (hash.type !== "recovery") {
          cleanResetPasswordUrl();
          setStatus("invalid");
          setMessage("Open the latest password reset link from your email.");
          return;
        }

        const { error } = await supabase.auth.setSession({
          access_token: hash.accessToken,
          refresh_token: hash.refreshToken
        });
        if (cancelled) {
          return;
        }

        cleanResetPasswordUrl();
        if (error) {
          setStatus("invalid");
          setMessage(error.message);
          return;
        }

        markRecoverySessionVerified();
        setStatus("ready");
        setMessage("Enter a new password to finish the reset.");
        return;
      }

      if (recovery === "1" || hasVerifiedRecoveryFlag()) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) {
          return;
        }

        cleanResetPasswordUrl();
        if (data.session) {
          markRecoverySessionVerified();
          setStatus("ready");
          setMessage("Enter a new password to finish the reset.");
          return;
        }
      }

      setStatus("invalid");
      setMessage("Open the latest password reset link from your email.");
    }

    void prepareRecoverySession();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || status !== "ready") {
      return;
    }

    if (newPassword.length < 8) {
      setMessage("Use at least 8 characters for your new password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("The password confirmation does not match.");
      return;
    }

    setStatus("saving");
    setMessage("Saving your new password.");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setStatus("ready");
      setMessage(error.message);
      return;
    }

    clearRecoverySessionFlag();
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    clearBrowserAccountState();
    setStatus("success");
    setMessage("Password updated. Return to login and sign in with the new password.");
    window.setTimeout(() => {
      router.replace(RESET_COMPLETE_LOGIN_PATH);
    }, 1200);
  }

  const canSubmit = status === "ready";
  const isSaving = status === "saving";
  const isSuccess = status === "success";
  const isError = status === "invalid" || (status === "ready" && message !== "Enter a new password to finish the reset.");

  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10">
      <Card className="w-full rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Secure reset</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">
          Save a new password.
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-white/66 sm:text-base">
          This reset session only lets you update your password. After saving, you&apos;ll log in normally.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 grid gap-3 rounded-[28px] border border-white/8 bg-black/20 p-4">
          <Input
            aria-label="New password"
            autoComplete="new-password"
            disabled={!canSubmit || isSaving || isSuccess}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="New password"
            type="password"
            value={newPassword}
          />
          <Input
            aria-label="Confirm new password"
            autoComplete="new-password"
            disabled={!canSubmit || isSaving || isSuccess}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm new password"
            type="password"
            value={confirmPassword}
          />
          <Button type="submit" className="h-12 w-full" disabled={!canSubmit || isSaving || isSuccess}>
            {isSaving ? "Saving new password" : "Save new password"}
          </Button>
        </form>

        <p className={`mt-4 text-sm leading-7 ${isSuccess ? "text-[#d7ffab]" : isError ? "text-[#ff8f8f]" : "text-white/62"}`}>
          {message}
        </p>

        {status === "invalid" ? (
          <p className="mt-6 text-sm leading-7 text-white/52">
            Need a fresh link?{" "}
            <Link href="/forgot-password" className="text-[#cfff93]">
              Send another reset email
            </Link>
          </p>
        ) : null}
      </Card>
    </section>
  );
}

export function PasswordRecoveryRedirectGuard() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    if (!supabase || typeof window === "undefined" || window.location.pathname === RESET_PASSWORD_PATH) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const queryType = params.get("type");
    const code = params.get("code");
    if (queryType === "recovery" && code) {
      const resetSearch = new URLSearchParams({
        code,
        type: "recovery"
      });
      redirectBrowser(`${RESET_PASSWORD_PATH}?${resetSearch.toString()}`);
      return;
    }

    const hash = parseRecoveryHash(window.location.hash);
    if (hash.type !== "recovery") {
      return;
    }

    async function routeRecoveryHashToReset() {
      if (hash.error) {
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
        redirectBrowser(`/login?error=${encodeURIComponent(hash.errorDescription ?? hash.error)}`);
        return;
      }

      if (!hash.accessToken || !hash.refreshToken) {
        redirectBrowser(RESET_PASSWORD_PATH);
        return;
      }

      const { error } = await supabase!.auth.setSession({
        access_token: hash.accessToken,
        refresh_token: hash.refreshToken
      });

      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
      if (error) {
        redirectBrowser(`/login?error=${encodeURIComponent(error.message)}`);
        return;
      }

      markRecoverySessionVerified();
      redirectBrowser(`${RESET_PASSWORD_PATH}?recovery=1`);
    }

    void routeRecoveryHashToReset();
  }, [supabase]);

  return null;
}
