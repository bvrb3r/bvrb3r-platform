"use client";

import type { Route } from "next";
import Link from "next/link";

/**
 * Compact favorite card used by the Home "Favorite Barbers" and "Favorite Shops"
 * rails. Hairline border, cover image, a small green "● Available now" pill, name +
 * subtitle (shop · distance), and a neutral action button ("Rebook · $NN"). Same
 * pattern is reused for shops with shop data — no separate card style.
 */
export function FavoriteRailCard({
  coverUrl,
  name,
  subtitle,
  availabilityLabel,
  actionLabel,
  actionHref,
  nameHref
}: {
  coverUrl?: string | null;
  name: string;
  subtitle?: string | null;
  availabilityLabel?: string | null;
  actionLabel: string;
  actionHref: Route;
  nameHref?: Route;
}) {
  return (
    <article className="overflow-hidden rounded-[var(--radius-lg,18px)] border border-[var(--border-soft,rgba(255,255,255,0.06))] bg-white/[0.02]">
      <div className="relative aspect-[4/3] overflow-hidden">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={`${name} preview`} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(145deg,#1c1c1c,#0a0a0a)]" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.55))]" />
        {availabilityLabel ? (
          <span className="absolute left-2.5 top-2.5 inline-flex max-w-[80%] items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white/90">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#c4f24e]" aria-hidden="true" />
            <span className="truncate">{availabilityLabel}</span>
          </span>
        ) : null}
      </div>

      <div className="p-3">
        {nameHref ? (
          <Link href={nameHref} className="line-clamp-1 text-sm font-semibold text-white transition hover:text-[#e4f9b8]">
            {name}
          </Link>
        ) : (
          <p className="line-clamp-1 text-sm font-semibold text-white">{name}</p>
        )}
        {subtitle ? <p className="mt-0.5 line-clamp-1 text-xs text-white/52">{subtitle}</p> : null}
        <Link
          href={actionHref}
          className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white transition hover:border-white/24 hover:bg-white/[0.09]"
        >
          {actionLabel}
        </Link>
      </div>
    </article>
  );
}
