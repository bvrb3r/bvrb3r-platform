"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Crown, LockKeyhole, Medal, X } from "lucide-react";
import type { RoadSetSnapshot } from "@/lib/road/domain";
import { cn } from "@/lib/utils";

type BadgePresentation = Pick<
  RoadSetSnapshot,
  "index" | "code" | "badgeName" | "badgeReward" | "complete" | "badge"
>;

const CONFETTI = [
  { left: "8%", top: "16%", color: "#C4F24E", rotate: "12deg" },
  { left: "18%", top: "44%", color: "#D9B461", rotate: "42deg" },
  { left: "30%", top: "10%", color: "#F5F1E8", rotate: "72deg" },
  { left: "72%", top: "14%", color: "#9BE15D", rotate: "22deg" },
  { left: "86%", top: "38%", color: "#D9B461", rotate: "60deg" },
  { left: "76%", top: "72%", color: "#C4F24E", rotate: "100deg" },
  { left: "12%", top: "76%", color: "#F5F1E8", rotate: "122deg" }
] as const;

export function RoadBadgeCase({ badges }: { badges: BadgePresentation[] }) {
  const [selected, setSelected] = useState<BadgePresentation | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!selected) {
      return;
    }
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [selected]);

  function continueRoad() {
    const nextSetIndex = Math.min((selected?.index ?? 0) + 1, badges.length - 1);
    setSelected(null);
    window.requestAnimationFrame(() => {
      document.getElementById(`road-set-${nextSetIndex}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="road-badge-case">
        {badges.map((badge) => {
          const legendary = badge.index === 4;
          const earned = badge.complete && Boolean(badge.badge);
          return (
            <button
              key={badge.code}
              type="button"
              disabled={!earned}
              onClick={() => earned && setSelected(badge)}
              className={cn(
                "group relative min-h-52 overflow-hidden rounded-[22px] border p-4 text-center",
                earned
                  ? legendary
                    ? "border-[#D9B461]/45 bg-[#D9B461]/[0.06] hover:border-[#D9B461]/75"
                    : "border-[#C4F24E]/30 bg-[#C4F24E]/[0.045] hover:border-[#C4F24E]/60"
                  : "cursor-not-allowed border-white/10 bg-white/[0.02] text-white/40"
              )}
              aria-label={earned ? `Celebrate ${badge.badgeName}` : `${badge.badgeName}: earn by completing ${badge.code}`}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mx-auto grid h-16 w-16 place-items-center rounded-full border-2",
                  earned
                    ? legendary
                      ? "border-[#D9B461] bg-[#D9B461]/12 text-[#D9B461] shadow-[0_0_30px_rgba(217,180,97,0.28)]"
                      : "border-[#C4F24E] bg-[#C4F24E]/10 text-[#C4F24E] shadow-[0_0_28px_rgba(196,242,78,0.24)]"
                    : "border-dashed border-white/20 bg-white/[0.025] text-white/25"
                )}
              >
                {earned ? (legendary ? <Crown className="h-7 w-7" /> : <Medal className="h-7 w-7" />) : <LockKeyhole className="h-6 w-6" />}
              </span>
              <span className="mt-4 block text-base font-bold text-white/92">{badge.badgeName}</span>
              <span className="mt-2 block min-h-10 text-xs leading-5 text-white/50">{badge.badgeReward}</span>
              <span className={cn(
                "mt-3 inline-flex min-h-7 items-center gap-1.5 rounded-full border px-3 font-mono text-[9px] uppercase tracking-[0.14em]",
                earned
                  ? legendary
                    ? "border-[#D9B461]/45 bg-[#D9B461]/10 text-[#D9B461]"
                    : "border-[#C4F24E]/35 bg-[#C4F24E]/10 text-[#C4F24E]"
                  : "border-white/10 bg-white/[0.025] text-white/35"
              )}>
                {earned ? <><Check className="h-3 w-3" /> Earned</> : `Earn — complete ${badge.code.toLowerCase()}`}
              </span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="road-celebration-title"
          className="fixed inset-0 z-[120] grid place-items-center overflow-hidden bg-[#060708]/95 px-5 py-10 backdrop-blur-xl"
        >
          <div aria-hidden="true" className="absolute h-[42rem] w-[42rem] rounded-full bg-[conic-gradient(from_0deg,rgba(196,242,78,0.12),transparent_24%,rgba(217,180,97,0.1)_42%,transparent_65%,rgba(196,242,78,0.1)_84%,transparent)] blur-sm" />
          {CONFETTI.map((piece) => (
            <span
              key={`${piece.left}-${piece.top}`}
              aria-hidden="true"
              className="absolute h-4 w-2 rounded-sm"
              style={{ ...piece, backgroundColor: piece.color, transform: `rotate(${piece.rotate})` }}
            />
          ))}
          <div className="relative max-w-lg text-center">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setSelected(null)}
              className="absolute -right-1 -top-12 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/[0.04] text-white/70 hover:text-white"
              aria-label="Close badge celebration"
            >
              <X className="h-5 w-5" />
            </button>
            <p className={cn(
              "font-mono text-xs font-bold uppercase tracking-[0.32em]",
              selected.index === 4 ? "text-[#D9B461]" : "text-[#C4F24E]"
            )}>
              {selected.code} complete
            </p>
            <span className={cn(
              "mx-auto mt-6 grid h-32 w-32 place-items-center rounded-full border-2",
              selected.index === 4
                ? "border-[#D9B461] bg-[#D9B461]/12 text-[#D9B461] shadow-[0_0_64px_rgba(217,180,97,0.4)]"
                : "border-[#C4F24E] bg-[#C4F24E]/10 text-[#C4F24E] shadow-[0_0_64px_rgba(196,242,78,0.35)]"
            )}>
              {selected.index === 4 ? <Crown className="h-14 w-14" /> : <Medal className="h-14 w-14" />}
            </span>
            <h2 id="road-celebration-title" className="mt-6 font-serif text-5xl text-white">{selected.badgeName}</h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-white/64">Badge earned. {selected.badgeReward}.</p>
            <div className="mt-5 inline-flex rounded-full border border-[#C4F24E]/30 bg-[#C4F24E]/[0.06] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[#C4F24E]">
              {selected.index >= badges.length - 1 ? "The summit — every door is open" : `SET ${selected.index + 1} opens now`}
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={continueRoad} className="min-h-12 rounded-full bg-[#C4F24E] px-7 text-sm font-bold text-[#0A0A0C] hover:bg-[#E4F9B8]">
                Continue the road
              </button>
              <button type="button" onClick={() => setSelected(null)} className="min-h-12 rounded-full border border-white/20 px-6 text-sm font-semibold text-white/75 hover:text-white">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
