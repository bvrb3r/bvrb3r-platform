"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, History, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";

type ClientBridgeGuestHistoryResolution = {
  status: "claimed" | "already_resolved";
  targetClientId: string;
  invitationsClaimed: number;
  sourceClientsMerged: number;
  appointmentsMerged: number;
  queueEntriesMerged: number;
  chairSyncAppointmentsMerged: number;
  consentEventsMerged: number;
};

type GuestHistoryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "complete"; resolution: ClientBridgeGuestHistoryResolution }
  | { status: "failed"; message: string };

export function ClientBridgeGuestHistorySetup() {
  const [state, setState] = useState<GuestHistoryState>({ status: "idle" });

  async function resolveHistory() {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/clientbridge/guest-history", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" }
      });
      const body = await response.json().catch(() => ({})) as {
        resolution?: ClientBridgeGuestHistoryResolution;
        error?: string;
      };
      if (!response.ok || !body.resolution) {
        throw new Error(body.error ?? "Guest history could not be resolved.");
      }
      setState({ status: "complete", resolution: body.resolution });
    } catch (error) {
      setState({
        status: "failed",
        message: error instanceof Error ? error.message : "Guest history could not be resolved."
      });
    }
  }

  const mergedVisits = state.status === "complete"
    ? state.resolution.appointmentsMerged + state.resolution.queueEntriesMerged
    : 0;

  return (
    <main className="bvr-screen pb-20">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-7">
        <Link href="/road" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-xs font-bold text-white/72">
          <ArrowLeft className="h-4 w-4" /> Back to The Road
        </Link>

        <section className="mt-8 rounded-[28px] border border-[color:var(--bvr-green-border)] bg-[var(--bvr-green-soft)] p-6 sm:p-8">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--bvr-green-border)] bg-black/15 text-[var(--bvr-green-text)]">
            <History className="h-6 w-6" />
          </span>
          <p className="mt-6 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--bvr-green-text)]">ClientBridge · server verified</p>
          <h1 className="mt-3 font-serif text-4xl">Resolve guest history</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
            BVRB3R will securely match eligible shop invitations and walk-in history to your verified email and phone. It will merge only canonical server records; this button cannot invent visits.
          </p>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/10 p-4 text-xs leading-6 text-white/58">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--bvr-green-text)]" />
            Both email and phone must be verified. Calling this again is safe and will not duplicate history.
          </div>

          {state.status === "complete" ? (
            <div role="status" className="mt-6 rounded-2xl border border-[color:var(--bvr-green-border)] bg-black/10 p-5">
              <div className="flex items-center gap-3 text-[var(--bvr-green-text)]">
                <CheckCircle2 className="h-5 w-5" />
                <strong className="text-sm">Guest history resolved</strong>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/62">
                {mergedVisits > 0
                  ? `${mergedVisits} eligible visit record${mergedVisits === 1 ? " was" : "s were"} merged into this client account.`
                  : "No eligible guest history is waiting to be merged. Your setup is resolved."}
              </p>
              <Link href="/road" className="bvr-primary-action mt-5 inline-flex min-h-11 items-center px-5 text-xs">Return to The Road</Link>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void resolveHistory()}
              disabled={state.status === "loading"}
              className="bvr-primary-action mt-6 inline-flex min-h-12 items-center gap-2 px-6 text-xs disabled:cursor-wait disabled:opacity-60"
            >
              {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
              {state.status === "loading" ? "Checking server records…" : "Resolve guest history"}
            </button>
          )}

          {state.status === "failed" ? (
            <p role="alert" className="mt-4 rounded-2xl border border-red-300/20 bg-red-300/[0.06] p-4 text-sm leading-6 text-red-100/80">{state.message}</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
