"use client";

import Link from "next/link";
import { ChevronRight, MapPinned } from "lucide-react";
import { useEffect, useState } from "react";
import type { RoadHomeSummary } from "@/lib/road/home-summary";
import { cn } from "@/lib/utils";

type RoadHomeWidgetState =
  | { status: "loading" }
  | { status: "ready"; summary: RoadHomeSummary }
  | { status: "failed"; message: string };

async function loadSummary(signal: AbortSignal) {
  const response = await fetch("/api/road/summary", {
    cache: "no-store",
    credentials: "same-origin",
    signal
  });
  const body = await response.json().catch(() => ({})) as {
    summary?: RoadHomeSummary;
    error?: string;
  };
  if (!response.ok || !body.summary) {
    throw new Error(body.error ?? "Road progress could not be verified.");
  }
  return body.summary;
}

export function RoadHomeWidget({
  compact = false,
  tone = "green",
  className
}: {
  compact?: boolean;
  tone?: "green" | "gold";
  className?: string;
}) {
  const [state, setState] = useState<RoadHomeWidgetState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void loadSummary(controller.signal)
      .then((summary) => setState({ status: "ready", summary }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState({
            status: "failed",
            message: error instanceof Error ? error.message : "Road progress could not be verified."
          });
        }
      });
    return () => controller.abort();
  }, []);

  if (state.status === "ready" && state.summary.hidden) {
    return null;
  }

  if (state.status === "loading") {
    return (
      <div
        aria-label="Loading Road progress"
        aria-busy="true"
        className={cn("min-h-12 animate-pulse rounded-[20px] border border-white/8 bg-white/[0.025]", className)}
        data-testid="road-home-widget-loading"
      />
    );
  }

  if (state.status === "failed" || state.summary.serverTruth === "unavailable") {
    const message = state.status === "failed"
      ? state.message
      : "Road server truth is unavailable. No progress was guessed.";
    return (
      <Link
        href="/road"
        className={cn("flex min-h-16 items-center gap-3 rounded-[20px] border border-amber-300/18 bg-amber-300/[0.045] px-4 text-sm text-white/62", className)}
        data-testid="road-home-widget-unavailable"
      >
        <MapPinned className="h-4 w-4 shrink-0 text-amber-200" />
        <span className="min-w-0 flex-1"><strong className="text-white">The Road needs review.</strong> {message}</span>
        <ChevronRight className="h-4 w-4 shrink-0" />
      </Link>
    );
  }

  const { summary } = state;
  const accent = tone === "gold"
    ? "border-[var(--bvr-gold-border)] bg-[var(--bvr-gold-soft)]"
    : "border-[var(--bvr-green-border)] bg-[var(--bvr-green-soft)]";
  const accentText = tone === "gold" ? "text-[var(--bvr-gold-bright)]" : "text-[var(--bvr-green-text)]";

  return (
    <Link
      href="/road"
      className={cn(
        "group block rounded-[20px] border p-4 transition hover:border-[#C4F24E]/45",
        accent,
        compact ? "sm:inline-flex sm:min-h-14 sm:w-full sm:items-center sm:gap-4" : "sm:p-5",
        className
      )}
      data-testid="road-home-widget"
    >
      <div className={cn("flex items-center gap-3", compact && "sm:contents")}>
        <span className={cn("inline-flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em]", accentText)}>
          <MapPinned className="h-4 w-4" /> The Road
        </span>
        <span className={cn("ml-auto rounded-full border border-current/20 px-3 py-1 font-mono text-[8px] uppercase tracking-[0.12em]", accentText, compact && "sm:ml-0")}>
          {summary.currentSet.code} · {summary.currentSet.name}
        </span>
      </div>

      <div className={cn("mt-4 flex min-w-0 items-center gap-3", compact && "sm:ml-auto sm:mt-0 sm:w-[min(34rem,55%)]")}>
        <div className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-black/20">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#C4F24E] to-[#D9B461]"
            style={{ width: `${summary.percent}%` }}
          />
        </div>
        <span className={cn("font-mono text-[10px]", accentText)}>{summary.percent}%</span>
        <span className="font-mono text-[9px] text-white/46">
          {summary.currentSet.completedAchievements}/{summary.currentSet.totalAchievements}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/36 transition group-hover:translate-x-0.5 group-hover:text-white/72" />
      </div>

      {!compact ? (
        <p className="mt-3 text-xs leading-5 text-white/58">
          {summary.nextAchievement ? `Next: ${summary.nextAchievement}` : "The summit is complete."}
        </p>
      ) : null}
    </Link>
  );
}
