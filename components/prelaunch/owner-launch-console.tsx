"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, ExternalLink, ShieldAlert } from "lucide-react";
import type { Pr36OwnerLaunchConsole } from "@/lib/shops/pr36-prelaunch-domain";

function localInputValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function dateTime(value: string | null) {
  if (!value) return "Not set";
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

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Launch control could not complete that request.");
  return body;
}

export function OwnerLaunchConsole({ initial }: { initial: Pr36OwnerLaunchConsole }) {
  const router = useRouter();
  const [openingAt, setOpeningAt] = useState(localInputValue(initial.openingAt));
  const [chairCapacity, setChairCapacity] = useState(String(initial.chairCapacity));
  const [busy, setBusy] = useState<"configure" | "go_live" | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const remainingChecks = useMemo(() => initial.checks.filter((check) => !check.green).length, [initial.checks]);

  async function configure() {
    setBusy("configure");
    setNotice(null);
    try {
      const parsed = new Date(openingAt);
      if (!openingAt || !Number.isFinite(parsed.getTime())) throw new Error("Choose a valid opening date and time.");
      const response = await fetch("/api/shop/launch/configure", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `launch-config:${crypto.randomUUID()}`
        },
        body: JSON.stringify({
          openingAt: parsed.toISOString(),
          chairCapacity: Number(chairCapacity),
          expectedVersion: initial.version
        })
      });
      await readJson(response);
      setNotice({ tone: "success", text: "Coming-soon schedule saved from server truth." });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Coming-soon schedule could not be saved." });
    } finally {
      setBusy(null);
    }
  }

  async function goLive() {
    setBusy("go_live");
    setNotice(null);
    try {
      const response = await fetch("/api/shop/launch/go-live", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `launch-live:${crypto.randomUUID()}`
        },
        body: JSON.stringify({ expectedVersion: initial.version })
      });
      await readJson(response);
      setNotice({ tone: "success", text: "Launch scheduled. Waitlisted clients receive exactly 24 hours before public booking." });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Launch could not be scheduled." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#060708] px-5 py-7 text-[#F5F1E8] sm:px-8 sm:py-9">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[32rem] bg-[radial-gradient(ellipse_at_top,rgba(217,180,97,0.09),transparent_66%)]" aria-hidden="true" />
      <div className="relative mx-auto max-w-[920px]">
        <header className="flex flex-wrap items-center gap-3">
          <Link href="/shop/home" className="font-extrabold tracking-[0.28em] text-white">BVRB<span className="text-[#C4F24E]">3</span>R</Link>
          <span className="rounded-full border border-[#C9A87C]/30 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#C9A87C]">Owner launch console</span>
          {initial.configured ? <Link href={initial.publicPageHref as never} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-[#C4F24E]">View public page <ExternalLink className="h-3.5 w-3.5" /></Link> : null}
        </header>

        <div className="mt-9 flex flex-wrap items-baseline gap-3">
          <h1 className="font-serif text-[clamp(2.6rem,7vw,4.4rem)] leading-none">Launch console</h1>
          <p className="font-mono text-[10px] text-white/42">{initial.name} · {initial.openingAt ? `opens ${dateTime(initial.openingAt)}` : "opening not set"}</p>
        </div>

        {notice ? <p className={`mt-6 rounded-[16px] border p-4 text-sm ${notice.tone === "success" ? "border-[#C4F24E]/30 bg-[#C4F24E]/10 text-[#E4F9B8]" : "border-red-400/30 bg-red-500/10 text-red-100"}`} role="status">{notice.text}</p> : null}

        <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Stored launch metrics">
          {[
            ["Client waitlist", initial.waitlistCount.toLocaleString(), "Stored active positions"],
            ["Founding chairs", `${initial.foundingChairCount} / ${initial.chairCapacity}`, "Active public team relationships"],
            ["Page visits", initial.pageVisits.toLocaleString(), "Recorded coming-soon page loads"]
          ].map(([label, value, detail], index) => (
            <article key={label} className={`rounded-[20px] border p-5 ${index === 0 ? "border-[#C4F24E]/28 bg-[#C4F24E]/[0.04]" : index === 1 ? "border-[#D9B461]/28 bg-[#D9B461]/[0.04]" : "border-white/10 bg-white/[0.025]"}`}>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">{label}</p>
              <p className={`mt-2 font-serif text-4xl ${index === 0 ? "text-[#C4F24E]" : index === 1 ? "text-[#EAD9B0]" : "text-white"}`}>{value}</p>
              <p className="mt-2 font-mono text-[9px] leading-5 text-white/38">{detail}</p>
            </article>
          ))}
        </section>

        <section className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.025] p-5 sm:p-6" aria-labelledby="opening-settings-heading">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">Stored campaign settings</p>
              <h2 id="opening-settings-heading" className="mt-2 font-serif text-3xl">Opening schedule</h2>
            </div>
            <span className="ml-auto rounded-full border border-white/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/42">Version {initial.version}</span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_0.45fr_auto] sm:items-end">
            <label className="text-xs font-bold text-white/62">Opening date and time
              <input type="datetime-local" value={openingAt} onChange={(event) => setOpeningAt(event.target.value)} disabled={initial.status === "launch_scheduled"} className="mt-2 min-h-12 w-full rounded-[14px] border border-white/12 bg-black/30 px-4 text-sm text-white outline-none focus:border-[#C4F24E]/55 disabled:opacity-45" />
            </label>
            <label className="text-xs font-bold text-white/62">Founding chairs
              <input type="number" min={1} max={24} value={chairCapacity} onChange={(event) => setChairCapacity(event.target.value)} disabled={initial.status === "launch_scheduled"} className="mt-2 min-h-12 w-full rounded-[14px] border border-white/12 bg-black/30 px-4 text-sm text-white outline-none focus:border-[#C4F24E]/55 disabled:opacity-45" />
            </label>
            <button type="button" onClick={() => void configure()} disabled={busy !== null || initial.status === "launch_scheduled" || !openingAt} className="min-h-12 rounded-full border border-[#C4F24E]/35 px-6 text-sm font-extrabold text-[#C4F24E] disabled:cursor-not-allowed disabled:opacity-35">{busy === "configure" ? "Saving…" : initial.configured ? "Save schedule" : "Publish coming soon"}</button>
          </div>
          <p className="mt-4 font-mono text-[9px] leading-5 text-white/36">The stored head-start boundary is always exactly 24 hours before opening. Saving this form never creates a booking, card request, deposit, or payment.</p>
        </section>

        <section className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.025] p-5 sm:p-6" aria-labelledby="launch-checklist-heading">
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">Server launch checks</p>
          <h2 id="launch-checklist-heading" className="mt-2 font-serif text-3xl">Every line must be green</h2>
          <div className="mt-4 divide-y divide-white/7">
            {initial.checks.map((check) => (
              <div key={check.key} className="flex items-start gap-3 py-4">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${check.green ? "border-[#C4F24E] bg-[#C4F24E] text-black" : "border-white/22 text-white/36"}`}>
                  {check.green ? <Check className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold ${check.green ? "text-white" : "text-white/68"}`}>{check.label}</p>
                  <p className="mt-1 text-xs leading-5 text-white/38">{check.detail}</p>
                </div>
                <Link href={check.href as never} className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-[#C4F24E]">{check.action}</Link>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-white/8 pt-5">
            <button type="button" onClick={() => void goLive()} disabled={!initial.canGoLive || busy !== null} className="min-h-13 rounded-full bg-[#C4F24E] px-7 text-sm font-extrabold text-[#060708] disabled:cursor-not-allowed disabled:bg-[#C4F24E]/25 disabled:text-black/70">
              {busy === "go_live"
                ? "Rechecking server truth…"
                : initial.status === "launch_scheduled"
                  ? "Launch scheduled ✓"
                  : initial.canGoLive
                    ? "Go live — schedule head start"
                    : !initial.configured
                      ? "Go live — save schedule first"
                      : `Go live — ${remainingChecks} item${remainingChecks === 1 ? "" : "s"} left`}
            </button>
            <p className="max-w-xl font-mono text-[9px] leading-5 text-white/42">{initial.goLiveReason ?? `Waitlisted clients start booking ${dateTime(initial.bookingHeadStartAt)}. Everyone else starts ${dateTime(initial.openingAt)}.`}</p>
          </div>
          <p className="mt-4 rounded-[14px] border border-[#D9B461]/22 bg-[#D9B461]/[0.045] p-3 text-xs leading-5 text-[#EAD9B0]/75">Payment authorization stays server-blocked until the stored opening time, including during the 24-hour waitlist booking window.</p>
        </section>
      </div>
    </main>
  );
}
