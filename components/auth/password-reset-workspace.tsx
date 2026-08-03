"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  KeyRound,
  LifeBuoy,
  Mail,
  MessageSquareText,
  ShieldCheck
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearBrowserAccountState } from "@/lib/auth/session-isolation";
import {
  PASSWORD_RESET_GENERIC_FAILURE,
  PASSWORD_RESET_INVALID_LINK
} from "@/lib/auth/password-recovery";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const RECOVERY_SESSION_STORAGE_KEY = "bvrb3r-password-recovery";
const RESET_PASSWORD_PATH = "/reset-password";
const RESET_COMPLETE_LOGIN_PATH = "/login";
const RESET_READY_MESSAGE = "Enter a new password to finish the reset.";

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
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [step, setStep] = useState<"contact" | "code" | "password" | "success" | "support">("contact");
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [destination, setDestination] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [maskedDestination, setMaskedDestination] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const normalizedDestination = destination.trim();
    if (!normalizedDestination) {
      setErrorMessage(channel === "email" ? "Enter your email address." : "Enter your mobile number.");
      return;
    }

    setIsPending(true);
    try {
      const response = await fetch("/api/auth/recovery/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ channel, destination: normalizedDestination })
      });
      const body = await response.json().catch(() => ({})) as {
        challengeId?: string;
        maskedDestination?: string;
        demoCode?: string;
        error?: string;
      };
      if (!response.ok) {
        setErrorMessage(body.error ?? PASSWORD_RESET_GENERIC_FAILURE);
        return;
      }
      if (!body.challengeId) {
        setErrorMessage(PASSWORD_RESET_GENERIC_FAILURE);
        return;
      }
      setChallengeId(body.challengeId);
      setMaskedDestination(body.maskedDestination ?? "your contact");
      setDemoCode(body.demoCode ?? "");
      setCode("");
      setStep("code");
    } catch {
      setErrorMessage(PASSWORD_RESET_GENERIC_FAILURE);
    } finally {
      setIsPending(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    if (!/^\d{6}$/.test(code)) {
      setErrorMessage("Enter the complete six-digit code.");
      return;
    }
    setIsPending(true);
    try {
      const response = await fetch("/api/auth/recovery/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ challengeId, code })
      });
      const body = await response.json().catch(() => ({})) as {
        resetToken?: string;
        error?: string;
      };
      if (!response.ok || !body.resetToken) {
        setErrorMessage(body.error ?? "That code could not be verified.");
        return;
      }
      setResetToken(body.resetToken);
      setStep("password");
    } catch {
      setErrorMessage(PASSWORD_RESET_GENERIC_FAILURE);
    } finally {
      setIsPending(false);
    }
  }

  async function completeReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    if (newPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    setIsPending(true);
    try {
      const response = await fetch("/api/auth/recovery/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ challengeId, resetToken, newPassword })
      });
      const body = await response.json().catch(() => ({})) as {
        completed?: boolean;
        signInEmail?: string;
        error?: string;
      };
      if (!response.ok || !body.completed || !body.signInEmail) {
        setErrorMessage(body.error ?? "We could not finish this reset.");
        return;
      }

      setStep("success");
      const signIn = supabase
        ? await supabase.auth.signInWithPassword({
          email: body.signInEmail,
          password: newPassword
        })
        : { error: new Error("Sign-in client unavailable.") };
      if (!signIn.error) {
        window.setTimeout(() => router.replace("/post-auth"), 900);
      } else {
        window.setTimeout(() => router.replace("/login?recovered=1"), 1200);
      }
    } catch {
      setErrorMessage(PASSWORD_RESET_GENERIC_FAILURE);
    } finally {
      setIsPending(false);
    }
  }

  const progressStep = step === "contact" || step === "support"
    ? 1
    : step === "code"
      ? 2
      : step === "password"
        ? 3
        : 4;

  return (
    <section className="min-h-screen bg-[#060708] px-4 pb-16 text-[#F5F1E8] sm:px-6">
      <header className="mx-auto flex max-w-[480px] items-center justify-between border-b border-white/10 py-4">
        <Link href="/login" className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/45">
          <ChevronLeft className="h-4 w-4" /> Sign in
        </Link>
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white/28">
          Account Recovery
        </span>
      </header>

      <div className="mx-auto max-w-[480px] pt-10 sm:pt-14">
        <div className="flex items-center gap-2" aria-label={`Recovery step ${progressStep} of 4`}>
          {[1, 2, 3, 4].map((value) => (
            <span
              key={value}
              className={`h-1 flex-1 rounded-full ${
                value <= progressStep ? "bg-[#C4F24E]" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {step === "contact" ? (
          <>
            <p className="mt-10 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#C4F24E]">01 / Find your account</p>
            <h1 className="mt-3 font-serif text-[46px] leading-[0.98]">
              Get back in<span className="text-[#C4F24E]">.</span>
            </h1>
            <p className="mt-5 text-sm leading-7 text-white/48">
              Choose where your six-digit recovery code should arrive.
            </p>

            <div className="mt-7 grid grid-cols-2 gap-2">
              {([
                ["email", "Email", Mail],
                ["sms", "SMS", MessageSquareText]
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setChannel(value);
                    setDestination("");
                    setErrorMessage(null);
                  }}
                  className={`flex items-center justify-center gap-2 rounded-full border px-4 py-3 font-mono text-[9px] font-bold uppercase tracking-[0.15em] ${
                    channel === value
                      ? "border-[#C4F24E] bg-[#C4F24E] text-black"
                      : "border-white/12 text-white/48"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            <form onSubmit={requestCode} className="mt-6">
              <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.12em] text-white/38" htmlFor="recovery-destination">
                {channel === "email" ? "Email address" : "Mobile number"}
              </label>
              <Input
                id="recovery-destination"
                autoComplete={channel === "email" ? "email" : "tel"}
                onChange={(event) => setDestination(event.target.value)}
                placeholder={channel === "email" ? "you@example.com" : "(813) 555-0100"}
                type={channel === "email" ? "email" : "tel"}
                value={destination}
              />
              <Button type="submit" className="mt-4 h-12 w-full" disabled={isPending}>
                {isPending ? "Sending code…" : "Send six-digit code"}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => {
                setStep("support");
                setErrorMessage(null);
              }}
              className="mt-6 w-full text-center font-mono text-[9px] uppercase tracking-[0.13em] text-white/38 underline decoration-white/20 underline-offset-4"
            >
              I can’t access either one
            </button>
          </>
        ) : null}

        {step === "code" ? (
          <>
            <p className="mt-10 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#C4F24E]">02 / Verify the code</p>
            <h1 className="mt-3 font-serif text-[46px] leading-[0.98]">
              Check your {channel === "sms" ? "phone" : "inbox"}<span className="text-[#C4F24E]">.</span>
            </h1>
            <p className="mt-5 text-sm leading-7 text-white/48">
              Enter the six digits sent to {maskedDestination}. The code expires in 10 minutes.
            </p>
            {demoCode ? (
              <p className="mt-4 rounded-xl border border-[#D9B461]/25 bg-[#D9B461]/[0.06] px-4 py-3 font-mono text-[10px] text-[#D9B461]">
                Demo code: {demoCode}
              </p>
            ) : null}
            <form onSubmit={verifyCode} className="mt-7">
              <label className="mb-2 block font-mono text-[9px] uppercase tracking-[0.12em] text-white/38" htmlFor="recovery-code">
                Six-digit code
              </label>
              <Input
                id="recovery-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                value={code}
                className="text-center font-mono text-2xl tracking-[0.45em]"
              />
              <Button type="submit" className="mt-4 h-12 w-full" disabled={isPending}>
                {isPending ? "Checking code…" : "Verify code"}
              </Button>
            </form>
            <button type="button" onClick={() => setStep("contact")} className="mt-6 font-mono text-[9px] uppercase tracking-[0.13em] text-white/38">
              Use a different contact
            </button>
          </>
        ) : null}

        {step === "password" ? (
          <>
            <p className="mt-10 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#C4F24E]">03 / New password</p>
            <h1 className="mt-3 font-serif text-[46px] leading-[0.98]">
              Set a fresh key<span className="text-[#C4F24E]">.</span>
            </h1>
            <p className="mt-5 text-sm leading-7 text-white/48">
              This verified session can change the password once, then it closes.
            </p>
            <form onSubmit={completeReset} className="mt-7 space-y-3">
              <Input
                aria-label="New recovery password"
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password"
                type="password"
                value={newPassword}
              />
              <Input
                aria-label="Confirm recovery password"
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm password"
                type="password"
                value={confirmPassword}
              />
              <Button type="submit" className="h-12 w-full" disabled={isPending}>
                {isPending ? "Securing account…" : "Save password & sign in"}
              </Button>
            </form>
          </>
        ) : null}

        {step === "success" ? (
          <div className="pt-14 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#C4F24E]/40 text-[#C4F24E]">
              <Check className="h-5 w-5" />
            </span>
            <p className="mt-7 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#C4F24E]">04 / Complete</p>
            <h1 className="mt-3 font-serif text-[46px] leading-[0.98]">You’re back in<span className="text-[#C4F24E]">.</span></h1>
            <p className="mt-5 text-sm leading-7 text-white/48">Your password is updated. Signing you into the correct workspace now.</p>
            <ShieldCheck className="mx-auto mt-7 h-5 w-5 text-white/38" />
          </div>
        ) : null}

        {step === "support" ? (
          <>
            <p className="mt-10 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#D9B461]">Locked out / Support handoff</p>
            <h1 className="mt-3 font-serif text-[44px] leading-[0.98]">We’ll verify you by hand<span className="text-[#D9B461]">.</span></h1>
            <p className="mt-5 text-sm leading-7 text-white/48">
              Support cannot reveal or change an account until identity evidence matches.
            </p>
            <div className="mt-7 rounded-2xl border border-white/10 p-5">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-white/35">Have this ready</p>
              <ul className="mt-4 space-y-3 text-sm text-white/58">
                <li className="flex gap-3"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#D9B461]" />Your full name and the last contact you remember</li>
                <li className="flex gap-3"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#D9B461]" />A recent appointment, shop, or barber</li>
                <li className="flex gap-3"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#D9B461]" />A receipt reference or payout detail only you should know</li>
                <li className="flex gap-3"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#D9B461]" />Photo ID only if support explicitly requests it</li>
              </ul>
            </div>
            <Link href="/contact?subject=account-recovery" className="mt-6 flex h-12 items-center justify-center gap-2 rounded-full bg-[#C4F24E] px-5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-black">
              <LifeBuoy className="h-4 w-4" /> Start support handoff
            </Link>
            <button type="button" onClick={() => setStep("contact")} className="mt-6 w-full text-center font-mono text-[9px] uppercase tracking-[0.13em] text-white/38">
              Try email or SMS again
            </button>
          </>
        ) : null}

        {errorMessage ? (
          <p role="alert" className="mt-5 rounded-xl border border-red-300/20 bg-red-300/[0.06] px-4 py-3 text-sm leading-6 text-red-100">
            {errorMessage}
          </p>
        ) : null}
      </div>
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
  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepareRecoverySession() {
      if (!supabase) {
        setStatus("invalid");
        setMessage(PASSWORD_RESET_INVALID_LINK);
        return;
      }

      const hash = parseRecoveryHash(window.location.hash);
      if (hash.error) {
        cleanResetPasswordUrl();
        setStatus("invalid");
        setMessage(PASSWORD_RESET_INVALID_LINK);
        return;
      }

      const { code, type, recovery } = getRecoverySearchParams();
      if (code) {
        if (type !== "recovery") {
          cleanResetPasswordUrl();
          setStatus("invalid");
          setMessage(PASSWORD_RESET_INVALID_LINK);
          return;
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) {
          return;
        }

        cleanResetPasswordUrl();
        if (error) {
          setStatus("invalid");
          setMessage(PASSWORD_RESET_INVALID_LINK);
          return;
        }

        markRecoverySessionVerified();
        setStatus("ready");
        setMessage(RESET_READY_MESSAGE);
        return;
      }

      if (hash.accessToken && hash.refreshToken) {
        if (hash.type !== "recovery") {
          cleanResetPasswordUrl();
          setStatus("invalid");
          setMessage(PASSWORD_RESET_INVALID_LINK);
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
          setMessage(PASSWORD_RESET_INVALID_LINK);
          return;
        }

        markRecoverySessionVerified();
        setStatus("ready");
        setMessage(RESET_READY_MESSAGE);
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
          setMessage(RESET_READY_MESSAGE);
          return;
        }
      }

      setStatus("invalid");
      setMessage(PASSWORD_RESET_INVALID_LINK);
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
      setMessage("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
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
    setMessage("Password updated. Please log in with your new password.");
    window.setTimeout(() => {
      router.replace(RESET_COMPLETE_LOGIN_PATH);
    }, 1200);
  }

  const canSubmit = status === "ready";
  const isSaving = status === "saving";
  const isSuccess = status === "success";
  const isError = status === "invalid" || (status === "ready" && message !== RESET_READY_MESSAGE);
  const passwordInputType = showPasswords ? "text" : "password";

  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10">
      <Card className="w-full rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Secure reset</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">
          Create a new password
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
            type={passwordInputType}
            value={newPassword}
          />
          <Input
            aria-label="Confirm new password"
            autoComplete="new-password"
            disabled={!canSubmit || isSaving || isSuccess}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm new password"
            type={passwordInputType}
            value={confirmPassword}
          />
          <Button
            type="button"
            variant="secondary"
            className="h-12 w-full"
            onClick={() => setShowPasswords((current) => !current)}
          >
            {showPasswords ? "Hide passwords" : "Show passwords"}
          </Button>
          <Button type="submit" className="h-12 w-full" disabled={!canSubmit || isSaving || isSuccess}>
            {isSaving ? "Saving new password" : "Save new password"}
          </Button>
        </form>

        <p className={`mt-4 text-sm leading-7 ${isSuccess ? "text-[#e4f9b8]" : isError ? "text-[#ff8f8f]" : "text-white/62"}`}>
          {message}
        </p>

        {status === "invalid" ? (
          <p className="mt-6 text-sm leading-7 text-white/52">
            Need a fresh link?{" "}
            <Link href="/forgot-password" className="text-[#e0f6a0]">
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
