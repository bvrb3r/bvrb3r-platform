"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Check, LoaderCircle, LockKeyhole, RefreshCw, WifiOff } from "lucide-react";

export const KIOSK_COLORS = {
  black: "#050505",
  surface: "#0B0B0B",
  ivory: "#F5F1E8",
  gold: "#C9A87C",
  green: "#C4F24E",
  red: "#FF6B6B"
} as const;

export function KioskShell({ children, largeText = false }: { children: ReactNode; largeText?: boolean }) {
  return (
    <main className={`relative min-h-[100svh] overflow-hidden bg-[#050505] text-[#F5F1E8] ${largeText ? "text-[1.12rem]" : ""}`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-80 [background:radial-gradient(circle_at_16%_10%,rgba(201,168,124,0.12),transparent_26%),radial-gradient(circle_at_85%_25%,rgba(196,242,78,0.06),transparent_24%),linear-gradient(180deg,#050505_0%,#090A09_55%,#050505_100%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.3)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="relative mx-auto flex min-h-[100svh] w-full max-w-[1480px] flex-col px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
        {children}
      </div>
    </main>
  );
}

export function KioskHeader({
  shopName,
  location,
  sourceLabel,
  onAccessibility,
  onExit,
  largeText
}: {
  shopName: string;
  location?: string;
  sourceLabel?: string;
  onAccessibility?: () => void;
  onExit?: () => void;
  largeText?: boolean;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-black uppercase tracking-[0.28em] text-[#C9A87C]">BVRB3R KIOSK</p>
        <h1 className="mt-2 truncate font-serif text-2xl text-[#F5F1E8] sm:text-3xl">{shopName}</h1>
        <p className="mt-1 truncate text-xs text-white/45">{sourceLabel ?? location}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onAccessibility ? (
          <button type="button" onClick={onAccessibility} className="min-h-11 rounded-full border border-white/10 bg-white/[0.035] px-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white/65 hover:border-white/20">
            {largeText ? "Standard text" : "Larger text"}
          </button>
        ) : null}
        {onExit ? (
          <button type="button" onClick={onExit} aria-label="Authorized kiosk exit" className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-white/55 hover:border-white/20 hover:text-white">
            <LockKeyhole className="size-4" />
          </button>
        ) : null}
      </div>
    </header>
  );
}

export function KioskStage({ eyebrow, title, body, children, footer }: {
  eyebrow?: string;
  title: string;
  body?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="flex flex-1 flex-col py-8 sm:py-10 lg:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
        <div className="max-w-4xl">
          {eyebrow ? <p className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-[#C9A87C]">{eyebrow}</p> : null}
          <h2 className="mt-3 text-balance font-serif text-[clamp(2.5rem,6vw,6.2rem)] leading-[0.93] tracking-[-0.04em] text-[#F5F1E8]">{title}</h2>
          {body ? <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-white/55 sm:text-lg">{body}</p> : null}
        </div>
        {children ? <div className="mt-8 flex-1">{children}</div> : <div className="flex-1" />}
        {footer ? <div className="mt-8 border-t border-white/10 pt-5">{footer}</div> : null}
      </div>
    </section>
  );
}

export function KioskGrid({ children, columns = 3 }: { children: ReactNode; columns?: 1 | 2 | 3 | 4 }) {
  const classes = columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-1 md:grid-cols-2" : columns === 4 ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";
  return <div className={`grid gap-4 ${classes}`}>{children}</div>;
}

export function KioskChoice({
  title,
  body,
  eyebrow,
  icon,
  active,
  disabled,
  onClick,
  badge,
  tone = "default"
}: {
  title: string;
  body?: string;
  eyebrow?: string;
  icon?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  badge?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const accent = tone === "success" ? "text-[#C4F24E]" : tone === "warning" ? "text-[#C9A87C]" : tone === "danger" ? "text-[#FF8A8A]" : "text-[#C9A87C]";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group relative min-h-44 overflow-hidden rounded-[30px] border p-6 text-left transition duration-300 ${active ? "border-[#C4F24E]/50 bg-[#C4F24E]/[0.07] shadow-[0_0_45px_rgba(196,242,78,0.06)]" : "border-white/10 bg-white/[0.03] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.05]"} disabled:cursor-not-allowed disabled:opacity-35`}
    >
      <div className="flex items-start justify-between gap-4">
        {icon ? <span className={`grid size-12 place-items-center rounded-2xl bg-white/[0.05] ${accent}`}>{icon}</span> : <span />}
        {badge ? <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 font-mono text-[9px] font-black uppercase tracking-[0.13em] text-white/55">{badge}</span> : null}
      </div>
      {eyebrow ? <p className={`mt-5 font-mono text-[10px] font-black uppercase tracking-[0.16em] ${accent}`}>{eyebrow}</p> : null}
      <h3 className="mt-3 font-serif text-3xl leading-none text-[#F5F1E8]">{title}</h3>
      {body ? <p className="mt-3 max-w-md text-sm leading-6 text-white/48">{body}</p> : null}
    </button>
  );
}

export function KioskButton({ children, onClick, disabled, secondary, danger, type = "button", className = "" }: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const style = danger
    ? "border border-[#FF6B6B]/30 bg-[#FF6B6B]/10 text-[#FFB1B1] hover:bg-[#FF6B6B]/15"
    : secondary
      ? "border border-white/12 bg-white/[0.035] text-[#F5F1E8] hover:border-white/25"
      : "bg-[#C4F24E] text-[#050505] shadow-[0_12px_38px_rgba(196,242,78,0.12)] hover:brightness-105";
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`inline-flex min-h-13 items-center justify-center gap-2 rounded-full px-6 font-mono text-[11px] font-black uppercase tracking-[0.13em] transition disabled:cursor-not-allowed disabled:opacity-35 ${style} ${className}`}>
      {children}
    </button>
  );
}

export function KioskInput({ label, value, onChange, placeholder, type = "text", autoComplete, inputMode, help, error }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric" | "search";
  help?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[10px] font-black uppercase tracking-[0.14em] text-white/50">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className={`min-h-14 w-full rounded-2xl border bg-white/[0.035] px-4 text-base text-[#F5F1E8] outline-none transition placeholder:text-white/25 ${error ? "border-[#FF6B6B]/60 focus:border-[#FF6B6B]" : "border-white/10 focus:border-[#C9A87C]/60"}`}
      />
      {error ? <span className="mt-2 block text-xs text-[#FF9A9A]">{error}</span> : help ? <span className="mt-2 block text-xs text-white/35">{help}</span> : null}
    </label>
  );
}

export function KioskCheck({ checked, onChange, title, body, disabled }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  body?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4 ${disabled ? "opacity-40" : "cursor-pointer"}`}>
      <input className="sr-only" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border ${checked ? "border-[#C4F24E] bg-[#C4F24E] text-black" : "border-white/20 bg-white/[0.03]"}`}>{checked ? <Check className="size-4" /> : null}</span>
      <span>
        <strong className="block text-sm font-semibold text-[#F5F1E8]">{title}</strong>
        {body ? <span className="mt-1 block text-xs leading-5 text-white/42">{body}</span> : null}
      </span>
    </label>
  );
}

export function SourceBadge({ label, external }: { label: string; external?: boolean }) {
  return <span className={`inline-flex rounded-full border px-3 py-1 font-mono text-[9px] font-black uppercase tracking-[0.13em] ${external ? "border-[#C9A87C]/30 bg-[#C9A87C]/10 text-[#DCC3A3]" : "border-[#C4F24E]/25 bg-[#C4F24E]/10 text-[#D9FF87]"}`}>{label}</span>;
}

export function KioskNotice({ title, body, tone = "default", actions }: {
  title: string;
  body: string;
  tone?: "default" | "success" | "warning" | "danger";
  actions?: ReactNode;
}) {
  const toneClass = tone === "success" ? "border-[#C4F24E]/25 bg-[#C4F24E]/[0.06]" : tone === "warning" ? "border-[#C9A87C]/30 bg-[#C9A87C]/[0.07]" : tone === "danger" ? "border-[#FF6B6B]/30 bg-[#FF6B6B]/[0.07]" : "border-white/10 bg-white/[0.03]";
  const Icon = tone === "success" ? Check : tone === "danger" || tone === "warning" ? AlertTriangle : RefreshCw;
  return (
    <div className={`rounded-[26px] border p-5 ${toneClass}`}>
      <div className="flex gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-black/25 text-[#C9A87C]"><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[#F5F1E8]">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-white/48">{body}</p>
          {actions ? <div className="mt-4 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function KioskSystemState({ state, title, body, onRetry, actions }: {
  state: "loading" | "offline" | "reconnecting" | "maintenance" | "error" | "success";
  title: string;
  body: string;
  onRetry?: () => void;
  actions?: ReactNode;
}) {
  const Icon = state === "loading" || state === "reconnecting" ? LoaderCircle : state === "offline" ? WifiOff : state === "success" ? Check : AlertTriangle;
  return (
    <div className="mx-auto flex min-h-[58vh] max-w-2xl flex-col items-center justify-center text-center">
      <span className={`grid size-20 place-items-center rounded-[28px] border border-white/10 bg-white/[0.035] ${state === "success" ? "text-[#C4F24E]" : state === "error" ? "text-[#FF8A8A]" : "text-[#C9A87C]"}`}>
        <Icon className={`size-8 ${state === "loading" || state === "reconnecting" ? "animate-spin" : ""}`} />
      </span>
      <h2 className="mt-7 font-serif text-5xl leading-none text-[#F5F1E8] sm:text-6xl">{title}</h2>
      <p className="mt-5 max-w-xl text-base leading-7 text-white/52">{body}</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {onRetry ? <KioskButton onClick={onRetry}><RefreshCw className="size-4" /> Try again</KioskButton> : null}
        {actions}
      </div>
    </div>
  );
}

export function KioskMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="font-mono text-[9px] font-black uppercase tracking-[0.14em] text-white/35">{label}</p>
      <p className="mt-2 font-serif text-3xl text-[#F5F1E8]">{value}</p>
      {detail ? <p className="mt-1 text-xs text-white/38">{detail}</p> : null}
    </div>
  );
}
