"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Clock3, Store } from "lucide-react";
import { formatPr36WaitlistPosition, type Pr36PublicPrelaunch } from "@/lib/shops/pr36-prelaunch-domain";

type JoinResult = {
  position: number;
  waitlistCount: number;
  bookingOpensAt: string;
  alreadyJoined: boolean;
};

type WithdrawResult = {
  outcome: "withdrawn";
  position: number;
  waitlistCount: number;
  alreadyWithdrawn: boolean;
  contactAnonymized: boolean;
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(value));
}

function countdown(openingAt: string, now: number) {
  const remaining = Math.max(0, new Date(openingAt).getTime() - now);
  const minutes = Math.floor(remaining / 60_000);
  return {
    days: Math.floor(minutes / (24 * 60)),
    hours: Math.floor((minutes % (24 * 60)) / 60),
    minutes: minutes % 60
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The opening waitlist could not save your place.");
  return body;
}

export function PublicComingSoonShop({
  initial,
  initialEmail = "",
  serverNow = initial.openingAt
}: {
  initial: Pr36PublicPrelaunch;
  initialEmail?: string;
  serverNow?: string;
}) {
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitlistCount, setWaitlistCount] = useState(initial.waitlistCount);
  const [joined, setJoined] = useState<JoinResult | null>(initial.viewerPosition ? {
    position: initial.viewerPosition,
    waitlistCount: initial.waitlistCount,
    bookingOpensAt: initial.bookingHeadStartAt,
    alreadyJoined: true
  } : null);
  const remaining = useMemo(() => countdown(initial.openingAt, now), [initial.openingAt, now]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function joinWaitlist() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/shops/prelaunch/${encodeURIComponent(initial.slug)}/waitlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `prelaunch:${crypto.randomUUID()}`
        },
        body: JSON.stringify({ email, phone, consent })
      });
      const result = await readJson<{ waitlist: JoinResult }>(response);
      setJoined(result.waitlist);
      setWaitlistCount(result.waitlist.waitlistCount);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "The opening waitlist could not save your place.");
    } finally {
      setBusy(false);
    }
  }

  async function withdrawWaitlist() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/shops/prelaunch/${encodeURIComponent(initial.slug)}/waitlist`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `prelaunch-withdraw:${crypto.randomUUID()}`
        },
        body: JSON.stringify({ email, phone })
      });
      const result = await readJson<{ withdrawal: WithdrawResult }>(response);
      setWaitlistCount(result.withdrawal.waitlistCount);
      setJoined(null);
      setConsent(false);
    } catch (withdrawError) {
      setError(withdrawError instanceof Error ? withdrawError.message : "The opening waitlist could not withdraw that entry.");
    } finally {
      setBusy(false);
    }
  }

  const isLive = initial.phase === "live";

  return (
    <main className="min-h-screen overflow-hidden bg-[#060708] px-5 py-6 text-[#F5F1E8] sm:px-8">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[34rem] bg-[radial-gradient(ellipse_at_top,rgba(217,180,97,0.10),transparent_66%)]" aria-hidden="true" />
      <header className="relative mx-auto flex max-w-[880px] flex-wrap items-center gap-3">
        <Link href="/" className="font-extrabold tracking-[0.28em] text-white">BVRB<span className="text-[#C4F24E]">3</span>R</Link>
        <span className="rounded-full border border-[#C9A87C]/30 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#C9A87C]">Coming soon shop</span>
        <Link href="/search" className="ml-auto text-xs font-bold text-[#C4F24E]">Explore open shops</Link>
      </header>

      <section className="relative mx-auto mt-8 max-w-[760px] overflow-hidden rounded-[28px] border border-[#D9B461]/40 bg-[#0B0C0D] shadow-[0_34px_100px_rgba(0,0,0,0.32)]">
        <div className="relative min-h-52 bg-[linear-gradient(150deg,#191509,#0B0C0D)] p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_85%_at_30%_0%,rgba(217,180,97,0.17),transparent_66%)]" aria-hidden="true" />
          <span className="relative inline-flex items-center gap-2 rounded-full border border-[#D9B461]/45 bg-[#D9B461]/10 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[#D9B461]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#D9B461]" aria-hidden="true" />
            {isLive ? "Now open" : "Opening soon"}
          </span>
          <div className="relative mt-14">
            <h1 className="font-serif text-[clamp(2.6rem,8vw,4.2rem)] leading-none">{initial.name}</h1>
            <p className="mt-3 font-mono text-[10px] leading-5 text-white/48">@{initial.slug} · {initial.addressLine}</p>
          </div>
        </div>

        <div className="space-y-6 p-6 sm:p-8">
          {isLive ? (
            <div className="rounded-[20px] border border-[#C4F24E]/30 bg-[#C4F24E]/[0.055] p-5">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C4F24E]">The doors are open</p>
              <p className="mt-3 text-sm leading-7 text-white/62">Public booking can now begin. Payment remains a real checkout action only inside the open shop experience.</p>
              <Link href={initial.publicShopHref as never} className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#C4F24E] px-6 text-sm font-extrabold text-[#060708]">See the open shop <ArrowRight className="h-4 w-4" /></Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">Doors open in</p>
              <div className="flex gap-2" aria-label={`${remaining.days} days, ${remaining.hours} hours, ${remaining.minutes} minutes until opening`}>
                {([
                  [remaining.days, "Days"],
                  [remaining.hours, "Hrs"],
                  [remaining.minutes, "Min"]
                ] as const).map(([number, label]) => (
                  <span key={label} className="min-w-16 rounded-[13px] border border-[#D9B461]/30 px-3 py-2 text-center">
                    <span className="block font-serif text-3xl text-[#EAD9B0]">{number}</span>
                    <span className="block font-mono text-[8px] uppercase tracking-[0.18em] text-white/42">{label}</span>
                  </span>
                ))}
              </div>
              <p className="font-mono text-[9px] text-white/42">{dateTime(initial.openingAt)}</p>
            </div>
          )}

          <div>
            <p className="text-sm leading-7 text-white/66">
              {initial.foundingTeam.length ? "Founding team: " : "The founding team is being assembled. "}
              {initial.foundingTeam.map((barber, index) => (
                <span key={barber.profileId}>
                  {index ? ", " : ""}<Link href={barber.href as never} className="font-bold text-[#C4F24E]">@{barber.username}</Link>
                </span>
              ))}
              {` · ${Math.max(0, initial.chairCapacity - initial.foundingChairCount)} of ${initial.chairCapacity} founding chairs remain open.`}
            </p>
            <Link href={initial.joinChairHref as never} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#D9B461]/38 bg-[#D9B461]/[0.055] px-5 text-sm font-bold text-[#EAD9B0]"><Store className="h-4 w-4" /> Barbers — claim a founding chair</Link>
          </div>

          {!isLive ? (
            joined ? (
              <div className="rounded-[22px] border border-[#C4F24E]/30 bg-[#C4F24E]/[0.055] p-5" role="status">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#C4F24E] text-black"><Check className="h-5 w-5" /></span>
                  <div>
                    <p className="font-extrabold">You’re {formatPr36WaitlistPosition(joined.position)} in line.</p>
                    <p className="mt-1 text-xs text-white/48">That position is stored and never replaced with an estimate.</p>
                  </div>
                </div>
                <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-white/62"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#C4F24E]" /> Your waitlist booking door opens {dateTime(joined.bookingOpensAt)} — exactly 24 hours before public opening.</p>
                <button type="button" disabled={busy} onClick={() => void withdrawWaitlist()} className="mt-4 min-h-11 rounded-full border border-white/12 px-5 text-xs font-bold text-white/70 hover:border-red-300/35 hover:text-red-100 disabled:opacity-40">
                  {busy ? "Withdrawing…" : "Leave waitlist and revoke consent"}
                </button>
                {error ? <p className="mt-3 rounded-[14px] border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
              </div>
            ) : (
              <div className="rounded-[22px] border border-white/10 bg-white/[0.025] p-5">
                <h2 className="font-serif text-3xl">Join the opening waitlist</h2>
                <p className="mt-2 text-sm leading-6 text-white/54">Join order controls the position shown after submission. No card, deposit, or payment is requested before opening.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-white/62">Email
                    <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 min-h-12 w-full rounded-[14px] border border-white/12 bg-black/30 px-4 text-sm text-white outline-none focus:border-[#C4F24E]/55" placeholder="you@example.com" />
                  </label>
                  <label className="text-xs font-bold text-white/62">Phone (optional)
                    <input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 min-h-12 w-full rounded-[14px] border border-white/12 bg-black/30 px-4 text-sm text-white outline-none focus:border-[#C4F24E]/55" placeholder="(813) 555-0100" />
                  </label>
                </div>
                <label className="mt-4 flex cursor-pointer items-start gap-3 text-xs leading-5 text-white/52">
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-[#C4F24E]" />
                  Use this email for my opening alert and 24-hour waitlist booking access. I can sign in with the same email when the window opens.
                </label>
                <button type="button" disabled={busy || !consent || !email.trim()} onClick={() => void joinWaitlist()} className="mt-5 min-h-13 w-full rounded-full bg-[#C4F24E] px-6 text-sm font-extrabold text-[#060708] disabled:cursor-not-allowed disabled:opacity-35">
                  {busy ? "Saving your real position…" : "Join the opening waitlist"}
                </button>
                {error ? <p className="mt-3 rounded-[14px] border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100" role="alert">{error}</p> : null}
              </div>
            )
          ) : null}

          <p className="border-t border-white/8 pt-4 font-mono text-[9px] leading-5 text-white/36">
            {waitlistCount} {waitlistCount === 1 ? "person" : "people"} on the opening waitlist · positions follow stored join order · waitlisted clients get the first 24 hours · no payment before opening day, ever.
          </p>
        </div>
      </section>
    </main>
  );
}
