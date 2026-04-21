import Link from "next/link";
import { BellDot, MessageSquareText, UserRound } from "lucide-react";
import type { ClientAppMode } from "@/components/client-experience/client-app-shell";

export function ClientAppHeader({ mode = "client" }: { mode?: ClientAppMode }) {
  const isGuest = mode === "guest";
  const homeHref = isGuest ? "/discover?entry=guest" : "/dashboard/client";

  return (
    <header className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,15,15,0.96),rgba(8,8,8,0.96))] px-4 py-3.5 shadow-[0_18px_40px_rgba(0,0,0,0.18)] sm:px-5">
      <div className="flex items-center justify-between gap-4">
        <Link href={homeHref} className="flex min-w-0 items-center gap-3 text-white">
          <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-[#7CFF00]/20 bg-[linear-gradient(135deg,rgba(124,255,0,0.18),rgba(15,15,15,0.96))] text-sm font-semibold tracking-[0.22em] text-[#d7ffab] shadow-[0_16px_34px_rgba(124,255,0,0.14)]">
            BV
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.26em] text-[#cfff93]">BVRB3R</p>
            <p className="mt-1 truncate text-sm font-medium text-white/78">
              {isGuest ? "Guest marketplace" : "Search, book, and manage visits"}
            </p>
          </div>
        </Link>
        {isGuest ? (
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-full border border-white/10 bg-black/25 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7CFF00]/20 hover:text-white">
              Log in
            </Link>
            <Link href="/signup" className="hidden rounded-full bg-[#7cff00] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-black transition hover:bg-[#b7ff58] sm:inline-flex">
              Create account
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/activity" aria-label="Open activity" className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/74 transition hover:border-[#7CFF00]/20 hover:text-white">
              <BellDot className="h-5 w-5" />
            </Link>
            <Link href="/messages" aria-label="Open messages" className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/74 transition hover:border-[#7CFF00]/20 hover:text-white">
              <MessageSquareText className="h-5 w-5" />
            </Link>
            <Link href="/profile" aria-label="Open profile" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/25 text-white/74 transition hover:border-[#7CFF00]/20 hover:text-white">
              <UserRound className="h-5 w-5" />
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
