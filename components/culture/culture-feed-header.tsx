"use client";

import { useMemo, useState } from "react";
import { Bell, UserRound } from "lucide-react";

type CultureSurface = "client" | "barber" | "shop";

type CultureFeedHeaderProps = {
  surface: CultureSurface;
  subtitle: string;
  roleContext: string;
};

const filterSets: Record<CultureSurface, string[]> = {
  client: ["For You", "Near You", "Available Today", "Fades", "Beards", "Shops"],
  barber: ["For You", "Inspiration", "Tutorials", "Shops", "Available Today", "My Posts"],
  shop: ["For You", "Team", "Shops", "Open Chairs", "Events", "My Posts"]
};

function avatarLabel(surface: CultureSurface) {
  if (surface === "barber") {
    return "Barber Culture";
  }

  if (surface === "shop") {
    return "Shop Owner Culture";
  }

  return "Client Culture";
}

export function CultureFeedHeader({ surface, subtitle, roleContext }: CultureFeedHeaderProps) {
  const filters = useMemo(() => filterSets[surface], [surface]);
  const [activeFilter, setActiveFilter] = useState(filters[0] ?? "For You");

  return (
    <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(5,5,5,0.98))] shadow-[0_26px_60px_rgba(0,0,0,0.28)]">
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-3 px-4 py-4 sm:px-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#d7ffab]/18 bg-[#d7ffab]/10 text-[#d7ffab]" aria-label={avatarLabel(surface)}>
          <UserRound className="h-5 w-5" />
        </div>
        <div className="min-w-0 text-center">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[#d7ffab]">BVRB3R</p>
          <h1 className="mt-1 text-2xl font-extrabold text-white">Culture</h1>
          <p className="mt-1 truncate text-xs font-semibold uppercase tracking-[0.16em] text-white/44">{roleContext}</p>
        </div>
        <button
          type="button"
          disabled
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/44"
          aria-label="Culture alerts are not active yet"
          title="Culture alerts will activate when notification routing is ready."
        >
          <Bell className="h-5 w-5" />
        </button>
      </div>

      <div className="border-t border-white/10 px-4 pb-4 sm:px-5">
        <p className="pt-3 text-sm leading-6 text-white/58">{subtitle}</p>
        <div
          className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5"
          aria-label={`${roleContext} filters`}
        >
          {filters.map((filter) => {
            const active = activeFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setActiveFilter(filter)}
                aria-pressed={active}
                className={[
                  "shrink-0 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.13em] transition",
                  active
                    ? "border-[#d7ffab]/36 bg-[#d7ffab] text-[#050505]"
                    : "border-white/10 bg-white/[0.04] text-white/58 hover:border-white/20 hover:text-white/78"
                ].join(" ")}
              >
                {filter}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
