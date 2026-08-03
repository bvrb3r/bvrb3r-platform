"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function RoadError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="bvr-screen grid min-h-screen place-items-center px-5 py-12">
      <section className="bvr-glass-card w-full max-w-lg p-7 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#D9B461]/40 bg-[#D9B461]/10 text-[#D9B461]"><AlertTriangle className="h-6 w-6" /></span>
        <p className="bvr-section-label mt-5">Road truth unavailable</p>
        <h1 className="mt-3 font-serif text-4xl">Your progress was not guessed.</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">The server-owned Road ledger could not be read. Nothing was marked complete, no badge was minted, and no referral was counted.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="bvr-primary-action inline-flex min-h-12 items-center gap-2 px-6 text-sm"><RotateCcw className="h-4 w-4" /> Try again</button>
          <Link href="/post-auth" className="bvr-secondary-action inline-flex min-h-12 items-center px-6 text-sm font-semibold">Return to my app</Link>
        </div>
      </section>
    </main>
  );
}
