"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useId, useState } from "react";
import { LockKeyhole, X } from "lucide-react";
import {
  FEATURE_GATE_REASONS,
  GATES,
  type FeatureGateKey,
  type FeatureGateReason,
  type FeatureGateScale
} from "@/lib/feature-gates";
import { useResolvedFeatureGate } from "@/lib/feature-gates-client";
import { cn } from "@/lib/utils";

type FeatureGateProps = {
  reason: FeatureGateReason;
  scale: FeatureGateScale;
  label: string;
  note?: string;
  reasonCopy?: string;
  enabled?: boolean;
  className?: string;
  children: ReactNode;
};

const scaleClass: Record<FeatureGateScale, string> = {
  card: "block min-h-[10rem] w-full rounded-[inherit]",
  row: "block min-h-14 w-full rounded-[inherit]",
  button: "inline-flex rounded-[inherit]"
};

const overlayClass: Record<FeatureGateScale, string> = {
  card: "flex-col justify-center gap-2 px-5 py-6 text-center",
  row: "flex-row justify-end gap-3 px-4 py-3 text-right",
  button: "flex-row justify-center gap-2 px-3 py-2 text-center"
};

export function FeatureGate({
  reason,
  scale,
  label,
  note,
  reasonCopy,
  enabled = false,
  className,
  children
}: FeatureGateProps) {
  const [showReason, setShowReason] = useState(false);
  const tooltipId = useId();
  const presentation = FEATURE_GATE_REASONS[reason];
  const displayReason = reasonCopy ?? presentation.copy;

  if (enabled) {
    return children;
  }

  const colorStyle = { "--feature-gate-color": presentation.color } as CSSProperties;

  return (
    <div
      className={cn("relative isolate overflow-hidden", scaleClass[scale], className)}
      data-feature-gate=""
      data-feature-gate-reason={reason}
      data-feature-gate-scale={scale}
      style={colorStyle}
    >
      <div
        aria-hidden="true"
        inert
        className="h-full w-full pointer-events-none select-none opacity-[0.55]"
      >
        {children}
      </div>

      <div
        className={cn(
          "absolute inset-0 z-10 flex items-center bg-[rgba(10,10,12,0.55)] font-sans text-[#F5F1E8] backdrop-blur-[7px]",
          overlayClass[scale]
        )}
      >
        <button
          type="button"
          aria-describedby={showReason ? tooltipId : undefined}
          aria-expanded={showReason}
          aria-label={`${label}: ${displayReason}. Show reason.`}
          className="absolute inset-0 z-0 min-h-12 cursor-pointer rounded-[inherit] border-0 bg-transparent"
          onClick={() => setShowReason((current) => !current)}
        />

        <span
          className="pointer-events-none relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border bg-black/20 text-[var(--feature-gate-color)]"
          style={{ borderColor: presentation.color }}
          aria-hidden="true"
        >
          <LockKeyhole className="h-3 w-3" strokeWidth={2} />
        </span>

        <span className={cn("pointer-events-none relative z-10 min-w-0", scale === "card" ? "space-y-1.5" : "")}>
          <span
            className="block font-mono text-[8.5px] font-bold uppercase tracking-[0.2em] text-[var(--feature-gate-color)]"
          >
            {displayReason}
          </span>
          <span className={cn(
            "block font-semibold text-white/86",
            scale === "card" ? "text-sm" : scale === "row" ? "text-xs" : "sr-only"
          )}>
            {label}
          </span>
        </span>

        {reason === "plan" ? (
          <Link
            href="/pricing"
            className={cn(
              "relative z-20 shrink-0 rounded-full bg-[#C4F24E] font-bold text-black transition hover:bg-[#E4F9B8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C4F24E]",
              scale === "card" ? "mt-1 px-4 py-2 text-xs" : "ml-auto px-3 py-1.5 text-[11px]"
            )}
          >
            See Pro
          </Link>
        ) : null}

        {showReason ? (
          <div
            id={tooltipId}
            role="tooltip"
            className={cn(
              "absolute z-30 rounded-xl border border-white/12 bg-[#111214] p-3 text-left text-xs leading-5 text-white/72 shadow-2xl",
              scale === "card"
                ? "bottom-4 left-1/2 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2"
                : "inset-x-2 top-2"
            )}
          >
            <button
              type="button"
              aria-label="Close reason"
              className="absolute right-2 top-2 rounded-full p-1 text-white/40 hover:text-white"
              onClick={() => setShowReason(false)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="pr-6 font-semibold text-white/90">{label}</p>
            <p className="mt-1">{note ?? presentation.tooltip}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type RegisteredFeatureGateProps = Omit<FeatureGateProps, "reason" | "note"> & {
  gateKey: FeatureGateKey;
  note?: string;
};

export function RegisteredFeatureGate({
  gateKey,
  note,
  enabled,
  ...props
}: RegisteredFeatureGateProps) {
  const definition = GATES[gateKey];
  const resolved = useResolvedFeatureGate(gateKey);

  return (
    <FeatureGate
      {...props}
      reason={resolved.reason ?? definition.reason}
      note={note ?? resolved.note ?? definition.note}
      enabled={enabled ?? resolved.enabled}
    />
  );
}
