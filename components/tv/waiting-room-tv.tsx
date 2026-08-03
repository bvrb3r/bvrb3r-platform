"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  formatTvPrice,
  sceneAtElapsedSeconds,
  WAITING_ROOM_SCENE_LABELS,
  WAITING_ROOM_TIMELINE,
  type WaitingRoomSceneId,
  type WaitingRoomTvSnapshot
} from "@/lib/tv/waiting-room";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BV";
}

const LIVE_REFRESH_INTERVAL_MS = 30_000;
const OFFLINE_RETRY_INTERVAL_MS = 5_000;

function EmptyScene({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[52vh] flex-col items-center justify-center rounded-[36px] border border-white/10 bg-white/[0.025] p-10 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#C9A87C]">Approved content only</p>
      <h2 className="mt-5 font-serif text-5xl sm:text-7xl" data-display="true">{title}</h2>
      <p className="mt-5 max-w-xl text-lg leading-8 text-white/48">{detail}</p>
      {action}
    </div>
  );
}

function StatusScene({
  status,
  onRetry,
  retrying = false
}: {
  status: Exclude<WaitingRoomTvSnapshot["status"], "live">;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const copy = {
    empty: ["The floor is quiet", "No public-safe chair or menu state is available yet."],
    closed: ["We’re closed", "The waiting room display will resume when the shop opens walk-in intake."],
    offline: ["Display offline", "Live shop state is unavailable. Please see the front desk for help."],
    emergency: ["Please see staff", "The waiting-room display is paused by the shop’s emergency control."],
    setup: ["Choose a shop", "Open the waiting-room TV from a shop dashboard to bind this display to the correct floor."]
  }[status];

  return (
    <EmptyScene
      title={copy[0]}
      detail={copy[1]}
      action={status === "offline" && onRetry ? (
        <button
          type="button"
          className="mt-7 rounded-full border border-[#C9A87C]/45 bg-[#C9A87C]/10 px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#EAD9B0] disabled:cursor-wait disabled:opacity-55"
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? "Reconnecting…" : "Retry connection"}
        </button>
      ) : undefined}
    />
  );
}

function BoardScene({ snapshot }: { snapshot: WaitingRoomTvSnapshot }) {
  if (!snapshot.team.length) return <EmptyScene title="The floor is quiet" detail="No active public-safe chair state is available yet." />;
  return (
    <div className="grid min-h-[52vh] gap-4 md:grid-cols-2 xl:grid-cols-4">
      {snapshot.team.slice(0, 8).map((barber) => (
        <article key={barber.barberId} className="rounded-[32px] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-6">
          <div className="flex items-center justify-between gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-lg font-black">{initials(barber.name)}</span>
            <span className={`rounded-full border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] ${barber.floorState === "open" ? "border-[#C4F24E]/35 bg-[#C4F24E]/10 text-[#C4F24E]" : barber.floorState === "busy" ? "border-[#C9A87C]/40 bg-[#C9A87C]/10 text-[#EAD9B0]" : "border-white/12 text-white/40"}`}>{barber.floorState}</span>
          </div>
          <h2 className="mt-8 text-2xl font-black">{barber.name}</h2>
          <p className="mt-2 text-sm text-white/45">{barber.floorState === "open" ? "Chair available" : barber.floorState === "busy" ? "Serving now" : "Not taking walk-ins"}</p>
          <div className="mt-7 border-t border-white/10 pt-5 font-mono text-[10px] uppercase tracking-[0.13em] text-white/35">{barber.liveAppointments} active · {barber.booked} booked</div>
        </article>
      ))}
    </div>
  );
}

function MenuScene({ snapshot }: { snapshot: WaitingRoomTvSnapshot }) {
  if (!snapshot.menu.length) return <EmptyScene title="Menu coming into view" detail="Published, bookable barber prices will appear here after the service catalog is verified." />;
  return (
    <div className="grid min-h-[52vh] gap-4 md:grid-cols-2 xl:grid-cols-3">
      {snapshot.menu.slice(0, 6).map((group) => (
        <article key={group.barberId} className="rounded-[32px] border border-white/10 bg-white/[0.025] p-6">
          <div className="flex items-center gap-4 border-b border-white/10 pb-5">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C4F24E] font-black text-[#060708]">{initials(group.barberName)}</span>
            <h2 className="text-xl font-black">{group.barberName}</h2>
          </div>
          <dl className="mt-5 space-y-4">
            {group.services.slice(0, 6).map((service) => (
              <div key={service.id} className="flex items-baseline justify-between gap-5">
                <div><dt className="font-semibold">{service.name}</dt><dd className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-white/35">{service.durationMinutes} min</dd></div>
                <dd className="text-xl font-black text-[#C4F24E]">{formatTvPrice(service.priceCents)}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  );
}

function AvailabilityScene({ snapshot }: { snapshot: WaitingRoomTvSnapshot }) {
  const open = snapshot.team.filter((barber) => barber.floorState === "open");
  if (!open.length) return <EmptyScene title="No open chairs right now" detail="Live availability will update automatically when an eligible chair opens." />;
  return (
    <div className="mx-auto grid min-h-[52vh] max-w-5xl content-center gap-4">
      {open.map((barber) => (
        <article key={barber.barberId} className="flex flex-col gap-5 rounded-[30px] border border-[#C4F24E]/35 bg-[#C4F24E]/[0.045] p-6 sm:flex-row sm:items-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#C4F24E] text-xl font-black text-[#060708]">{initials(barber.name)}</span>
          <div><h2 className="text-3xl font-black">{barber.name}</h2><p className="mt-1 text-white/45">Eligible live chair · public availability</p></div>
          <span className="sm:ml-auto rounded-full border border-[#C4F24E]/45 bg-[#C4F24E]/10 px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.15em] text-[#C4F24E]">Open now</span>
        </article>
      ))}
    </div>
  );
}

function ScheduleScene({ snapshot }: { snapshot: WaitingRoomTvSnapshot }) {
  if (!snapshot.team.length) return <EmptyScene title="No public schedule yet" detail="Only verified barber availability is shown on this screen." />;
  return (
    <div className="grid min-h-[52vh] gap-4 md:grid-cols-2 xl:grid-cols-4">
      {snapshot.team.slice(0, 8).map((barber) => (
        <article key={barber.barberId} className="rounded-[30px] border border-white/10 bg-white/[0.025] p-6 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.06] text-xl font-black">{initials(barber.name)}</span>
          <h2 className="mt-5 text-2xl font-black">{barber.name}</h2>
          <p className={`mt-5 font-mono text-xs uppercase tracking-[0.16em] ${barber.floorState === "open" ? "text-[#C4F24E]" : "text-white/45"}`}>{barber.floorState === "open" ? "Walk-ins open" : `${barber.booked} booked today`}</p>
        </article>
      ))}
    </div>
  );
}

function Scene({ scene, snapshot }: { scene: WaitingRoomSceneId; snapshot: WaitingRoomTvSnapshot }) {
  if (scene === "board") return <BoardScene snapshot={snapshot} />;
  if (scene === "menu") return <MenuScene snapshot={snapshot} />;
  if (scene === "availability") return <AvailabilityScene snapshot={snapshot} />;
  if (scene === "schedule") return <ScheduleScene snapshot={snapshot} />;
  if (scene === "callout") return <AvailabilityScene snapshot={snapshot} />;

  const copy: Record<Exclude<WaitingRoomSceneId, "board" | "menu" | "availability" | "schedule" | "callout">, [string, string]> = {
    culture: ["Culture", "No approved Culture post is scheduled for this TV rotation."],
    reviews: ["Five stars", "Verified review content will appear only after a real review is approved for display."],
    barber_of_week: ["Barber of the week", "No verified weekly feature is scheduled right now."],
    gifted: ["Gifted Cuts", "Gift activity stays hidden until a real, privacy-safe display event is approved."],
    milestone: ["Team milestone", "No verified team milestone is scheduled right now."],
    seasonal: ["Seasonal week", "No approved seasonal service is active right now."],
    welcome: ["New chair", "No verified new-chair announcement is scheduled right now."],
    hiring: ["Open chair", "No public founding-chair or hiring notice is active right now."],
    promo: ["Your move", "Scan and booking promotions appear only when a verified destination is configured."]
  };
  const [title, detail] = copy[scene];
  return <EmptyScene title={title} detail={detail} />;
}

export function WaitingRoomTv({ initialSnapshot }: { initialSnapshot: WaitingRoomTvSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [elapsed, setElapsed] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [networkAvailable, setNetworkAvailable] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const refreshInFlight = useRef(false);
  const scene = useMemo(() => sceneAtElapsedSeconds(elapsed), [elapsed]);
  const uniqueScenes = useMemo(() => [...new Set(WAITING_ROOM_TIMELINE.map((entry) => entry.id))], []);
  const setupRequired = snapshot.status === "setup";
  const displayStatus = !networkAvailable || refreshFailed ? "offline" : snapshot.status;

  const refreshSnapshot = useCallback(async () => {
    if (setupRequired || refreshInFlight.current) return;

    refreshInFlight.current = true;
    setRetrying(true);
    try {
      const response = await fetch(`/api/shop/tv?shopId=${encodeURIComponent(snapshot.shopId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Waiting-room TV refresh failed with ${response.status}`);

      const next = await response.json() as WaitingRoomTvSnapshot;
      setSnapshot(next);
      setNetworkAvailable(true);
      setRefreshFailed(false);
    } catch {
      setRefreshFailed(true);
    } finally {
      refreshInFlight.current = false;
      setRetrying(false);
    }
  }, [setupRequired, snapshot.shopId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed((value) => value + 1);
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (setupRequired) return;
    const refresh = window.setInterval(
      () => void refreshSnapshot(),
      displayStatus === "offline" ? OFFLINE_RETRY_INTERVAL_MS : LIVE_REFRESH_INTERVAL_MS
    );
    return () => window.clearInterval(refresh);
  }, [displayStatus, refreshSnapshot, setupRequired]);

  useEffect(() => {
    if (setupRequired) return;

    const handleOffline = () => setNetworkAvailable(false);
    const handleOnline = () => void refreshSnapshot();
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [refreshSnapshot, setupRequired]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#060708] px-6 py-5 text-[#F5F1E8] sm:px-10">
      <header className="flex items-center justify-between gap-6 border-b border-white/10 pb-5">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#C9A87C]">{snapshot.shopName}</p><h1 className="mt-2 text-xl font-black uppercase tracking-[0.08em]">The BVRB3R Lounge · {WAITING_ROOM_SCENE_LABELS[scene]}</h1></div>
        <time className="font-mono text-lg text-white/65">{now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</time>
      </header>
      <div className="mt-5">
        {displayStatus === "live"
          ? <Scene scene={scene} snapshot={snapshot} />
          : <StatusScene status={displayStatus} onRetry={() => void refreshSnapshot()} retrying={retrying} />}
      </div>
      <footer className="mt-5 flex items-center justify-between gap-5 border-t border-white/10 pt-4">
        <div className="flex gap-2" aria-label={`${uniqueScenes.length} TV scenes`}>
          {uniqueScenes.map((id) => <span key={id} className={`h-1.5 w-5 rounded-full ${id === scene ? "bg-[#C9A87C]" : "bg-white/15"}`} />)}
        </div>
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">
          {retrying ? "reconnecting" : displayStatus} public-safe state · refreshes every {displayStatus === "offline" ? "5" : "30"} seconds
        </p>
      </footer>
    </main>
  );
}
