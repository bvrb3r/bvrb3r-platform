"use client";

import type { ReactNode } from "react";
import type { PriorityOneScreenAction, PriorityOneScreenSpec, PriorityOneTone } from "@/components/kiosk/priority1-screen-catalog";

const TONES: Record<PriorityOneTone, { signal: string; soft: string; border: string }> = {
  success: { signal: "#C4F24E", soft: "rgba(196,242,78,0.12)", border: "rgba(196,242,78,0.45)" },
  warning: { signal: "#D9B461", soft: "rgba(201,168,124,0.10)", border: "rgba(201,168,124,0.45)" },
  danger: { signal: "#FF9B9B", soft: "rgba(255,107,107,0.08)", border: "rgba(255,107,107,0.40)" },
  muted: { signal: "rgba(245,241,232,0.60)", soft: "rgba(245,241,232,0.06)", border: "rgba(245,241,232,0.20)" }
};

export interface PriorityOneStateScreenProps {
  spec: PriorityOneScreenSpec;
  category: string;
  categoryStep?: string;
  actions?: readonly PriorityOneScreenAction[];
  onAction?: (action: PriorityOneScreenAction, index: number) => void;
  disabledActions?: ReadonlySet<number>;
  beforeActions?: ReactNode;
  afterActions?: ReactNode;
  headerRight?: ReactNode;
  compact?: boolean;
  fullHeight?: boolean;
  ariaLive?: "off" | "polite" | "assertive";
}

export function PriorityOneStateScreen({
  spec,
  category,
  categoryStep,
  actions = spec.actions,
  onAction,
  disabledActions,
  beforeActions,
  afterActions,
  headerRight,
  compact = false,
  fullHeight = true,
  ariaLive = "polite"
}: PriorityOneStateScreenProps) {
  const tone = TONES[spec.tone];
  const categoryLabel = categoryStep ? `${category} · ${categoryStep}` : category;

  return (
    <main
      className={`${fullHeight ? "min-h-[100svh]" : "min-h-[680px]"} relative flex flex-col overflow-hidden bg-[#060708] text-[#F5F1E8]`}
      style={{ fontFamily: '"Archivo", ui-sans-serif, system-ui, sans-serif' }}
    >
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=Space+Mono:wght@400;700&display=swap"
      />
      <style>{`
        @keyframes bvrb3r-priority1-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bvrb3r-priority1-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
        @media (prefers-reduced-motion: reduce) {
          .bvrb3r-priority1-rise, .bvrb3r-priority1-pulse { animation: none !important; }
        }
      `}</style>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse 700px 420px at 50% -10%, rgba(196,242,78,0.07), transparent 60%)" }}
      />

      <header className="relative z-10 flex min-h-20 flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-extrabold tracking-[0.26em]">
            BVRB<span className="text-[#C4F24E]">3</span>R
          </span>
          <span
            className="rounded-full border border-[#C9A87C]/30 px-[13px] py-[6px] font-mono text-[10px] uppercase tracking-[0.20em] text-[#C9A87C]"
            style={{ fontFamily: '"Space Mono", ui-monospace, monospace' }}
          >
            {categoryLabel}
          </span>
        </div>
        {headerRight}
      </header>

      <section
        className={`relative z-[2] flex flex-1 items-center justify-center ${compact ? "px-4 py-5" : "px-5 pb-10 pt-7"}`}
        aria-live={ariaLive}
        aria-atomic="true"
      >
        <div
          className={`bvrb3r-priority1-rise w-full max-w-[720px] rounded-[28px] border bg-[rgba(245,241,232,0.03)] text-center ${compact ? "px-5 py-7 sm:px-8 sm:py-8" : "px-5 py-8 sm:px-[42px] sm:py-11"}`}
          style={{ borderColor: tone.border, animation: "bvrb3r-priority1-rise .4s ease both" }}
        >
          <span
            aria-hidden
            className={`${spec.key === "loading" || spec.key === "creating" || spec.key === "joining" || spec.key === "matching" ? "bvrb3r-priority1-pulse" : ""} inline-flex size-[76px] items-center justify-center rounded-full border text-[30px]`}
            style={{
              color: tone.signal,
              background: tone.soft,
              borderColor: tone.border,
              fontFamily: '"Instrument Serif", Georgia, serif',
              animation: spec.key === "loading" || spec.key === "creating" || spec.key === "joining" || spec.key === "matching" ? "bvrb3r-priority1-pulse 1.8s ease-in-out infinite" : undefined
            }}
          >
            {spec.icon}
          </span>

          <p
            className="mt-5 text-[10px] uppercase tracking-[0.28em] text-[#C9A87C]"
            style={{ fontFamily: '"Space Mono", ui-monospace, monospace' }}
          >
            {spec.eyebrow}
          </p>

          <h1
            className="mt-2.5 text-balance text-[clamp(2.25rem,6vw,2.5rem)] leading-[1.1]"
            style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
          >
            {spec.headline}<span className="text-[#C4F24E]">.</span>
          </h1>

          <p className="mx-auto mt-3.5 max-w-[54ch] text-pretty text-[14.5px] leading-[1.7] text-[#F5F1E8]/65">
            {spec.subline}
          </p>

          {spec.chips.length ? (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {spec.chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-[#C4F24E]/25 px-3.5 py-2 text-[11px] text-[#E4F9B8]"
                  style={{ fontFamily: '"Space Mono", ui-monospace, monospace' }}
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}

          {beforeActions}

          {actions.length ? (
            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              {actions.map((action, index) => {
                const disabled = disabledActions?.has(index) ?? false;
                return (
                  <button
                    key={`${action.label}-${index}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => onAction?.(action, index)}
                    className={`min-h-[50px] rounded-full border px-6 text-sm font-extrabold transition duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060708] disabled:cursor-not-allowed disabled:opacity-35 ${
                      action.primary
                        ? "border-[#C4F24E] bg-[#C4F24E] text-[#060708] hover:bg-[#D6FF6D]"
                        : "border-[#F5F1E8]/20 bg-transparent text-[#F5F1E8]/75 hover:border-[#F5F1E8]/35 hover:text-[#F5F1E8]"
                    }`}
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {afterActions}

          {spec.note ? (
            <p
              className="mt-[22px] text-[10px] leading-[1.7] tracking-[0.06em] text-[#F5F1E8]/40"
              style={{ fontFamily: '"Space Mono", ui-monospace, monospace' }}
            >
              {spec.note}
            </p>
          ) : null}
        </div>
      </section>

      <footer
        className="relative z-[2] pb-4 text-center text-[9px] uppercase tracking-[0.26em] text-[#F5F1E8]/25"
        style={{ fontFamily: '"Space Mono", ui-monospace, monospace' }}
      >
        Quietly powered by BVRB3R
      </footer>
    </main>
  );
}

export function PriorityOneField({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
  placeholder,
  error,
  help,
  maxLength
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "text" | "email" | "tel" | "numeric" | "search";
  autoComplete?: string;
  placeholder?: string;
  error?: string | null;
  help?: string;
  maxLength?: number;
}) {
  return (
    <label className="block text-left">
      <span className="mb-2 block font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#F5F1E8]/50">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`min-h-14 w-full rounded-2xl border bg-[#F5F1E8]/[0.035] px-4 text-base text-[#F5F1E8] outline-none transition placeholder:text-[#F5F1E8]/25 ${error ? "border-[#FF9B9B]/60 focus:border-[#FF9B9B]" : "border-[#F5F1E8]/10 focus:border-[#C9A87C]/65"}`}
      />
      {error ? <span className="mt-2 block text-xs text-[#FF9B9B]">{error}</span> : help ? <span className="mt-2 block text-xs leading-5 text-[#F5F1E8]/35">{help}</span> : null}
    </label>
  );
}

export function PriorityOneChoice({
  checked,
  onChange,
  title,
  body,
  required = false
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  body?: string;
  required?: boolean;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-2xl border border-[#F5F1E8]/10 bg-[#F5F1E8]/[0.025] p-4 text-left">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
      <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border text-xs ${checked ? "border-[#C4F24E] bg-[#C4F24E] text-[#060708]" : "border-[#F5F1E8]/20"}`}>{checked ? "✓" : ""}</span>
      <span>
        <strong className="block text-sm text-[#F5F1E8]">{title}{required ? <span className="ml-1 text-[#C9A87C]">Required</span> : null}</strong>
        {body ? <span className="mt-1 block text-xs leading-5 text-[#F5F1E8]/45">{body}</span> : null}
      </span>
    </label>
  );
}
