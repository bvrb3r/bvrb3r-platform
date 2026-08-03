"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clipboard,
  CloudOff,
  Link2Off,
  LoaderCircle,
  RefreshCw,
  Smartphone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CalendarConnectionState } from "@/lib/calendar-sync/service";
import type { CalendarProvider } from "@/lib/calendar-sync/domain";
import { cn } from "@/lib/utils";

const PROVIDER_COPY = {
  square: {
    title: "Square Calendar Connect",
    eyebrow: "Calendar only · money never moves",
    promise: "Keep booking on Square. See everything here.",
    detail: "BVRB3R reads Square Appointments into your calendar. Square clients keep paying on Square; nothing is written back.",
    icon: "▢"
  },
  apple: {
    title: "Apple Calendar Sync",
    eyebrow: "Two directions · zero money",
    promise: "Reads and writes — every calendar matched.",
    detail: "A private subscription writes BVRB3R appointments out. Your device sends back busy windows only, so titles never leave it.",
    icon: "A"
  },
  google: {
    title: "Google Calendar Sync",
    eyebrow: "Two directions · zero money",
    promise: "Dedicated BVRB3R calendar out. Primary free/busy in.",
    detail: "BVRB3R writes only to its dedicated Google calendar and reads the primary calendar through free/busy only.",
    icon: "G"
  }
} satisfies Record<CalendarProvider, {
  title: string;
  eyebrow: string;
  promise: string;
  detail: string;
  icon: string;
}>;

const CARD_CLASS = "rounded-[20px] border border-white/10 bg-white/[0.038] p-[17px] shadow-[0_18px_60px_rgba(0,0,0,0.18)]";
const KICKER_CLASS = "font-[family-name:var(--font-kicker)] text-[10px] font-bold uppercase tracking-[0.16em] text-white/45";

function formatSyncTime(value: string | null) {
  if (!value) return "Not synced yet";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Sync time unavailable" : parsed.toLocaleString();
}

function ConnectionBadge({ state }: { state: CalendarConnectionState | null }) {
  const status = state?.status ?? "not_connected";
  const label = state?.setupRequired
    ? "Needs setup"
    : status === "active"
    ? state?.provider === "square" ? "Synced" : "Synced both ways"
    : status === "degraded"
      ? "Last-known calendar"
      : status === "disconnected"
        ? "Disconnected"
        : "Not connected";
  return (
    <span className={cn(
      "ml-auto inline-flex min-h-8 items-center gap-2 rounded-full border px-3 font-[family-name:var(--font-kicker)] text-[9px] font-bold uppercase tracking-[0.12em]",
      state?.setupRequired ? "border-[#D9B461]/35 bg-[#D9B461]/8 text-[#D9B461]" :
        status === "active" ? "border-[#C4F24E]/30 bg-[#C4F24E]/8 text-[#C4F24E]" :
        status === "degraded" ? "border-[#D9B461]/35 bg-[#D9B461]/8 text-[#D9B461]" :
          "border-white/15 bg-white/[0.04] text-white/50"
    )}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

function Rule({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-[12.5px] leading-6 text-white/65">
      <span className={cn("mt-0.5 font-[family-name:var(--font-kicker)] text-[10px]", allowed ? "text-[#C4F24E]" : "text-[#FF9B9B]")}>{allowed ? "✓" : "✕"}</span>
      <span>{children}</span>
    </div>
  );
}

function DirectionCard({
  title,
  live,
  children,
  action
}: {
  title: string;
  live: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn(CARD_CLASS, live ? "border-[#C4F24E]/30" : "border-[#C9A87C]/30")}>
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className={KICKER_CLASS}>{title}</h2>
        <span className="flex-1" />
        <span className={cn(
          "inline-flex h-[22px] items-center rounded-full border px-2.5 font-[family-name:var(--font-kicker)] text-[8.5px] font-bold uppercase tracking-[0.12em]",
          live ? "border-[#C4F24E]/30 bg-[#C4F24E]/10 text-[#C4F24E]" : "border-white/15 bg-white/[0.04] text-white/45"
        )}>{live ? "Live" : "Off"}</span>
      </div>
      <div className="mt-2.5 text-[12.5px] leading-6 text-white/60">{children}</div>
      {action ? <div className="mt-3">{action}</div> : null}
    </section>
  );
}

export function CalendarSyncWorkspace({ provider }: { provider: CalendarProvider }) {
  const copy = PROVIDER_COPY[provider];
  const [state, setState] = useState<CalendarConnectionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [squareMappingOptions, setSquareMappingOptions] = useState<{
    locations: Array<{ id: string; label: string }>;
    teamMembers: Array<{ id: string; label: string; appointmentCount: number }>;
  } | null>(null);
  const [selectedSquareLocation, setSelectedSquareLocation] = useState("");
  const [selectedSquareTeamMember, setSelectedSquareTeamMember] = useState("");

  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/calendar-sync/${provider}`, { cache: "no-store" });
      const payload = await response.json() as CalendarConnectionState & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Calendar status is unavailable.");
      setState(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Calendar status is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const mutate = useCallback(async (body: Record<string, unknown>, actionName: string) => {
    setPendingAction(actionName);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/calendar-sync/${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json() as { error?: string; feedUrl?: string };
      if (!response.ok) throw new Error(payload.error || "Calendar action failed.");
      if (body.action === "regenerate_feed") {
        setMessage("Private feed regenerated. The old link no longer works.");
      } else if (body.action === "sync_now") {
        setMessage(provider === "google"
          ? "Google export queued and current free/busy availability refreshed."
          : "Calendar sync completed.");
      } else if (body.action === "disconnect") {
        setMessage("Calendar disconnected.");
      } else if (body.action === "square_mapping_save") {
        setMessage("Square calendar mapping saved. Run the first sync to verify it.");
      } else {
        setMessage("Calendar preference saved.");
      }
      await loadState();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Calendar action failed.");
    } finally {
      setPendingAction(null);
    }
  }, [loadState, provider]);

  const loadSquareMappingOptions = useCallback(async () => {
    setPendingAction("mapping-options");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/calendar-sync/square", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "square_mapping_options" })
      });
      const payload = await response.json() as {
        locations?: Array<{ id: string; label: string }>;
        teamMembers?: Array<{ id: string; label: string; appointmentCount: number }>;
        error?: string;
      };
      if (!response.ok || !payload.locations || !payload.teamMembers) {
        throw new Error(payload.error || "Square mapping choices are unavailable.");
      }
      const options = { locations: payload.locations, teamMembers: payload.teamMembers };
      setSquareMappingOptions(options);
      setSelectedSquareLocation((current) => current || state?.squareMapping?.locationId || options.locations[0]?.id || "");
      setSelectedSquareTeamMember((current) => current || state?.squareMapping?.teamMemberId || options.teamMembers[0]?.id || "");
      if (!options.teamMembers.length) {
        setMessage("Square did not return a staff candidate from appointment-read data yet. Keep at least one appointment for the correct staff member, then retry.");
      }
    } catch (mappingError) {
      setError(mappingError instanceof Error ? mappingError.message : "Square mapping choices are unavailable.");
    } finally {
      setPendingAction(null);
    }
  }, [state?.squareMapping?.locationId, state?.squareMapping?.teamMemberId]);

  const startOAuth = useCallback(async () => {
    setPendingAction("connect");
    setError(null);
    try {
      const response = await fetch(`/api/calendar-sync/${provider}/oauth/start`, { method: "POST" });
      const payload = await response.json() as { authorizationUrl?: string; error?: string };
      if (!response.ok || !payload.authorizationUrl) throw new Error(payload.error || "Calendar authorization is unavailable.");
      window.location.assign(payload.authorizationUrl);
    } catch (oauthError) {
      setError(oauthError instanceof Error ? oauthError.message : "Calendar authorization is unavailable.");
      setPendingAction(null);
    }
  }, [provider]);

  const copyFeed = useCallback(async () => {
    if (!state?.feedUrl) return;
    try {
      await navigator.clipboard.writeText(state.feedUrl);
      setMessage("Private feed link copied.");
    } catch {
      setError("Copy failed. Select and copy the private link manually.");
    }
  }, [state?.feedUrl]);

  const connected = state?.status === "active" || state?.status === "degraded";
  const squareReady = provider !== "square" || !state?.setupRequired;
  const busyCalendars = useMemo(() => state?.calendars ?? [], [state?.calendars]);

  return (
    <div className="mx-auto w-full max-w-[680px] pb-14 text-[#F5F1E8]" data-testid={`calendar-sync-${provider}`}>
      <div className="sticky top-0 z-20 -mx-3 mb-4 flex items-center gap-3 border-b border-white/8 bg-[#0A0A0C]/85 px-3 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5">
        <Link
          href="/dashboard/barber/more"
          aria-label="Back to Barber More"
          className="grid size-10 flex-none place-items-center rounded-full border border-white/12 bg-white/[0.05] text-white transition hover:border-[#C4F24E]/30 hover:text-[#C4F24E]"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-[family-name:var(--font-serif)] text-xl leading-tight">{copy.title}</h1>
          <p className="truncate font-[family-name:var(--font-kicker)] text-[9px] uppercase tracking-[0.18em] text-[#C9A87C]">{copy.eyebrow}</p>
        </div>
        <ConnectionBadge state={state} />
      </div>

      <div className="space-y-3.5">
        <section className={CARD_CLASS}>
          <div className="flex items-start gap-3">
            <span className="grid size-9 flex-none place-items-center rounded-[11px] bg-white text-sm font-black text-black">{copy.icon}</span>
            <div>
              <h2 className="text-[14.5px] font-bold">{copy.promise}</h2>
              <p className="mt-1 text-[12.5px] leading-6 text-white/60">{copy.detail}</p>
            </div>
          </div>
        </section>

        {loading ? (
          <section className={cn(CARD_CLASS, "flex min-h-36 items-center justify-center text-white/55")}>
            <LoaderCircle className="mr-2 size-5 animate-spin" aria-hidden="true" /> Loading live calendar status…
          </section>
        ) : null}

        {error ? (
          <div role="alert" className="rounded-2xl border border-[#FF9B9B]/30 bg-[#FF9B9B]/8 px-4 py-3 text-sm text-[#FFD0D0]">{error}</div>
        ) : null}
        {message ? (
          <div role="status" className="rounded-2xl border border-[#C4F24E]/30 bg-[#C4F24E]/8 px-4 py-3 text-sm text-[#E4F9B8]">{message}</div>
        ) : null}

        {!loading && provider === "square" ? (
          <>
            <section className={cn(CARD_CLASS, connected && squareReady ? "border-[#C4F24E]/30 bg-[#C4F24E]/[0.05]" : "border-[#C9A87C]/30")}>
              {connected && squareReady ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-full border border-[#C4F24E]/35 bg-[#C4F24E]/10 text-[#C4F24E]"><Check className="size-5" /></span>
                    <div className="min-w-[190px] flex-1">
                      <h2 className="font-extrabold">{state?.lastSuccessAt ? "Square calendar is synced." : "Square mapping is ready."}</h2>
                      <p className="mt-1 text-xs text-white/55">{state?.accountLabel} · last sync {formatSyncTime(state?.lastSyncAt ?? null)}</p>
                    </div>
                    <Button className="min-h-10" disabled={Boolean(pendingAction)} onClick={() => void mutate({ action: "sync_now" }, "sync")}>{pendingAction === "sync" ? "Syncing…" : "Sync now"}</Button>
                  </div>
                  <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {[
                      [String(state?.stats.syncedThisWeek ?? 0), "Synced this week"],
                      [String(state?.stats.conflicts ?? 0), "Conflicts"],
                      ["$0", "Money moved — always"]
                    ].map(([value, label]) => (
                      <div key={label} className="rounded-[13px] border border-white/10 bg-black/35 px-3 py-2.5">
                        <div className={cn("font-[family-name:var(--font-serif)] text-[22px]", value === "$0" && "text-[#C4F24E]")}>{value}</div>
                        <div className="mt-0.5 font-[family-name:var(--font-kicker)] text-[8px] uppercase tracking-[0.1em] text-white/40">{label}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : connected ? (
                <div className="space-y-3">
                  <div>
                    <h2 className={KICKER_CLASS}>Finish the calendar mapping</h2>
                    <p className="mt-2.5 text-[12.5px] leading-6 text-white/60">
                      Choose exactly one BVRB3R location and one Square staff calendar. Import stays off until both server-validated choices are saved.
                    </p>
                  </div>
                  {!squareMappingOptions ? (
                    <Button
                      className="w-full rounded-[14px]"
                      disabled={Boolean(pendingAction)}
                      onClick={() => void loadSquareMappingOptions()}
                    >
                      {pendingAction === "mapping-options" ? "Reading appointment calendars…" : "Find mapping choices"}
                    </Button>
                  ) : (
                    <div className="space-y-3 rounded-[14px] border border-white/10 bg-black/30 p-3.5">
                      <label className="block text-xs font-semibold text-white/75">
                        BVRB3R location
                        <select
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-white/15 bg-[#121215] px-3 text-sm text-white"
                          value={selectedSquareLocation}
                          onChange={(event) => setSelectedSquareLocation(event.target.value)}
                        >
                          <option value="">Choose a location</option>
                          {squareMappingOptions.locations.map((location) => (
                            <option key={location.id} value={location.id}>{location.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs font-semibold text-white/75">
                        Square staff calendar
                        <select
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-white/15 bg-[#121215] px-3 text-sm text-white"
                          value={selectedSquareTeamMember}
                          onChange={(event) => setSelectedSquareTeamMember(event.target.value)}
                        >
                          <option value="">Choose Square staff</option>
                          {squareMappingOptions.teamMembers.map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.label} · {candidate.appointmentCount} appointment{candidate.appointmentCount === 1 ? "" : "s"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="text-[11px] leading-5 text-white/45">
                        The read-only Square scope does not reveal the staff directory. Candidates come only from this account&apos;s appointments; BVRB3R validates both choices again when saved.
                      </p>
                      <Button
                        className="w-full rounded-[14px]"
                        disabled={Boolean(pendingAction) || !selectedSquareLocation || !selectedSquareTeamMember}
                        onClick={() => void mutate({
                          action: "square_mapping_save",
                          locationId: selectedSquareLocation,
                          teamMemberId: selectedSquareTeamMember
                        }, "square-mapping")}
                      >
                        {pendingAction === "square-mapping" ? "Validating mapping…" : "Save mapping"}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <h2 className={KICKER_CLASS}>Connect your Square account</h2>
                  <p className="mt-2.5 text-[12.5px] leading-6 text-white/60">Sign in on Square. BVRB3R requests <strong className="text-white">Appointments read access only</strong> — no payments, payouts, card data, or write access.</p>
                  <Button className="mt-3 w-full rounded-[14px]" disabled={Boolean(pendingAction)} onClick={() => void startOAuth()}>{pendingAction === "connect" ? "Opening Square…" : "Connect Square Appointments"}</Button>
                  <p className="mt-2 text-center font-[family-name:var(--font-kicker)] text-[8px] uppercase tracking-[0.08em] text-white/30">Disconnect any time · imported appointments stay honored</p>
                </>
              )}
            </section>

            <section className={CARD_CLASS}>
              <h2 className={KICKER_CLASS}>Sync health</h2>
              <div className="mt-3 space-y-2.5">
                <Rule allowed>Polls every 5 minutes with signed Square webhook updates.</Rule>
                <Rule allowed={squareReady}>
                  {squareReady
                    ? "Square slots block BVRB3R booking availability."
                    : "Square imports remain paused until one location and staff calendar are mapped."}
                </Rule>
                <Rule allowed={false}>No Square amount enters BVRB3R; checkout and settlement stay unreachable.</Rule>
                {state?.servingLastKnown ? (
                  <div className="flex gap-2 rounded-xl border border-[#D9B461]/25 bg-[#D9B461]/8 p-3 text-xs leading-5 text-[#EBD28F]"><CloudOff className="mt-0.5 size-4 flex-none" /> Provider outage fallback is holding the last-known calendar stamped {formatSyncTime(state.lastKnownStampedAt)}.</div>
                ) : null}
              </div>
            </section>
          </>
        ) : null}

        {!loading && provider === "apple" ? (
          <>
            <DirectionCard
              title="Direction 1 — BVRB3R → Apple Calendar"
              live={Boolean(state?.writeEnabled)}
              action={state?.writeEnabled ? (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2 rounded-[13px] border border-[#C4F24E]/25 bg-black/35 p-3">
                    <span className="min-w-[210px] flex-1 break-all font-[family-name:var(--font-kicker)] text-[10px] text-[#E4F9B8]">{state.feedUrl}</span>
                    <Button variant="secondary" className="min-h-9" onClick={() => void copyFeed()}><Clipboard className="size-4" /> Copy link</Button>
                  </div>
                  <Button variant="ghost" disabled={Boolean(pendingAction)} onClick={() => void mutate({ action: "regenerate_feed" }, "feed")}>Regenerate private link</Button>
                </div>
              ) : (
                <Button className="w-full rounded-[14px]" disabled={Boolean(pendingAction)} onClick={() => void mutate({ action: "regenerate_feed" }, "feed")}><Smartphone className="size-4" /> Add to Apple Calendar</Button>
              )}
            >
              A private <span className="font-[family-name:var(--font-kicker)] text-[11px] text-[#E4F9B8]">webcal://</span> subscription carries every BVRB3R appointment, update, and cancellation to iPhone, iPad, and Mac. Regenerating it kills the old link immediately.
            </DirectionCard>
            <DirectionCard title="Direction 2 — Apple Calendar → BVRB3R" live={Boolean(state?.busyReadEnabled)}>
              Your device strips titles, notes, and invitees before it sends busy windows. BVRB3R stores only hashed event identity and start/end time.
              <CalendarPreferenceList provider={provider} calendars={busyCalendars} pending={pendingAction} mutate={mutate} />
            </DirectionCard>
          </>
        ) : null}

        {!loading && provider === "google" ? (
          <>
            {!connected ? (
              <section className={cn(CARD_CLASS, "border-[#C9A87C]/30")}>
                <h2 className={KICKER_CLASS}>Connect Google Calendar</h2>
                <p className="mt-2.5 text-[12.5px] leading-6 text-white/60">OAuth requests only two permissions: create/manage BVRB3R&apos;s secondary calendar and read free/busy availability.</p>
                <Button className="mt-3 w-full rounded-[14px]" disabled={Boolean(pendingAction)} onClick={() => void startOAuth()}>{pendingAction === "connect" ? "Opening Google…" : "Connect Google Calendar"}</Button>
              </section>
            ) : null}
            <DirectionCard
              title="Direction 1 — BVRB3R → Google Calendar"
              live={Boolean(state?.writeEnabled)}
              action={connected ? <Button className="min-h-10" disabled={Boolean(pendingAction)} onClick={() => void mutate({ action: "sync_now" }, "sync")}><RefreshCw className="size-4" /> {pendingAction === "sync" ? "Pushing…" : "Push now"}</Button> : undefined}
            >
              A dedicated <strong className="text-white">BVRB3R</strong> calendar holds appointment creates, moves, and cancellations. The connection never writes to another Google calendar.
            </DirectionCard>
            <DirectionCard title="Direction 2 — Google Calendar → BVRB3R" live={Boolean(state?.busyReadEnabled)}>
              Google&apos;s free/busy endpoint returns time windows only. Event titles, notes, and invitees never reach BVRB3R.
              <CalendarPreferenceList provider={provider} calendars={busyCalendars} pending={pendingAction} mutate={mutate} />
            </DirectionCard>
          </>
        ) : null}

        {!loading && provider !== "square" ? (
          <section className={CARD_CLASS}>
            <h2 className={KICKER_CLASS}>The rules — same as every sync</h2>
            <div className="mt-3 space-y-1.5">
              <Rule allowed>Busy blocks protect BVRB3R booking pages from double-booking.</Rule>
              <Rule allowed>Loop tags keep BVRB3R-written events from returning as personal busy time.</Rule>
              <Rule allowed={false}>No money in either direction — BVRB3R money remains Stripe-only.</Rule>
              <Rule allowed={false}>No personal title, note, invitee, or raw Apple event id is stored.</Rule>
            </div>
          </section>
        ) : null}

        {!loading && connected ? (
          <Button variant="ghost" className="w-full border border-white/12" disabled={Boolean(pendingAction)} onClick={() => void mutate({ action: "disconnect" }, "disconnect")}><Link2Off className="size-4" /> Disconnect {copy.title.replace(" Calendar Connect", "").replace(" Calendar Sync", "")}</Button>
        ) : null}

        <div className="flex flex-wrap justify-center gap-2 pt-1 text-center text-[11px] text-white/40">
          <Link className="rounded-full border border-white/10 px-3 py-2 text-[#C4F24E] hover:border-[#C4F24E]/30" href="/dashboard/barber/calendar">Unified calendar</Link>
          {provider !== "square" ? <Link className="rounded-full border border-white/10 px-3 py-2 text-white/65 hover:text-[#C4F24E]" href="/dashboard/barber/calendar/square">Square sync</Link> : null}
          {provider !== "apple" ? <Link className="rounded-full border border-white/10 px-3 py-2 text-white/65 hover:text-[#C4F24E]" href="/dashboard/barber/calendar/apple">Apple Calendar</Link> : null}
          {provider !== "google" ? <Link className="rounded-full border border-white/10 px-3 py-2 text-white/65 hover:text-[#C4F24E]" href="/dashboard/barber/calendar/google">Google Calendar</Link> : null}
        </div>
      </div>
    </div>
  );
}

function CalendarPreferenceList({
  provider,
  calendars,
  pending,
  mutate
}: {
  provider: "apple" | "google";
  calendars: CalendarConnectionState["calendars"];
  pending: string | null;
  mutate: (body: Record<string, unknown>, actionName: string) => Promise<void>;
}) {
  if (!calendars.length) {
    return (
      <div className="mt-3 rounded-[13px] border border-white/10 bg-black/30 p-3 text-xs text-white/45">
        {provider === "apple"
          ? "Enable busy-time sharing in the BVRB3R device app to choose Apple calendars. Titles stay on the device."
          : "Your primary Google calendar will appear here after OAuth completes."}
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      {calendars.map((calendar) => (
        <button
          key={calendar.id}
          type="button"
          disabled={Boolean(pending)}
          onClick={() => void mutate({
            action: "source_preference",
            calendarIdHash: calendar.id,
            name: calendar.name,
            color: calendar.color,
            blocking: !calendar.blocking
          }, `calendar-${calendar.id}`)}
          className={cn(
            "flex min-h-12 w-full items-center gap-3 rounded-[13px] border bg-black/35 px-3.5 text-left transition disabled:opacity-50",
            calendar.blocking ? "border-[#C4F24E]/25" : "border-white/10 hover:border-white/20"
          )}
        >
          <span className="size-2.5 rounded-full" style={{ backgroundColor: calendar.color ?? "#7FB5FF" }} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{calendar.name}</span>
          <span className={cn("font-[family-name:var(--font-kicker)] text-[9px] uppercase tracking-[0.1em]", calendar.blocking ? "text-[#9BE15D]" : "text-white/35")}>{calendar.blocking ? "Blocking ✓" : "Ignored"}</span>
        </button>
      ))}
    </div>
  );
}
