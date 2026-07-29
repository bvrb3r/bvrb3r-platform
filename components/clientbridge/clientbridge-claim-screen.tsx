"use client";

import { useState } from "react";
import { CheckCircle2, Clock3, Loader2, ShieldCheck, UserRoundPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BookingSourceProvider } from "@/lib/clientbridge/domain";
import { sourceBadge } from "@/lib/clientbridge/domain";

type ClaimView = {
  state: "claimable" | "expired" | "already_used" | "declined" | "suppressed" | "failed";
  sourceProvider: BookingSourceProvider;
  maskedContact: string;
  expiresAt: string | null;
};

export function ClientBridgeClaimScreen({
  token,
  claim,
  authenticated
}: {
  token: string;
  claim: ClaimView;
  authenticated: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "claiming" | "claimed" | "declining" | "declined">("idle");
  const [result, setResult] = useState<{ appointmentsMerged: number; queueEntriesMerged: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function claimHistory() {
    setStatus("claiming");
    setError(null);
    const response = await fetch(`/api/clientbridge/claim/${token}`, { method: "POST" });
    const body = await response.json() as {
      error?: string;
      appointmentsMerged?: number;
      queueEntriesMerged?: number;
    };
    if (!response.ok) {
      setStatus("idle");
      setError(body.error ?? "Unable to claim this visit history.");
      return;
    }
    setResult({
      appointmentsMerged: body.appointmentsMerged ?? 0,
      queueEntriesMerged: body.queueEntriesMerged ?? 0
    });
    setStatus("claimed");
  }

  async function decline() {
    setStatus("declining");
    setError(null);
    const response = await fetch(`/api/clientbridge/claim/${token}`, { method: "DELETE" });
    const body = await response.json() as { error?: string };
    if (!response.ok) {
      setStatus("idle");
      setError(body.error ?? "Unable to save your choice.");
      return;
    }
    setStatus("declined");
  }

  const unavailable = claim.state !== "claimable";
  const title = status === "claimed"
    ? "Your visit history is home."
    : status === "declined"
      ? "No account change was made."
      : claim.state === "expired"
        ? "This activation link expired."
        : claim.state === "already_used"
          ? "This activation link already did its job."
          : unavailable
            ? "This activation link is no longer active."
            : "Claim your BVRB3R history.";

  return (
    <main className="min-h-screen bg-[#070807] px-4 py-10 text-white sm:px-6 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-black tracking-[0.32em]">BVRB<span className="text-[#C4F24E]">3</span>R</p>
          <span className="rounded-full border border-[#D9B461]/25 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#D9B461]">
            ClientBridge · {sourceBadge(claim.sourceProvider)}
          </span>
        </div>

        <section className="mt-8 rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(196,242,78,0.10),transparent_30%),rgba(255,255,255,0.025)] p-6 text-center shadow-[0_40px_100px_rgba(0,0,0,0.55)] sm:p-10">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-[#C4F24E]/30 bg-[#C4F24E]/8">
            {status === "claimed" || status === "declined" || claim.state === "already_used"
              ? <CheckCircle2 className="h-9 w-9 text-[#C4F24E]" />
              : <UserRoundPlus className="h-9 w-9 text-[#C4F24E]" />}
          </div>
          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.26em] text-[#C4F24E]">Verified on your device</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-6xl" data-display="true">{title}</h1>

          {status === "claimed" ? (
            <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-white/60">
              {result?.appointmentsMerged ?? 0} appointment record{result?.appointmentsMerged === 1 ? "" : "s"} and {result?.queueEntriesMerged ?? 0} queue visit{result?.queueEntriesMerged === 1 ? "" : "s"} now belong to this client account.
            </p>
          ) : status === "declined" ? (
            <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-white/60">
              Your guest check-in remains complete. We recorded the decline and will suppress future kiosk invitations.
            </p>
          ) : (
            <>
              <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-white/60">
                This single-use link was sent to {claim.maskedContact}. It can attach the guest visit to your verified client account; it never moves external payment data.
              </p>
              {claim.expiresAt && claim.state === "claimable" ? (
                <p className="mt-4 inline-flex items-center gap-2 text-xs text-white/45">
                  <Clock3 className="h-4 w-4 text-[#D9B461]" />
                  Expires {new Date(claim.expiresAt).toLocaleString()}
                </p>
              ) : null}
            </>
          )}

          {claim.state === "claimable" && status !== "claimed" && status !== "declined" ? (
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              {authenticated ? (
                <Button disabled={status === "claiming" || status === "declining"} onClick={() => void claimHistory()}>
                  {status === "claiming" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Claiming…</> : "Claim my visit history"}
                </Button>
              ) : (
                <>
                  <Button onClick={() => window.location.assign(`/login?redirect=/claim/${token}`)}>
                    Sign in to claim
                  </Button>
                  <Button variant="secondary" onClick={() => window.location.assign(`/signup?redirect=/claim/${token}`)}>
                    Create client account
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                disabled={status === "claiming" || status === "declining"}
                onClick={() => void decline()}
              >
                {status === "declining" ? "Saving…" : "Not now"}
              </Button>
            </div>
          ) : null}
          {error ? <p className="mt-5 text-sm text-red-200">{error}</p> : null}
        </section>

        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs leading-6 text-white/38">
          <ShieldCheck className="h-4 w-4 text-[#C4F24E]" />
          The kiosk never shows or sets a password. Account access stays on your own device.
        </p>
      </div>
    </main>
  );
}
