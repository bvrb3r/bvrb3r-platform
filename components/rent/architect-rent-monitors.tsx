"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Eye, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { GlobalSafetyState } from "@/components/ui/global-safety-state";
import type {
  ArchitectMonitorCard,
  ArchitectRentMonitorPayload
} from "@/lib/rent/monitors";
import { cn } from "@/lib/utils";

function MonitorSurface({
  label,
  eyebrow,
  cards
}: {
  label: string;
  eyebrow: string;
  cards: ArchitectMonitorCard[];
}) {
  const [selectedId, setSelectedId] = useState(cards[0]?.id ?? "");
  const selected = useMemo(
    () => cards.find((card) => card.id === selectedId) ?? cards[0],
    [cards, selectedId]
  );

  if (!selected) return <GlobalSafetyState state="empty" detail="No monitor evidence is available." />;

  return (
    <section className="space-y-5" data-screen-label={label}>
      <nav aria-label={`${label} states`} className="flex flex-wrap gap-2">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setSelectedId(card.id)}
            className={cn(
              "inline-flex min-h-10 items-center gap-2.5 rounded-full border px-4 font-mono text-[9px] uppercase tracking-[0.12em]",
              selected.id === card.id
                ? "border-[#C4F24E]/45 bg-[#C4F24E]/10 text-[#E4F9B8]"
                : "border-white/10 bg-white/[0.015] text-white/48"
            )}
          >
            <span>{card.label}</span>
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              card.status === "Pass" && "bg-[#C4F24E]",
              card.status === "Needs Review" && "bg-[#D9B461]",
              card.status === "Failed" && "bg-[#F0563C]"
            )} />
          </button>
        ))}
      </nav>

      <article className="grid min-h-[34rem] place-content-center rounded-[26px] border border-[#C4F24E]/28 bg-[radial-gradient(circle_at_center,rgba(196,242,78,0.07),transparent_38%),#08090A] p-7 text-center">
        <span className={cn(
          "mx-auto grid h-18 w-18 place-items-center rounded-full border text-2xl",
          selected.status === "Pass" && "border-[#C4F24E]/35 text-[#C4F24E]",
          selected.status === "Needs Review" && "border-[#D9B461]/35 text-[#D9B461]",
          selected.status === "Failed" && "border-[#F0563C]/35 text-[#F0563C]"
        )}>
          {selected.status === "Pass" ? <Check className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
        </span>
        <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">{eyebrow}</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-5xl text-white sm:text-7xl" data-display="true">
          {selected.headline}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-white/48">{selected.detail}</p>
        <p className="mx-auto mt-7 rounded-full border border-white/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/58">
          {selected.metric}
        </p>
        {selected.incidentReference ? (
          <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.14em] text-[#F0563C]">
            Incident {selected.incidentReference}
          </p>
        ) : null}
      </article>
    </section>
  );
}

export function ArchitectRentMonitors() {
  const [mode, setMode] = useState<"chairsync" | "money">("chairsync");
  const [payload, setPayload] = useState<ArchitectRentMonitorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/architect/rent-monitors", {
      cache: "no-store"
    });
    const body = await response.json().catch(() => ({})) as ArchitectRentMonitorPayload & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Monitor evidence could not load.");
    setPayload(body);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load()
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Monitor evidence could not load.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  return (
    <main className="px-3 py-5 sm:px-5">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs font-black tracking-[0.22em] text-white">BVRB3R</span>
              <span className="rounded-full border border-white/12 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#C9A87C]">
                Architect · {mode === "chairsync" ? "ChairSync · source attribution" : "ClientBridge · money separation"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([
                ["chairsync", "ChairSync & attribution"],
                ["money", "ClientBridge & money"]
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={cn(
                    "min-h-10 rounded-full border px-4 font-mono text-[9px] uppercase tracking-[0.13em]",
                    mode === key
                      ? "border-[#C4F24E]/40 bg-[#C4F24E]/10 text-[#E4F9B8]"
                      : "border-white/10 text-white/42"
                  )}
                >
                  {label}
                </button>
              ))}
              <span className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#7FB5FF]/30 px-4 font-mono text-[9px] uppercase tracking-[0.14em] text-[#BFD8FF]">
                <Eye className="h-4 w-4" /> Read only
              </span>
              <button
                type="button"
                onClick={() => void load()}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-white/45"
                aria-label="Refresh monitor evidence"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="grid min-h-72 place-items-center">
            <Loader2 className="h-7 w-7 animate-spin text-[#C4F24E]" aria-label="Loading monitor evidence" />
          </div>
        ) : null}
        {error ? (
          <GlobalSafetyState
            state="failed"
            detail={error}
            actionLabel="Retry monitor evidence"
            onAction={() => void load()}
          />
        ) : null}
        {!loading && !error && payload ? (
          <>
            {payload.warnings.length ? (
              <GlobalSafetyState
                state="incident"
                incidentReference="BVR-PR26-MONITOR-EVIDENCE"
                detail={payload.warnings.join(" ")}
                className="mb-4"
              />
            ) : null}
            {mode === "chairsync" ? (
              <MonitorSurface
                label="Architect ChairSync & Attribution"
                eyebrow="ChairSync · source truth"
                cards={payload.chairSync}
              />
            ) : (
              <MonitorSurface
                label="Architect ClientBridge & Money"
                eyebrow="ClientBridge · money integrity"
                cards={payload.clientBridgeMoney}
              />
            )}
          </>
        ) : null}

        <p className="mt-5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">
          <ShieldCheck className="h-4 w-4 text-[#C4F24E]" />
          Diagnostics only · no payment, dispute, payout, or rent mutation exists on this surface
        </p>
      </div>
    </main>
  );
}
