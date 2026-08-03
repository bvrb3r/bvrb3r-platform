"use client";

import type { ReactNode } from "react";
import Link from "next/link";

export type Pr27RailItem = {
  id: string;
  label: string;
};

export function Pr27TrustShell({
  pathLabel,
  rail,
  activeState,
  onStateChange,
  eyebrow,
  headline,
  icon,
  tone = "green",
  children
}: {
  pathLabel: string;
  rail: Pr27RailItem[];
  activeState: string;
  onStateChange: (state: string) => void;
  eyebrow: string;
  headline: string;
  icon: string;
  tone?: "green" | "gold" | "red" | "dim";
  children: ReactNode;
}) {
  const tones = {
    green: {
      color: "#C4F24E",
      soft: "rgba(196,242,78,0.12)",
      border: "rgba(196,242,78,0.42)"
    },
    gold: {
      color: "#D9B461",
      soft: "rgba(201,168,124,0.10)",
      border: "rgba(201,168,124,0.42)"
    },
    red: {
      color: "#FF9B9B",
      soft: "rgba(255,107,107,0.08)",
      border: "rgba(255,107,107,0.40)"
    },
    dim: {
      color: "rgba(245,241,232,0.62)",
      soft: "rgba(245,241,232,0.06)",
      border: "rgba(245,241,232,0.20)"
    }
  } as const;
  const activeTone = tones[tone];

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#060708] text-[#F5F1E8]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(196,242,78,0.09),transparent_34%),radial-gradient(circle_at_100%_50%,rgba(201,168,124,0.06),transparent_32%)]" />
      <header className="relative z-10 flex flex-wrap items-center gap-4 border-b border-white/10 px-5 py-4 sm:px-8">
        <Link href="/" className="font-display text-sm font-black tracking-[0.28em] text-white">
          BVRB3R
        </Link>
        <span className="rounded-full border border-[#C9A87C]/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#C9A87C]">
          {pathLabel}
        </span>
      </header>

      <nav
        className="relative z-10 flex gap-2 overflow-x-auto border-b border-white/10 px-5 py-4 sm:px-8"
        aria-label={`${pathLabel} states`}
      >
        {rail.map((item) => {
          const selected = item.id === activeState;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onStateChange(item.id)}
              aria-pressed={selected}
              className="shrink-0 rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.16em] transition"
              style={{
                borderColor: selected ? activeTone.border : "rgba(245,241,232,0.12)",
                background: selected ? activeTone.soft : "rgba(245,241,232,0.025)",
                color: selected ? activeTone.color : "rgba(245,241,232,0.46)"
              }}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <section
        className="relative z-10 mx-auto my-7 w-[calc(100%-2.5rem)] max-w-5xl rounded-[30px] border px-5 py-10 sm:my-9 sm:px-8 sm:py-14"
        style={{
          borderColor: activeTone.border,
          background: "linear-gradient(180deg,rgba(18,19,18,0.90),rgba(8,9,9,0.96))"
        }}
      >
        <div className="mx-auto max-w-3xl text-center">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border font-serif text-3xl"
            style={{
              borderColor: activeTone.border,
              background: activeTone.soft,
              color: activeTone.color
            }}
          >
            {icon}
          </div>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.28em] text-[#C9A87C]">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-serif text-[clamp(38px,6vw,58px)] font-normal leading-[1.02] tracking-[-0.02em]">
            {headline}<span className="text-[#C4F24E]">.</span>
          </h1>
        </div>
        {children}
      </section>

      <footer className="relative z-10 pb-5 text-center font-mono text-[9px] uppercase tracking-[0.26em] text-white/25">
        Quietly powered by BVRB3R
      </footer>
    </main>
  );
}

export function Pr27EvidenceCard({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto mt-7 max-w-3xl">
      {children}
    </div>
  );
}

export function Pr27PrimaryButton({
  children,
  onClick,
  disabled = false,
  tone = "green",
  type = "button"
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "green" | "red";
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={[
        "min-h-12 rounded-full px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-white/8 disabled:text-white/30",
        tone === "red"
          ? "bg-[#FF9B9B] text-[#060708] hover:bg-[#ffb0b0]"
          : "bg-[#C4F24E] text-[#060708] hover:bg-[#d5ff72]"
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function Pr27SecondaryButton({
  children,
  onClick,
  disabled = false
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-12 rounded-full border border-white/14 bg-white/[0.035] px-5 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white/68 transition hover:border-white/24 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
