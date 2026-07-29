"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3, Loader2, LockKeyhole, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import type { PublicQueueStatusView } from "@/lib/rent/service";
import { sourceBadge } from "@/lib/clientbridge/domain";
import { getQueueSyncHealth } from "@/lib/queue/domain";
import { Button } from "@/components/ui/button";

export function PublicQueueStatus({
  token,
  initialStatus
}: {
  token: string;
  initialStatus: PublicQueueStatusView;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [refreshing, setRefreshing] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const rejoinKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const interval = window.setInterval(() => {
      if (!active) return;
      setRefreshing(true);
      void fetch(`/api/queue/status/${token}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) return null;
          return response.json() as Promise<PublicQueueStatusView>;
        })
        .then((next) => {
          if (active && next) setStatus(next);
        })
        .catch(() => null)
        .finally(() => {
          if (active) setRefreshing(false);
        });
    }, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [token]);

  const syncHealth = getQueueSyncHealth(status.lastSyncedAt);
  const external = status.sourceProvider !== "bvrb3r";

  async function handleRejoin() {
    setRejoining(true);
    setActionError(null);
    rejoinKeyRef.current ??= globalThis.crypto?.randomUUID?.() ?? `queue-rejoin-${Date.now()}`;
    try {
      const response = await fetch(`/api/queue/status/${token}/rejoin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idempotencyKey: rejoinKeyRef.current })
      });
      const body = await response.json() as { token?: string; error?: string };
      if (!response.ok || !body.token) {
        throw new Error(body.error ?? "Unable to rejoin the queue.");
      }
      window.location.assign(`/queue/${body.token}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to rejoin the queue.");
      setRejoining(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#060706] px-4 py-8 text-white sm:px-6 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-black tracking-[0.32em]">BVRB<span className="text-[#C4F24E]">3</span>R</p>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/42">
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 text-[#C4F24E]" />}
            Private queue · {status.queueReference}
          </p>
        </div>

        <section className="mt-8 rounded-[34px] border border-[#C4F24E]/20 bg-[radial-gradient(circle_at_top,rgba(196,242,78,0.10),transparent_28%),rgba(255,255,255,0.025)] p-6 text-center shadow-[0_40px_100px_rgba(0,0,0,0.55)] sm:p-10">
          <div className="mx-auto grid h-28 w-28 place-items-center rounded-full border border-[#C4F24E]/30 bg-[#C4F24E]/8 text-5xl font-semibold text-[#C4F24E]" data-display="true">
            {status.position ?? "—"}
          </div>
          <p className="mt-7 text-[11px] font-black uppercase tracking-[0.28em] text-[#C4F24E]">{status.copy.eyebrow}</p>
          <h1 className="mx-auto mt-3 max-w-xl text-5xl font-semibold tracking-[-0.05em] sm:text-7xl" data-display="true">
            {status.copy.title}
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-white/58">{status.copy.detail}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/62">
              <Clock3 className="h-4 w-4 text-[#C4F24E]" />
              {status.estimatedWaitMinutes === null ? "Estimate updating" : `${status.estimatedWaitMinutes} min estimate`}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/62">
              <MapPin className="h-4 w-4 text-[#C4F24E]" />
              {status.shopName}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/62">
              {sourceBadge(status.sourceProvider)}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/62">
              <LockKeyhole className="h-4 w-4 text-[#D9B461]" />
              {status.assignmentLocked ? "Barber locked" : "Cash walk-in"}
            </span>
          </div>
          {status.waitReason ? (
            <p className="mx-auto mt-5 max-w-lg text-xs leading-6 text-white/42">{status.waitReason}</p>
          ) : null}
          {status.state === "reassigned" ? (
            <div className="mx-auto mt-7 max-w-md rounded-[22px] border border-amber-300/20 bg-amber-300/8 p-4 text-sm text-amber-50">
              {status.reassignedBarberLabel ?? "Your new barber"}
              {external ? " · payment remains private at the booking provider" : ""}
            </div>
          ) : null}
          {external ? (
            <div className="mx-auto mt-5 max-w-md rounded-[22px] border border-[#D9B461]/20 bg-[#D9B461]/8 p-4 text-sm leading-6 text-white/65">
              Your place in line is here. Payment stays managed by {sourceBadge(status.sourceProvider)} and is never shown or counted as BVRB3R money.
            </div>
          ) : null}
          {status.state === "missed" || status.state === "canceled" ? (
            <div className="mt-7">
              <Button disabled={rejoining} onClick={() => void handleRejoin()}>
                {rejoining ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Rejoining…</> : <><RefreshCw className="mr-2 h-4 w-4" />Rejoin the line</>}
              </Button>
            </div>
          ) : null}
          {actionError ? <p className="mt-4 text-sm text-red-200">{actionError}</p> : null}
        </section>

        <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs leading-6 text-white/38">
          <p>{syncHealth.label} · 30-second fallback polling is active if realtime is delayed.</p>
          <p>This private capability link shows only queue status. It never reveals your phone, email, service history, exact location, or another guest’s identity.</p>
        </div>
      </div>
    </main>
  );
}
