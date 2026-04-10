"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  useContactVerificationStatus,
  useOnboardingMe,
  useSendPhoneVerificationMutation,
  useUpdateContactVerificationMutation,
  useVerifyPhoneVerificationMutation
} from "@/lib/onboarding/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ContactVerificationWorkspace() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const statusQuery = useContactVerificationStatus();
  const onboardingQuery = useOnboardingMe(false);
  const updateContactMutation = useUpdateContactVerificationMutation();
  const sendPhoneMutation = useSendPhoneVerificationMutation();
  const verifyPhoneMutation = useVerifyPhoneVerificationMutation();
  const hasForwardedRef = useRef(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);

  const payload = statusQuery.data;
  const resolvedFirstName = firstName || payload?.firstName || "";
  const resolvedLastName = lastName || payload?.lastName || "";
  const resolvedPhone = phone || payload?.phone || "";

  useEffect(() => {
    if (!payload) {
      return;
    }

    console.info("[verify-contact] canonical state loaded", {
      fullName: payload.fullName,
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.phone,
      emailVerified: payload.emailVerified,
      phoneVerified: payload.phoneVerified,
      missingFields: payload.missingFields,
      onboardingState: payload.onboardingState,
      nextPath: payload.nextPath
    });
  }, [payload]);

  async function continueFromCanonicalState(preferredNextPath?: Route) {
    if (isContinuing) {
      return preferredNextPath ?? null;
    }

    setIsContinuing(true);
    try {
      const [contactResult, onboardingResult] = await Promise.all([
        statusQuery.refetch(),
        onboardingQuery.refetch()
      ]);
      const nextPath: Route = onboardingResult.data?.nextPath
        ?? contactResult.data?.nextPath
        ?? preferredNextPath
        ?? "/post-auth";

      console.info("[verify-contact] continuation resolved", {
        contactState: contactResult.data,
        onboardingState: onboardingResult.data,
        preferredNextPath,
        nextPath
      });

      if (nextPath && nextPath !== "/verify-contact") {
        hasForwardedRef.current = true;
        console.info("[verify-contact] redirecting", { nextPath });
        router.replace(nextPath);
      }

      return nextPath;
    } finally {
      setIsContinuing(false);
    }
  }

  useEffect(() => {
    if (hasForwardedRef.current || !payload?.canContinue) {
      return;
    }

    const nextPath = payload.nextPath ?? "/post-auth";
    if (nextPath === "/verify-contact") {
      return;
    }

    hasForwardedRef.current = true;
    router.replace(nextPath);
  }, [payload?.canContinue, payload?.nextPath, router]);

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      console.info("[verify-contact] saving contact details", {
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
        phone: resolvedPhone,
        email: payload?.email
      });
      const result = await updateContactMutation.mutateAsync({
        firstName: resolvedFirstName,
        lastName: resolvedLastName,
        phone: resolvedPhone,
        email: payload?.email
      });
      setFirstName(result.firstName);
      setLastName(result.lastName);
      setPhone(result.phone);
      setSuccessMessage(result.canContinue
        ? "Contact details are complete. Continue to choose your BVRB3R lane."
        : "Contact details saved. Finish the remaining verification to continue.");
      await continueFromCanonicalState(result.nextPath);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save your contact details.");
    }
  }

  async function handleResendEmail() {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!supabase || !payload?.email) {
      setErrorMessage("Email verification resend is not available in this runtime.");
      return;
    }

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: payload.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/post-auth`
      }
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage("Verification email sent. Open the link in your inbox, then return here to continue.");
  }

  async function handleSendSms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      console.info("[verify-contact] sending sms code", {
        phone: resolvedPhone
      });
      const result = await sendPhoneMutation.mutateAsync({ phone: resolvedPhone });
      setPhone(result.phone);
      setSuccessMessage(
        result.degraded
          ? "SMS delivery is running in fallback mode. Check server logs for the verification code in development."
          : "Verification code sent by SMS."
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to send the verification code.");
    }
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      console.info("[verify-contact] verifying phone code", {
        codeLength: code.trim().length
      });
      const result = await verifyPhoneMutation.mutateAsync({ code });
      setPhone(result.phone);
      setCode("");
      const nextPath = await continueFromCanonicalState(result.nextPath);
      setSuccessMessage(
        nextPath && nextPath !== "/verify-contact"
          ? "Phone verification complete. Taking you to the next step now."
          : result.canContinue
            ? "Phone verification complete. Continue to the next step."
            : "Phone verification complete. Finish the remaining required fields to continue."
      );
      if (!result.canContinue && nextPath === "/verify-contact") {
        hasForwardedRef.current = false;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to verify this code.");
    }
  }

  return (
    <section className="page-shell safe-top-pad app-safe-bottom flex min-h-[100svh] min-h-[100dvh] items-start py-6 sm:items-center sm:py-10">
      <Card className="w-full rounded-[34px] p-6 sm:p-8 lg:p-10">
        <Badge>Verify contact</Badge>
        <h1 className="mt-5 text-balance text-4xl font-semibold sm:text-5xl" data-display="true">
          Verify email and phone before you choose your BVRB3R lane.
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-white/66 sm:text-base">
          Account creation stays fast, but we do not treat the account as fully onboarded until contact verification is complete.
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <Card className="rounded-[28px] border border-white/8 bg-black/20 p-5">
            <p className="surface-label">Contact profile</p>
            <form onSubmit={handleSaveProfile} className="mt-5 grid gap-3">
              <Input
                value={resolvedFirstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="First name"
                autoComplete="given-name"
              />
              <Input
                value={resolvedLastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Last name"
                autoComplete="family-name"
              />
              <Input
                value={payload?.email ?? ""}
                readOnly
                placeholder="Email"
                type="email"
                autoComplete="email"
              />
              <Input
                value={resolvedPhone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Phone number"
                type="tel"
                autoComplete="tel"
              />
              <Button
                type="submit"
                variant="secondary"
                className="h-12 w-full"
                disabled={updateContactMutation.isPending}
              >
                {updateContactMutation.isPending ? "Saving contact details..." : "Save contact details"}
              </Button>
            </form>
            <p className="mt-3 text-sm leading-7 text-white/62">
              We use your saved canonical profile row to decide whether you can move into lane selection. Your full name, email, and phone must all be present before dashboard access unlocks.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-xs uppercase tracking-[0.22em] text-white/48">
              {payload?.missingFields?.length ? `Missing: ${payload.missingFields.join(", ").replaceAll("_", " ")}` : "Contact fields complete"}
            </div>
          </Card>

          <Card className="rounded-[28px] border border-white/8 bg-black/20 p-5">
            <p className="surface-label">Email verification</p>
            <p className="mt-3 text-xl font-semibold text-white">{payload?.email ?? "Loading email..."}</p>
            <p className="mt-3 text-sm leading-7 text-white/62">
              {payload?.emailVerified
                ? "Email is verified."
                : "Open the verification email we sent, then come back here. Google and Apple sign-in usually verify email automatically."}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                className="h-12 px-6"
                disabled={Boolean(payload?.emailVerified)}
                onClick={() => void handleResendEmail()}
              >
                {payload?.emailVerified ? "Email verified" : "Resend verification email"}
              </Button>
            </div>
          </Card>

          <Card className="rounded-[28px] border border-white/8 bg-black/20 p-5">
            <p className="surface-label">Phone verification</p>
            <p className="mt-3 text-sm leading-7 text-white/62">
              We send a short SMS code to the phone number attached to this account. Phone verification is required before role selection.
            </p>
            <form onSubmit={handleSendSms} className="mt-5 grid gap-3">
              <Button type="submit" variant="secondary" className="h-12 w-full" disabled={sendPhoneMutation.isPending}>
                {sendPhoneMutation.isPending ? "Sending code..." : payload?.phoneVerified ? "Send another code" : "Send SMS code"}
              </Button>
            </form>
            <form onSubmit={handleVerifyCode} className="mt-5 grid gap-3">
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Enter verification code"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
              <Button type="submit" className="h-12 w-full" disabled={verifyPhoneMutation.isPending || !code.trim()}>
                {verifyPhoneMutation.isPending ? "Verifying..." : payload?.phoneVerified ? "Phone verified" : "Verify phone"}
              </Button>
            </form>
          </Card>
        </div>

        {payload?.canContinue ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              type="button"
              className="h-12 px-6"
              disabled={isContinuing}
              onClick={() => void continueFromCanonicalState(payload.nextPath)}
            >
              {isContinuing ? "Continuing..." : "Continue"}
            </Button>
          </div>
        ) : null}

        {statusQuery.data?.degraded ? (
          <div className="mt-5 rounded-[22px] border border-[#cfff93]/18 bg-[#7cff00]/[0.08] p-4 text-sm leading-7 text-[#ddffb8]">
            Contact verification is running in a degraded mode, but your session is still active.
          </div>
        ) : null}
        {errorMessage ? <p className="mt-5 text-sm leading-7 text-[#ff8f8f]">{errorMessage}</p> : null}
        {successMessage ? <p className="mt-5 text-sm leading-7 text-[#d7ffab]">{successMessage}</p> : null}
      </Card>
    </section>
  );
}
