import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, Sparkles } from "lucide-react";

export function ClientRepeatBookingCard({
  eyebrow,
  title,
  subtitle,
  chips,
  primaryLabel,
  primaryHref,
  secondaryLabel,
  secondaryHref,
  state
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  chips: string[];
  primaryLabel: string;
  primaryHref: Route;
  secondaryLabel: string;
  secondaryHref: Route;
  state: "upcoming" | "rebook";
}) {
  return (
    <div className="rounded-[30px] border border-[#7CFF00]/18 bg-[linear-gradient(180deg,rgba(124,255,0,0.14),rgba(8,8,8,0.98))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="surface-label text-[#d7ffab]">{eyebrow}</p>
          <h3 className="mt-3 text-2xl font-semibold sm:text-3xl" data-display="true">{title}</h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/72">{subtitle}</p>
        </div>
        <div className="rounded-[20px] border border-white/10 bg-black/20 px-3 py-3 text-white/74">
          {state === "upcoming" ? <CalendarDays className="h-5 w-5 text-[#d7ffab]" /> : <Sparkles className="h-5 w-5 text-[#d7ffab]" />}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-white/52">
        {chips.map((chip) => (
          <span key={chip} className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-white/76">{chip}</span>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href={primaryHref} className="inline-flex h-11 items-center gap-2 rounded-full border border-[#cfff93]/40 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-black shadow-[0_14px_32px_rgba(124,255,0,0.22)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_36px_rgba(124,255,0,0.28)]">
          {primaryLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link href={secondaryHref} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
          {secondaryLabel}
          <Clock3 className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

