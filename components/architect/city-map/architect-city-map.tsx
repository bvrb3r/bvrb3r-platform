"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Clipboard,
  Download,
  Link2,
  LockKeyhole,
  Play,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  X
} from "lucide-react";
import type {
  ArchitectCityDoor,
  ArchitectCityFloorId,
  ArchitectCityManifest,
  ArchitectCityStatus,
  ArchitectInfraStatus,
  ArchitectLedgerRow,
  ArchitectServiceMetric
} from "@/lib/architect/city-map/types";
import { cn } from "@/lib/utils";

type FloorSelection = ArchitectCityFloorId | "all";
type TraceMode = "live" | "expected" | "failure" | "loop";
type Panel = "connections" | "weekly" | "controls" | null;
type ArchitectSystemControlRow = {
  control_key: string;
  label: string;
  active: boolean;
  reason: string | null;
  version: number;
  changed_by: string | null;
  changed_at: string;
};
type ArchitectFeatureFlagRow = {
  gate_key: string;
  reason: string;
  enabled: boolean;
  updated_at: string;
};
type ArchitectControlAuditRow = {
  id: string;
  action_type: string;
  target_type: string;
  target_key: string;
  reason: string;
  occurred_at: string;
};
type ArchitectControlSnapshot = {
  controls: ArchitectSystemControlRow[];
  featureFlags: ArchitectFeatureFlagRow[];
  audit: ArchitectControlAuditRow[];
};
type ArchitectControlSelection = {
  action: "system_control" | "feature_flag";
  key: string;
  label: string;
  current: boolean;
  version?: number;
};
type ArchitectOperationRow = {
  id: string;
  command_type: string;
  target_key: string;
  status: string;
  reason: string;
  requested_at: string;
  completed_at: string | null;
  error_message: string | null;
};
type ArchitectOperationCapability = {
  executable: boolean;
  evidence: string;
};
type ArchitectOperationsSnapshot = {
  jobs: Array<Record<string, unknown>>;
  failedWebhooks: Array<Record<string, unknown>>;
  devices: Array<Record<string, unknown>>;
  commands: ArchitectOperationRow[];
  maintenance: Array<Record<string, unknown>>;
  rollbackCandidates: Array<{ id: string; url: string; createdAt: string; commit: string }>;
  reportPreference: Record<string, unknown> | null;
  capabilities: Record<string, ArchitectOperationCapability>;
};
type ArchitectOperationSelection = {
  action: string;
  target: string;
  label: string;
  payload: Record<string, unknown>;
  executable: boolean;
};

const STATUS_STYLE: Record<ArchitectCityStatus, string> = {
  open: "border-[#C4F24E]/35 bg-[#C4F24E]/10 text-[#DDF99B]",
  needs_review: "border-[#D9B461]/40 bg-[#D9B461]/10 text-[#E7CD8A]",
  failed: "border-[#FF9B9B]/45 bg-[#FF9B9B]/10 text-[#FFB7B7]"
};

function statusLabel(status: ArchitectCityStatus) {
  if (status === "open") return "Gate open";
  if (status === "failed") return "Failed";
  return "Needs review";
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() > 0
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(date)
    : "not verified";
}

function buildDoorReport(manifest: ArchitectCityManifest, floor: string, district: string, door: ArchitectCityDoor) {
  const verify = door.gates.filter((gate) => gate.status !== "open").map((gate) => `${gate.id}: ${gate.evidence}`);
  const machine = {
    deploy: manifest.deploy,
    door: { entry: door.code, action: door.binding, status: door.status },
    route: door.gates,
    exit: { outcome: door.exit.outcome, signal: door.exit.description },
    verify,
    fix: door.gates.filter((gate) => gate.status !== "open").map((gate) => `Verify ${gate.label} through server evidence.`)
  };
  return [
    "BVRB3R ARCHITECT — DOOR REPORT",
    `Deploy ${manifest.deploy.hash} · verified ${formatTime(manifest.deploy.verifiedAt)}`,
    `Floor: ${floor} · ${district}`,
    "",
    `DOOR  ${door.code} · ${door.title}`,
    `      ${door.description}`,
    `      Binding: ${door.binding}`,
    `      Health: ${door.status === "open" ? "PASS — all gates open" : "REVIEW — production evidence needs attention"}`,
    "",
    `ROUTE (${door.gates.length} gates)`,
    ...door.gates.map((gate, index) => `  ${index + 1}. ${gate.label} — ${statusLabel(gate.status)}`),
    "",
    `EXIT  ${door.exit.code} · ${door.exit.title}`,
    `      ${door.exit.description}`,
    `      Outcome: ${door.exit.outcome}`,
    "",
    "--- MACHINE BLOCK ---",
    "```json",
    JSON.stringify(machine, null, 2),
    "```"
  ].join("\n");
}

function buildWeeklyReport(manifest: ArchitectCityManifest, period: "week" | "month") {
  const floorScores = manifest.floors.map((floor) => {
    const open = floor.doors.filter((door) => door.status === "open").length;
    return {
      floor: floor.label,
      score: Math.round((open / Math.max(1, floor.doors.length)) * 100),
      review: floor.doors.length - open
    };
  });
  const fixes = manifest.floors.flatMap((floor) => floor.doors
    .filter((door) => door.status !== "open")
    .map((door) => ({ floor: floor.label, door: door.code, title: door.title, status: door.status })));
  const operational = manifest.uptime.filter((day) => day.status === "operational").length;
  const uptime = manifest.uptime.length ? (operational / manifest.uptime.length) * 100 : null;
  const machine = {
    period,
    generated_at: manifest.generatedAt,
    deploy: manifest.deploy,
    floors: floorScores,
    incidents: {
      total: manifest.incidents.length,
      open: manifest.incidents.filter((incident) => incident.status === "open").length,
      p0: manifest.incidents.filter((incident) => incident.severity === "P0").length
    },
    uptime: uptime === null ? null : Number(uptime.toFixed(2)),
    fix_next: fixes
  };
  return [
    `BVRB3R ARCHITECT — ${period === "month" ? "MONTHLY" : "WEEKLY"} HEALTH REPORT`,
    `Deploy ${manifest.deploy.hash} · verified ${formatTime(manifest.deploy.verifiedAt)}`,
    "",
    ...floorScores.map((floor) => `${floor.floor.toUpperCase()}  ${floor.score}% · ${floor.review} review`),
    "",
    `INCIDENTS  ${machine.incidents.total} total · ${machine.incidents.open} open · ${machine.incidents.p0} P0`,
    `UPTIME     ${uptime === null ? "not verified" : `${uptime.toFixed(2)}% across ${manifest.uptime.length} evidenced days`}`,
    "",
    "FIX NEXT",
    ...(fixes.length ? fixes.slice(0, 12).map((fix) => `  ${fix.door} · ${fix.title} · ${fix.status}`) : ["  No open review doors."]),
    "",
    "--- MACHINE BLOCK ---",
    "```json",
    JSON.stringify(machine, null, 2),
    "```"
  ].join("\n");
}

export function buildCityReport(manifest: ArchitectCityManifest) {
  const floors = manifest.floors.map((floor) => ({
    id: floor.id,
    label: floor.label,
    district: floor.district,
    status: floor.doors.some((door) => door.status === "failed")
      ? "failed"
      : floor.doors.some((door) => door.status === "needs_review")
        ? "needs_review"
        : "open",
    doors: floor.doors.map((door) => ({
      code: door.code,
      title: door.title,
      binding: door.binding,
      status: door.status,
      gates: door.gates,
      exit: door.exit
    }))
  }));
  const doorCount = floors.reduce((total, floor) => total + floor.doors.length, 0);
  const reviewCount = floors.reduce(
    (total, floor) => total + floor.doors.filter((door) => door.status !== "open").length,
    0
  );
  const machine = {
    generated_at: manifest.generatedAt,
    deploy: manifest.deploy,
    summary: {
      floors: floors.length,
      doors: doorCount,
      open: doorCount - reviewCount,
      review: reviewCount
    },
    floors,
    infrastructure: manifest.infra,
    connections: manifest.connections,
    incidents: manifest.incidents
  };

  return [
    "BVRB3R ARCHITECT — ALL-CITY REPORT",
    `Deploy ${manifest.deploy.hash} · verified ${formatTime(manifest.deploy.verifiedAt)}`,
    `${floors.length} floors · ${doorCount} doors · ${doorCount - reviewCount} open · ${reviewCount} review`,
    "",
    ...floors.map((floor) => {
      const open = floor.doors.filter((door) => door.status === "open").length;
      return `${floor.label.toUpperCase()}  ${open}/${floor.doors.length} open · ${floor.district}`;
    }),
    "",
    "FIX NEXT",
    ...floors.flatMap((floor) => floor.doors
      .filter((door) => door.status !== "open")
      .map((door) => `  ${door.code} · ${door.title} · ${door.status}`))
      .slice(0, 20),
    "",
    "--- MACHINE BLOCK ---",
    "```json",
    JSON.stringify(machine, null, 2),
    "```"
  ].join("\n");
}

function downloadCsv(rows: ArchitectLedgerRow[], floor: FloorSelection, date: string) {
  const quote = (value: string) => `"${value.replaceAll("\"", "\"\"")}"`;
  const records = rows.map((row) => [
    row.occurredAt,
    row.floorId,
    row.primary,
    row.contact,
    row.identity,
    row.doorCode ? `${row.doorCode} · ${row.doorLabel}` : "Not routable yet",
    row.money,
    row.status
  ]);
  const csv = [
    ["time", "floor", "name_or_reference", "contact", "identity", "door", "money", "status"],
    ...records
  ].map((row) => row.map(quote).join(",")).join("\n");
  const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = `bvrb3r-ledger-${floor === "all" ? "city" : floor}-${date}.csv`;
  anchor.click();
  URL.revokeObjectURL(href);
}

function TopButton({ children, onClick, danger = false }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-8 items-center gap-2 rounded-full border px-3 font-mono text-[8px] font-bold uppercase tracking-[0.14em] transition",
        danger ? "border-[#FF9B9B]/28 text-[#FFB7B7]" : "border-white/14 text-white/60 hover:border-[#C4F24E]/35 hover:text-[#C4F24E]"
      )}
    >
      {children}
    </button>
  );
}

function ErrorSparkline({ metrics }: { metrics: ArchitectServiceMetric[] }) {
  const ordered = [...metrics].sort((a, b) => a.bucketStartedAt.localeCompare(b.bucketStartedAt)).slice(-24);
  if (!ordered.length) return <span className="font-mono text-[8px] text-white/28">24h errors not verified</span>;
  const maxRate = Math.max(...ordered.map((metric) => metric.errorRate), 0.01);
  return <span className="flex h-5 items-end gap-px" aria-label={`24-hour error rate, ${ordered.length} evidenced buckets`}>{ordered.map((metric) => <span key={metric.id} title={`${metric.bucketStartedAt}: ${(metric.errorRate * 100).toFixed(2)}%`} className={cn("w-1 min-w-1 rounded-t-[1px]", metric.errorRate > 0.05 ? "bg-[#FF9B9B]" : metric.errorRate > 0.01 ? "bg-[#D9B461]" : "bg-[#C4F24E]/70")} style={{ height: `${Math.max(3, (metric.errorRate / maxRate) * 20)}px` }} />)}</span>;
}

function InfraBanner({ item, metrics, onClick }: { item: ArchitectInfraStatus; metrics: ArchitectServiceMetric[]; onClick: () => void }) {
  const green = ["ready", "healthy", "operational", "synced"].includes(item.status);
  const mismatch = item.status === "mismatch";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border bg-[#060708]/72 px-4 py-2 text-left transition hover:bg-white/[0.035]",
        green ? "border-[#C4F24E]/23" : mismatch ? "border-[#FF9B9B]/34" : "border-[#D9B461]/28"
      )}
    >
      <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/58">{item.label}</span>
      <span className={cn("inline-flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em]", green ? "text-[#C4F24E]" : mismatch ? "text-[#FF9B9B]" : "text-[#D9B461]")}>
        <span className={cn("h-1.5 w-1.5 rounded-full", green ? "bg-[#C4F24E]" : mismatch ? "bg-[#FF9B9B]" : "bg-[#D9B461]")} />
        {item.status.replace("_", " ")}
      </span>
      <span className="font-mono text-[9px] text-white/42">{item.headline}</span>
      <ErrorSparkline metrics={metrics} />
      <span className="ml-auto font-mono text-[8px] text-white/32">{formatTime(item.checkedAt)}</span>
    </button>
  );
}

function PanelHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">{title}</p>
      <span className="ml-auto font-mono text-[8px] text-white/30">production evidence · no inferred Pass</span>
      <button type="button" onClick={onClose} className="text-white/40"><X className="h-4 w-4" /></button>
    </div>
  );
}

function RouteMap({
  door,
  color,
  traceMode,
  replayToken,
  selectedGate,
  onSelectGate
}: {
  door: ArchitectCityDoor;
  color: string;
  traceMode: TraceMode;
  replayToken: number;
  selectedGate: string | null;
  onSelectGate: (id: string) => void;
}) {
  const points = door.gates.map((_, index) => {
    const x = 10 + (index * 80) / Math.max(1, door.gates.length - 1);
    return `${x},${index % 2 ? 60 : 40}`;
  }).join(" ");
  const motionPath = door.gates.map((_, index) => {
    const x = 10 + (index * 80) / Math.max(1, door.gates.length - 1);
    const y = index % 2 ? 60 : 40;
    return `${index === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");

  return (
    <div className="relative min-h-[330px] overflow-hidden rounded-[22px] border border-white/[0.08] bg-[radial-gradient(circle_at_45%_40%,rgba(196,242,78,0.06),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.018),rgba(0,0,0,0.18))] p-4" data-testid="architect-city-route">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(245,241,232,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(245,241,232,.06)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em]" style={{ color }}>{door.code}</p>
          <h2 className="mt-2 font-serif text-3xl leading-none text-[#F5F1E8] sm:text-4xl">{door.title}</h2>
          <p className="mt-2 text-sm text-white/50">{door.description}</p>
        </div>
        <span className={cn("rounded-full border px-3 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.16em]", STATUS_STYLE[door.status])}>
          {statusLabel(door.status)}
        </span>
      </div>
      <svg aria-hidden="true" className="absolute inset-x-7 top-[92px] h-[150px] w-[calc(100%-3.5rem)]" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke={traceMode === "failure" ? "#FF9B9B" : color}
          strokeWidth="1.3"
          strokeDasharray={traceMode === "expected" ? "2 4" : "5 4"}
          vectorEffect="non-scaling-stroke"
        />
        {replayToken > 0 ? (
          <circle key={replayToken} r="2.1" fill={traceMode === "failure" ? "#FF9B9B" : color}>
            <animateMotion
              dur="2.4s"
              path={motionPath}
              repeatCount={traceMode === "loop" ? "indefinite" : "1"}
              fill="freeze"
            />
          </circle>
        ) : null}
      </svg>
      <div className="relative z-10 mt-20 grid gap-3 overflow-x-auto pb-1" style={{ gridTemplateColumns: `repeat(${door.gates.length}, minmax(105px, 1fr))` }}>
        {door.gates.map((gate, index) => (
          <button
            key={gate.id}
            type="button"
            onClick={() => onSelectGate(gate.id)}
            className={cn(
              "min-h-[86px] rounded-[13px] border bg-[#08090A]/94 p-3 text-left transition hover:-translate-y-0.5",
              STATUS_STYLE[gate.status],
              selectedGate === gate.id && "ring-2 ring-white/50"
            )}
          >
            <span className="font-mono text-[8px] uppercase tracking-[0.16em] opacity-60">{String(index + 1).padStart(2, "0")} · {gate.id}</span>
            <span className="mt-2 block text-xs font-semibold leading-4 text-[#F5F1E8]">{gate.label}</span>
          </button>
        ))}
      </div>
      <div className="relative z-10 mt-5 flex flex-wrap items-center gap-3 rounded-[13px] border border-white/[0.08] bg-black/28 px-4 py-3">
        <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/38">Verified exit</span>
        <span className="font-mono text-[9px] font-bold text-[#C4F24E]">{door.exit.code}</span>
        <span className="text-sm font-semibold text-white">{door.exit.title}</span>
        <span className="text-xs text-white/42">{door.exit.description}</span>
      </div>
    </div>
  );
}

export function ArchitectCityMap({
  initialManifest,
  architect
}: {
  initialManifest: ArchitectCityManifest;
  architect: { name: string; email: string };
}) {
  const [manifest, setManifest] = useState(initialManifest);
  const [floorId, setFloorId] = useState<FloorSelection>("walk_ins");
  const [doorIndex, setDoorIndex] = useState(0);
  const [traceMode, setTraceMode] = useState<TraceMode>("live");
  const [replayToken, setReplayToken] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [selectedGate, setSelectedGate] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [infraDetail, setInfraDetail] = useState<ArchitectInfraStatus | null>(null);
  const [refreshState, setRefreshState] = useState<"idle" | "vercel" | "manifest" | "gates" | "failed">("idle");
  const [search, setSearch] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [timeRange, setTimeRange] = useState<"all" | "30m" | "1h" | "2h">("all");
  const [date, setDate] = useState(initialManifest.ledgerDate);
  const [ledgerSelection, setLedgerSelection] = useState<ArchitectLedgerRow | null>(null);
  const [copied, setCopied] = useState(false);
  const [weeklyPeriod, setWeeklyPeriod] = useState<"week" | "month">("week");
  const [weeklyCopied, setWeeklyCopied] = useState(false);
  const [controlSnapshot, setControlSnapshot] = useState<ArchitectControlSnapshot | null>(null);
  const [controlSelection, setControlSelection] = useState<ArchitectControlSelection | null>(null);
  const [controlReason, setControlReason] = useState("");
  const [controlArmedAt, setControlArmedAt] = useState<number | null>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const [controlMessage, setControlMessage] = useState<string | null>(null);
  const [operationsSnapshot, setOperationsSnapshot] = useState<ArchitectOperationsSnapshot | null>(null);
  const [operationSelection, setOperationSelection] = useState<ArchitectOperationSelection | null>(null);
  const [operationReason, setOperationReason] = useState("");
  const [operationArmedAt, setOperationArmedAt] = useState<number | null>(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [broadcastAudience, setBroadcastAudience] = useState("all");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [maintenanceStartsAt, setMaintenanceStartsAt] = useState("");
  const [maintenanceEndsAt, setMaintenanceEndsAt] = useState("");
  const [rollbackTarget, setRollbackTarget] = useState("");

  const selectedFloor = manifest.floors.find((floor) => floor.id === (floorId === "all" ? "walk_ins" : floorId)) ?? manifest.floors[0];
  const selectedDoor = selectedFloor.doors[Math.min(doorIndex, selectedFloor.doors.length - 1)];
  const selectedGateDetail = selectedDoor.gates.find((gate) => gate.id === selectedGate) ?? null;
  const visibleDoors = useMemo(() => {
    const term = search.trim().toLowerCase();
    const floors = floorId === "all" ? manifest.floors : manifest.floors.filter((floor) => floor.id === floorId);
    return floors.flatMap((floor) => floor.doors.map((door, index) => ({ floor, door, index })))
      .filter(({ floor, door }) => !term || `${floor.label} ${door.code} ${door.title} ${door.description} ${door.binding}`.toLowerCase().includes(term));
  }, [floorId, manifest.floors, search]);
  const ledgerRows = useMemo(() => {
    const term = ledgerSearch.trim().toLowerCase();
    const cutoff = timeRange === "all" ? 0 : Date.now() - ({ "30m": 30, "1h": 60, "2h": 120 }[timeRange] * 60_000);
    return manifest.ledger.filter((row) => {
      if (floorId !== "all" && row.floorId !== floorId) return false;
      if (date && row.occurredAt.slice(0, 10) !== date) return false;
      if (cutoff && Date.parse(row.occurredAt) < cutoff) return false;
      return !term || Object.values(row).join(" ").toLowerCase().includes(term);
    });
  }, [date, floorId, ledgerSearch, manifest.ledger, timeRange]);

  const chooseDoor = (nextFloor: ArchitectCityFloorId, nextIndex: number) => {
    setFloorId(nextFloor);
    setDoorIndex(nextIndex);
    setSelectedGate(null);
  };

  const refresh = async (requestedDate = date) => {
    setRefreshState("vercel");
    try {
      setRefreshState("manifest");
      const response = await fetch(`/api/architect/manifest?date=${encodeURIComponent(requestedDate)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Manifest refresh failed.");
      setRefreshState("gates");
      setManifest(await response.json() as ArchitectCityManifest);
      setRefreshState("idle");
    } catch {
      setRefreshState("failed");
    }
  };

  const changeLedgerDate = (nextDate: string) => {
    setDate(nextDate);
    if (!nextDate) return;
    const url = new URL(window.location.href);
    url.searchParams.set("date", nextDate);
    window.history.replaceState(null, "", url);
    void refresh(nextDate);
  };

  const copyReport = async () => {
    const report = floorId === "all"
      ? buildCityReport(manifest)
      : buildDoorReport(manifest, selectedFloor.label, selectedFloor.district, selectedDoor);
    await navigator.clipboard?.writeText(report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const replayRoute = () => {
    setReplayToken((token) => token + 1);
    setReplaying(true);
    window.setTimeout(() => setReplaying(false), 2_400);
  };

  const copyWeeklyReport = async () => {
    await navigator.clipboard?.writeText(buildWeeklyReport(manifest, weeklyPeriod));
    setWeeklyCopied(true);
    window.setTimeout(() => setWeeklyCopied(false), 1400);
  };

  const emailWeeklyReport = () => {
    const report = buildWeeklyReport(manifest, weeklyPeriod);
    const human = report.split("--- MACHINE BLOCK ---")[0]?.trim() ?? report;
    const subject = `BVRB3R ${weeklyPeriod === "month" ? "Monthly" : "Weekly"} Health Report · ${manifest.deploy.hash}`;
    window.location.href = `mailto:${encodeURIComponent(architect.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${human}\n\n— sent from the Architect City Map`)}`;
  };

  const loadControls = async () => {
    setControlBusy(true);
    setControlMessage(null);
    try {
      const response = await fetch("/api/architect/controls", { cache: "no-store" });
      const body = await response.json() as ArchitectControlSnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Control state could not be loaded.");
      setControlSnapshot(body);
    } catch (error) {
      setControlMessage(error instanceof Error ? error.message : "Control state could not be loaded.");
    } finally {
      setControlBusy(false);
    }
  };

  const loadOperations = async () => {
    setOperationBusy(true);
    setOperationMessage(null);
    try {
      const response = await fetch("/api/architect/operations", { cache: "no-store" });
      const body = await response.json() as ArchitectOperationsSnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Operations state could not be loaded.");
      setOperationsSnapshot(body);
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : "Operations state could not be loaded.");
    } finally {
      setOperationBusy(false);
    }
  };

  const openControls = () => {
    if (panel === "controls") {
      setPanel(null);
      return;
    }
    setPanel("controls");
    if (manifest.controlsBlocked) return;
    void loadControls();
    void loadOperations();
  };

  const chooseControl = (selection: ArchitectControlSelection) => {
    setControlSelection(selection);
    setControlReason("");
    setControlArmedAt(null);
    setControlMessage(null);
  };

  const executeControl = async () => {
    if (!controlSelection || manifest.controlsBlocked || controlBusy) return;
    if (controlReason.trim().length < 8) {
      setControlMessage("Enter an operational reason of at least 8 characters.");
      return;
    }
    const now = Date.now();
    if (!controlArmedAt || now - controlArmedAt > 4_000) {
      setControlArmedAt(now);
      setControlMessage("Control armed. Click Confirm within 4 seconds.");
      return;
    }

    const active = !controlSelection.current;
    setControlBusy(true);
    setControlMessage("Writing control and append-only audit…");
    try {
      const response = await fetch("/api/architect/controls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: controlSelection.action,
          target: controlSelection.key,
          active,
          expectedVersion: controlSelection.version,
          reason: controlReason.trim(),
          confirmation: `CONFIRM ${controlSelection.key} ${active ? "ON" : "OFF"}`
        })
      });
      const body = await response.json() as { error?: string; requestId?: string };
      if (!response.ok) throw new Error(body.error ?? "The control write failed.");
      setControlSelection(null);
      setControlReason("");
      setControlArmedAt(null);
      setControlMessage(`Pass — audited request ${body.requestId ?? "recorded"}.`);
      const refreshed = await fetch("/api/architect/controls", { cache: "no-store" });
      if (refreshed.ok) setControlSnapshot(await refreshed.json() as ArchitectControlSnapshot);
    } catch (error) {
      setControlArmedAt(null);
      setControlMessage(error instanceof Error ? error.message : "The control write failed.");
    } finally {
      setControlBusy(false);
    }
  };

  const chooseOperation = (selection: ArchitectOperationSelection) => {
    setOperationSelection(selection);
    setOperationReason("");
    setOperationArmedAt(null);
    setOperationMessage(selection.executable ? null : "This executor is not connected. The action remains blocked.");
  };

  const executeOperation = async () => {
    if (!operationSelection || !operationSelection.executable || manifest.controlsBlocked || operationBusy) return;
    if (operationReason.trim().length < 8) {
      setOperationMessage("Enter an operational reason of at least 8 characters.");
      return;
    }
    const now = Date.now();
    if (!operationArmedAt || now - operationArmedAt > 4_000) {
      setOperationArmedAt(now);
      setOperationMessage("Operation armed. Click Confirm within 4 seconds.");
      return;
    }

    setOperationBusy(true);
    setOperationMessage("Executing and writing append-only evidence…");
    try {
      const response = await fetch("/api/architect/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: operationSelection.action,
          target: operationSelection.target,
          payload: operationSelection.payload,
          reason: operationReason.trim(),
          confirmation: `CONFIRM ${operationSelection.action} ${operationSelection.target}`
        })
      });
      const body = await response.json() as { error?: string; requestId?: string; queued?: boolean };
      if (!response.ok) throw new Error(body.error ?? "The operation failed.");
      setOperationSelection(null);
      setOperationReason("");
      setOperationArmedAt(null);
      setOperationMessage(`${body.queued ? "Queued" : "Pass"} — audited request ${body.requestId ?? "recorded"}.`);
      const refreshed = await fetch("/api/architect/operations", { cache: "no-store" });
      if (refreshed.ok) setOperationsSnapshot(await refreshed.json() as ArchitectOperationsSnapshot);
    } catch (error) {
      setOperationArmedAt(null);
      setOperationMessage(error instanceof Error ? error.message : "The operation failed.");
    } finally {
      setOperationBusy(false);
    }
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#060708] text-[#F5F1E8] [-webkit-text-size-adjust:100%] [text-size-adjust:100%]" data-testid="architect-city-map">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_1100px_500px_at_50%_-10%,rgba(196,242,78,0.055),transparent_60%)]" />
      <div className="relative z-10">
        <header className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-7">
          <span className="text-sm font-extrabold tracking-[0.28em]">BVRB<span className="text-[#C4F24E]">3</span>R</span>
          <span className="rounded-full border border-[#C9A87C]/30 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[#C9A87C]">Architect · the city, mapped</span>
          <nav aria-label="Architect city floors" className="order-last flex w-full max-w-full gap-1 overflow-x-auto rounded-full border border-white/12 p-1 sm:order-none sm:w-auto sm:flex-1">
            {[...manifest.floors.map((floor) => ({ id: floor.id as FloorSelection, label: floor.label })), { id: "all" as const, label: "All" }].map((floor) => (
              <button
                key={floor.id}
                type="button"
                onClick={() => { setFloorId(floor.id); setDoorIndex(0); setSelectedGate(null); }}
                className={cn("min-h-9 shrink-0 whitespace-nowrap rounded-full px-4 font-mono text-[9px] font-bold uppercase tracking-[0.13em]", floorId === floor.id ? "bg-[#F5F1E8] text-[#060708]" : "text-white/55")}
              >
                {floor.label}
              </button>
            ))}
          </nav>
          <span className="ml-auto inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/52"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#C4F24E]" />Live view</span>
          <TopButton onClick={refresh}><RefreshCw className={cn("h-3 w-3", !["idle", "failed"].includes(refreshState) && "animate-spin")} />{refreshState === "idle" ? "Refresh" : refreshState === "failed" ? "Retry" : `${refreshState}…`}</TopButton>
          <span className="font-mono text-[8px] text-[#C4F24E]/65">{manifest.deploy.hash}</span>
          <TopButton onClick={() => setPanel(panel === "connections" ? null : "connections")}><Link2 className="h-3 w-3" />Connections</TopButton>
          <TopButton onClick={() => setPanel(panel === "weekly" ? null : "weekly")}>Weekly</TopButton>
          <TopButton onClick={openControls} danger={manifest.controlsBlocked}><Settings2 className="h-3 w-3" />Controls</TopButton>
          <span className="rounded-full border border-white/12 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-white/42">{architect.name} · Admin</span>
        </header>

        <section className="grid gap-2 px-4 sm:grid-cols-2 sm:px-7">
          {manifest.infra.map((item) => <InfraBanner key={item.id} item={item} metrics={manifest.serviceMetrics.filter((metric) => metric.serviceKey === item.id)} onClick={() => { setInfraDetail(item); if (item.id === "vercel" && !manifest.controlsBlocked) void loadOperations(); }} />)}
        </section>

        {panel ? (
          <section className="mx-4 mt-3 rounded-[14px] border border-[#C9A87C]/22 bg-[#08090A]/92 p-4 sm:mx-7">
            {panel === "connections" ? (
              <>
                <PanelHeader title="Connections — right account, right project" onClose={() => setPanel(null)} />
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {manifest.connections.map((item) => (
                    <article key={item.id} className={cn("rounded-[13px] border bg-black/22 p-4", item.status === "verified" ? "border-[#C4F24E]/24" : item.status === "mismatch" ? "border-[#FF9B9B]/35" : "border-[#D9B461]/30")}>
                      <div className="flex justify-between gap-2 font-mono text-[8px] uppercase tracking-[0.16em]"><span className="text-white/48">{item.id}</span><span className={item.status === "verified" ? "text-[#C4F24E]" : item.status === "mismatch" ? "text-[#FF9B9B]" : "text-[#D9B461]"}>{item.status}</span></div>
                      <p className="mt-3 text-sm font-semibold">{item.connectedAs}</p>
                      <p className="mt-1 break-all font-mono text-[9px] text-white/43">{item.projectId}</p>
                      <p className="mt-2 text-xs leading-5 text-white/42">{item.evidence}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : panel === "weekly" ? (
              <>
                <PanelHeader title="Weekly health report — live manifest period" onClose={() => setPanel(null)} />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(["week", "month"] as const).map((period) => <button key={period} type="button" onClick={() => setWeeklyPeriod(period)} className={cn("min-h-8 rounded-full border px-4 font-mono text-[8px] font-bold uppercase tracking-[0.14em]", weeklyPeriod === period ? "border-[#C4F24E]/34 bg-[#C4F24E]/9 text-[#C4F24E]" : "border-white/10 text-white/42")}>{period}</button>)}
                  <button type="button" onClick={copyWeeklyReport} className="ml-auto min-h-8 rounded-full border border-white/12 px-4 font-mono text-[8px] uppercase tracking-[0.14em] text-white/55">{weeklyCopied ? "Copied ✓" : "Copy report"}</button>
                  <button type="button" onClick={emailWeeklyReport} className="min-h-8 rounded-full border border-[#C9A87C]/28 px-4 font-mono text-[8px] uppercase tracking-[0.14em] text-[#C9A87C]">Email report</button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                  {manifest.floors.map((floor) => {
                    const open = floor.doors.filter((door) => door.status === "open").length;
                    return (
                      <button key={floor.id} type="button" onClick={() => { setFloorId(floor.id); setPanel(null); }} className="rounded-[13px] border border-white/[0.09] bg-black/24 p-4 text-left">
                        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/42">{floor.label}</span>
                        <strong className="mt-2 block font-serif text-3xl font-normal" style={{ color: floor.color }}>{Math.round((open / Math.max(1, floor.doors.length)) * 100)}%</strong>
                        <span className="mt-1 block text-xs text-white/38">{floor.doors.length - open} review</span>
                        {weeklyPeriod === "month" ? <span className="mt-2 block font-mono text-[8px] uppercase tracking-[0.12em] text-[#D9B461]">Prior-month delta not verified</span> : null}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 rounded-[13px] border border-white/[0.08] bg-black/22 p-4"><div className="flex flex-wrap items-center gap-3"><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#C9A87C]">Uptime — last 90 days</p><strong className="ml-auto font-serif text-xl font-normal">{manifest.uptime.length ? `${((manifest.uptime.filter((day) => day.status === "operational").length / manifest.uptime.length) * 100).toFixed(2)}%` : "Not verified"}</strong></div>{manifest.uptime.length ? <div className="mt-3 flex gap-1 overflow-x-auto">{manifest.uptime.map((day) => <button key={day.date} type="button" title={`${day.date} · ${day.status}${day.incidentReference ? ` · ${day.incidentReference}` : ""}`} className={cn("h-6 min-w-2 flex-1 rounded-[2px]", day.status === "operational" ? "bg-[#C4F24E]/75" : day.status === "outage" ? "bg-[#FF9B9B]" : "bg-[#D9B461]")} />)}</div> : <p className="mt-3 text-sm text-white/34">No uptime checks have been written by the health cron yet. The map will not infer green.</p>}</div>
                <div className="mt-3 flex flex-wrap gap-2">{manifest.floors.flatMap((floor) => floor.doors.map((door, index) => ({ floor, door, index })).filter(({ door }) => door.status !== "open")).slice(0, 8).map(({ floor, door, index }) => <button key={door.code} type="button" onClick={() => { chooseDoor(floor.id, index); setPanel(null); }} className="rounded-full border border-[#D9B461]/25 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-[#E7CD8A]">Fix next · {door.code}</button>)}</div>
              </>
            ) : (
              <>
                <PanelHeader title="Control room — act on the system from here" onClose={() => setPanel(null)} />
                {manifest.controlsBlocked ? <div className="mt-3 flex gap-3 rounded-[13px] border border-[#FF9B9B]/30 bg-[#FF9B9B]/6 p-4 text-sm text-[#FFB7B7]"><LockKeyhole className="h-4 w-4 shrink-0" /><div><p className="font-semibold">Control writes are locked.</p><p className="mt-1 text-xs leading-5 text-white/55">{manifest.controlBlockReason}</p></div></div> : null}
                {controlMessage ? <p role="status" className="mt-3 rounded-[11px] border border-white/[0.09] bg-black/25 px-3 py-2 font-mono text-[9px] text-[#E7CD8A]">{controlMessage}</p> : null}
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {(controlSnapshot?.controls ?? [
                    { control_key: "maintenance", label: "Maintenance mode", active: false, reason: null, version: 1, changed_by: null, changed_at: "" },
                    { control_key: "bookings", label: "Pause new bookings", active: false, reason: null, version: 1, changed_by: null, changed_at: "" },
                    { control_key: "kiosks", label: "Disable all kiosks", active: false, reason: null, version: 1, changed_by: null, changed_at: "" },
                    { control_key: "payouts", label: "Freeze payouts", active: false, reason: null, version: 1, changed_by: null, changed_at: "" },
                    { control_key: "hive_ai", label: "Pause Hive AI", active: false, reason: null, version: 1, changed_by: null, changed_at: "" }
                  ]).map((control) => (
                    <button
                      key={control.control_key}
                      type="button"
                      disabled={manifest.controlsBlocked || controlBusy || !controlSnapshot}
                      onClick={() => chooseControl({ action: "system_control", key: control.control_key, label: control.label, current: control.active, version: control.version })}
                      className={cn("min-h-20 rounded-[13px] border bg-black/24 p-3 text-left transition", control.active ? "border-[#FF9B9B]/35" : "border-[#C4F24E]/22", (manifest.controlsBlocked || !controlSnapshot) && "opacity-55")}
                    >
                      <span className="text-xs font-semibold">{control.label}</span>
                      <span className={cn("mt-2 block font-mono text-[8px] uppercase tracking-[0.14em]", control.active ? "text-[#FF9B9B]" : "text-[#C4F24E]")}>{control.active ? "Active" : "Normal"}</span>
                      <span className="mt-1 block font-mono text-[8px] text-white/30">{manifest.controlsBlocked ? "Connection lock" : `version ${control.version}`}</span>
                    </button>
                  ))}
                </div>
                {controlSnapshot?.featureFlags.length ? <div className="mt-4"><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#C9A87C]">Feature gates</p><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{controlSnapshot.featureFlags.map((flag) => <button key={flag.gate_key} type="button" disabled={manifest.controlsBlocked || controlBusy} onClick={() => chooseControl({ action: "feature_flag", key: flag.gate_key, label: flag.gate_key, current: flag.enabled })} className="rounded-[11px] border border-white/[0.08] bg-black/20 p-3 text-left"><span className="block break-all font-mono text-[9px] text-white/65">{flag.gate_key}</span><span className={cn("mt-2 block font-mono text-[8px] uppercase tracking-[0.13em]", flag.enabled ? "text-[#C4F24E]" : "text-[#D9B461]")}>{flag.enabled ? "Open" : flag.reason}</span></button>)}</div></div> : null}
                {controlSelection ? (
                  <div className="mt-4 rounded-[13px] border border-[#D9B461]/28 bg-[#D9B461]/6 p-4">
                    <div className="flex flex-wrap items-center gap-3"><div><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#D9B461]">Two-step confirmation</p><p className="mt-1 text-sm font-semibold">{controlSelection.current ? "Restore" : "Activate"} {controlSelection.label}</p></div><button type="button" onClick={() => setControlSelection(null)} className="ml-auto text-white/40"><X className="h-4 w-4" /></button></div>
                    <label className="mt-3 block"><span className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/38">Required operational reason</span><input value={controlReason} onChange={(event) => { setControlReason(event.target.value); setControlArmedAt(null); }} placeholder="Incident, change, or rollout reason…" className="mt-2 min-h-10 w-full rounded-[10px] border border-white/12 bg-black/30 px-3 text-sm outline-none focus:border-[#D9B461]/50" /></label>
                    <button type="button" disabled={controlBusy || manifest.controlsBlocked} onClick={executeControl} className="mt-3 min-h-10 rounded-full border border-[#FF9B9B]/35 px-4 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-[#FFB7B7] disabled:opacity-45">{controlBusy ? "Writing…" : controlArmedAt ? "Confirm now" : "Arm control"}</button>
                  </div>
                ) : null}
                <div className="mt-5 border-t border-white/[0.08] pt-4">
                  <div className="flex flex-wrap items-center gap-3"><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#C9A87C]">Jobs board</p><span className="font-mono text-[8px] text-white/28">last-run truth · manual runs audited</span><button type="button" onClick={loadOperations} disabled={operationBusy || manifest.controlsBlocked} className="ml-auto min-h-8 rounded-full border border-white/10 px-3 font-mono text-[8px] uppercase tracking-[0.12em] text-white/45">{operationBusy ? "Loading…" : "Refresh operations"}</button></div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    {[
                      { target: "fintech", label: "Payout + rent reconcile", schedule: "Existing scheduler", executable: true },
                      { target: "hive_digest", label: "Hive digest", schedule: "Sunday", executable: false },
                      { target: "weekly_report", label: "Weekly report email", schedule: "Mon 8 AM", executable: false },
                      { target: "monthly_report", label: "Monthly report email", schedule: "1st · 8 AM", executable: false }
                    ].map((job) => {
                      const latest = operationsSnapshot?.jobs?.find((row) => String(row.job_name ?? "") === job.target);
                      return <article key={job.target} className="rounded-[12px] border border-white/[0.08] bg-black/22 p-3"><div className="flex items-start gap-2"><div><p className="text-xs font-semibold">{job.label}</p><p className="mt-1 font-mono text-[8px] text-white/30">{job.schedule}</p></div><span className={cn("ml-auto h-1.5 w-1.5 rounded-full", latest && String(latest.status) === "completed" ? "bg-[#C4F24E]" : "bg-[#D9B461]")} /></div><p className="mt-3 text-[10px] text-white/42">{latest ? `${String(latest.status)} · ${formatTime(String(latest.started_at ?? ""))}` : "No real run returned."}</p><button type="button" disabled={!job.executable || operationBusy || manifest.controlsBlocked} onClick={() => chooseOperation({ action: "job_run", target: job.target, label: `Run ${job.label}`, payload: {}, executable: job.executable })} className="mt-3 min-h-8 rounded-full border border-white/12 px-3 font-mono text-[8px] uppercase tracking-[0.12em] text-white/50 disabled:opacity-35">Run now</button></article>;
                    })}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-[13px] border border-white/[0.08] bg-black/20 p-4">
                    <div className="flex items-center gap-3"><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#C9A87C]">Webhook replay</p><span className={cn("ml-auto rounded-full border px-2 py-1 font-mono text-[8px]", operationsSnapshot?.failedWebhooks?.length ? "border-[#FF9B9B]/30 text-[#FFB7B7]" : "border-[#C4F24E]/25 text-[#C4F24E]")}>{operationsSnapshot?.failedWebhooks?.length ?? 0} failed</span></div><p className="mt-3 text-xs leading-5 text-white/42">{operationsSnapshot?.capabilities?.webhook_replay?.evidence ?? "Loading provider evidence…"}</p><button type="button" disabled className="mt-3 min-h-8 rounded-full border border-white/10 px-3 font-mono text-[8px] uppercase tracking-[0.12em] text-white/35">Replay blocked</button>
                  </div>
                  <div className="rounded-[13px] border border-white/[0.08] bg-black/20 p-4">
                    <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#C9A87C]">Broadcast</p>
                    <div className="mt-3 flex gap-2"><select aria-label="Broadcast audience" value={broadcastAudience} onChange={(event) => setBroadcastAudience(event.target.value)} className="min-h-10 rounded-[10px] border border-white/12 bg-[#08090A] px-3 text-xs text-white/60">{["all", "clients", "barbers", "owners", "kiosks"].map((audience) => <option key={audience} value={audience}>{audience}</option>)}</select><input value={broadcastMessage} onChange={(event) => setBroadcastMessage(event.target.value)} placeholder="Operational system notice…" className="min-h-10 min-w-0 flex-1 rounded-[10px] border border-white/12 bg-black/25 px-3 text-xs outline-none" /></div>
                    <button type="button" disabled={!broadcastMessage.trim() || operationBusy || manifest.controlsBlocked} onClick={() => chooseOperation({ action: "broadcast", target: broadcastAudience, label: `Broadcast to ${broadcastAudience}`, payload: { audience: broadcastAudience, message: broadcastMessage }, executable: true })} className="mt-3 min-h-8 rounded-full border border-[#C9A87C]/28 px-3 font-mono text-[8px] uppercase tracking-[0.12em] text-[#C9A87C] disabled:opacity-35">Prepare broadcast</button>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-[13px] border border-white/[0.08] bg-black/20 p-4">
                    <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#C9A87C]">Device manager</p>
                    <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">{operationsSnapshot?.devices?.length ? operationsSnapshot.devices.map((device) => <div key={String(device.id)} className="flex items-center gap-3 rounded-[10px] border border-white/[0.07] p-3"><span className={cn("h-1.5 w-1.5 rounded-full", String(device.health_status) === "healthy" ? "bg-[#C4F24E]" : "bg-[#FF9B9B]")} /><div><p className="text-xs font-semibold">{String(device.device_label ?? device.target_reference ?? "Kiosk device")}</p><p className="mt-1 font-mono text-[8px] text-white/30">{String(device.health_status ?? "unverified")} · {formatTime(String(device.last_health_check_at ?? ""))}</p></div><button type="button" disabled={operationBusy || manifest.controlsBlocked} onClick={() => chooseOperation({ action: "device_restart", target: String(device.id), label: `Restart ${String(device.device_label ?? "device")}`, payload: { deviceId: device.id }, executable: true })} className="ml-auto min-h-8 rounded-full border border-white/10 px-3 font-mono text-[8px] uppercase tracking-[0.12em] text-white/45">Restart</button></div>) : <p className="text-xs text-white/34">No paired kiosk/TV device records returned.</p>}</div>
                  </div>
                  <div className="rounded-[13px] border border-white/[0.08] bg-black/20 p-4">
                    <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#C9A87C]">User control</p><p className="mt-3 text-xs leading-5 text-white/42">Use the canonical Architect Accounts lookup for username, email, or phone. Account locks are pending-review controls and never change money records.</p><Link href="/architect/accounts" className="mt-3 inline-flex min-h-8 items-center rounded-full border border-[#C9A87C]/28 px-3 font-mono text-[8px] uppercase tracking-[0.12em] text-[#C9A87C]">Open account lookup</Link><span className="ml-2 inline-flex min-h-8 items-center rounded-full border border-white/10 px-3 font-mono text-[8px] uppercase tracking-[0.12em] text-white/30">Session revoke executor blocked</span>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-[13px] border border-white/[0.08] bg-black/20 p-4">
                    <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#C9A87C]">Maintenance scheduler</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="font-mono text-[8px] text-white/34">Starts<input type="datetime-local" value={maintenanceStartsAt} onChange={(event) => setMaintenanceStartsAt(event.target.value)} className="mt-1 min-h-10 w-full rounded-[10px] border border-white/12 bg-transparent px-3 text-xs text-white/60 [color-scheme:dark]" /></label><label className="font-mono text-[8px] text-white/34">Ends<input type="datetime-local" value={maintenanceEndsAt} onChange={(event) => setMaintenanceEndsAt(event.target.value)} className="mt-1 min-h-10 w-full rounded-[10px] border border-white/12 bg-transparent px-3 text-xs text-white/60 [color-scheme:dark]" /></label></div><button type="button" disabled={!maintenanceStartsAt || !maintenanceEndsAt || operationBusy || manifest.controlsBlocked} onClick={() => chooseOperation({ action: "maintenance_schedule", target: "new-window", label: "Schedule maintenance window", payload: { startsAt: new Date(maintenanceStartsAt).toISOString(), endsAt: new Date(maintenanceEndsAt).toISOString() }, executable: true })} className="mt-3 min-h-8 rounded-full border border-[#C9A87C]/28 px-3 font-mono text-[8px] uppercase tracking-[0.12em] text-[#C9A87C] disabled:opacity-35">Schedule window</button><div className="mt-3 space-y-2">{operationsSnapshot?.maintenance?.filter((window) => String(window.status) === "scheduled").map((window) => <div key={String(window.id)} className="flex items-center gap-3 rounded-[10px] border border-white/[0.07] p-3 text-[10px] text-white/45"><span>{formatTime(String(window.starts_at))} → {formatTime(String(window.ends_at))}</span><button type="button" onClick={() => chooseOperation({ action: "maintenance_cancel", target: String(window.id), label: "Cancel maintenance window", payload: {}, executable: true })} className="ml-auto font-mono text-[8px] uppercase text-[#FFB7B7]">Cancel</button></div>)}</div>
                  </div>
                  <div className="rounded-[13px] border border-white/[0.08] bg-black/20 p-4">
                    <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#C9A87C]">Data & edge</p><div className="mt-3 grid grid-cols-2 gap-2">{[
                      { action: "backup", target: "database", label: "Backup now" },
                      { action: "restore_drill", target: "staging", label: "Restore drill" },
                      { action: "cdn_purge", target: "production", label: "Purge CDN" },
                      { action: "rate_limit", target: "strict", label: "Strict rate limit" }
                    ].map((item) => { const capability = operationsSnapshot?.capabilities?.[item.action]; return <button key={item.action} type="button" disabled={!capability?.executable || operationBusy || manifest.controlsBlocked} title={capability?.evidence} onClick={() => chooseOperation({ ...item, payload: {}, executable: Boolean(capability?.executable) })} className="min-h-14 rounded-[11px] border border-white/[0.08] p-3 text-left disabled:opacity-35"><span className="text-xs font-semibold">{item.label}</span><span className={cn("mt-2 block font-mono text-[8px] uppercase tracking-[0.12em]", capability?.executable ? "text-[#C4F24E]" : "text-[#D9B461]")}>{capability?.executable ? "Ready" : "Needs executor"}</span></button>; })}</div>
                  </div>
                </div>
                {operationMessage ? <p role="status" className="mt-3 rounded-[11px] border border-white/[0.09] bg-black/25 px-3 py-2 font-mono text-[9px] text-[#E7CD8A]">{operationMessage}</p> : null}
                {operationSelection ? <div className="mt-3 rounded-[13px] border border-[#FF9B9B]/28 bg-[#FF9B9B]/6 p-4"><div className="flex items-center gap-3"><div><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#FFB7B7]">Two-step operation</p><p className="mt-1 text-sm font-semibold">{operationSelection.label}</p></div><button type="button" onClick={() => setOperationSelection(null)} className="ml-auto text-white/40"><X className="h-4 w-4" /></button></div><label className="mt-3 block"><span className="font-mono text-[8px] uppercase tracking-[0.14em] text-white/38">Required operational reason</span><input value={operationReason} onChange={(event) => { setOperationReason(event.target.value); setOperationArmedAt(null); }} placeholder="Incident, change, or rollout reason…" className="mt-2 min-h-10 w-full rounded-[10px] border border-white/12 bg-black/30 px-3 text-sm outline-none focus:border-[#FF9B9B]/50" /></label><button type="button" disabled={!operationSelection.executable || operationBusy || manifest.controlsBlocked} onClick={executeOperation} className="mt-3 min-h-10 rounded-full border border-[#FF9B9B]/35 px-4 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-[#FFB7B7] disabled:opacity-35">{operationBusy ? "Executing…" : operationArmedAt ? "Confirm now" : "Arm operation"}</button></div> : null}
                {controlSnapshot?.audit.length ? <div className="mt-4"><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#C9A87C]">Append-only control audit</p><div className="mt-2 max-h-44 overflow-y-auto rounded-[12px] border border-white/[0.08]">{controlSnapshot.audit.map((row) => <div key={row.id} className="grid gap-1 border-b border-white/[0.06] p-3 text-[10px] text-white/48 sm:grid-cols-[130px_1fr_2fr]"><span className="font-mono text-[8px]">{formatTime(row.occurred_at)}</span><span className="font-semibold text-white/67">{row.target_key}</span><span>{row.reason}</span></div>)}</div></div> : null}
                {operationsSnapshot?.commands?.length ? <div className="mt-4"><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#C9A87C]">Operation history</p><div className="mt-2 max-h-44 overflow-y-auto rounded-[12px] border border-white/[0.08]">{operationsSnapshot.commands.map((row) => <div key={row.id} className="grid gap-1 border-b border-white/[0.06] p-3 text-[10px] text-white/48 sm:grid-cols-[130px_1fr_90px_2fr]"><span className="font-mono text-[8px]">{formatTime(row.requested_at)}</span><span className="font-semibold text-white/67">{row.command_type} · {row.target_key}</span><span className={row.status === "failed" ? "text-[#FFB7B7]" : row.status === "succeeded" ? "text-[#C4F24E]" : "text-[#D9B461]"}>{row.status}</span><span>{row.error_message ?? row.reason}</span></div>)}</div></div> : null}
              </>
            )}
          </section>
        ) : null}

        <section className="grid gap-3 px-4 py-3 sm:px-7 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
          <aside className="rounded-[18px] border border-white/[0.08] bg-[#08090A]/70 p-3">
            <label className="flex min-h-10 items-center gap-2 rounded-full border border-white/12 bg-black/25 px-3"><Search className="h-3.5 w-3.5 text-white/35" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search doors…" className="min-w-0 flex-1 bg-transparent font-mono text-[10px] outline-none placeholder:text-white/28" /></label>
            <div className="mt-3 flex max-h-[520px] flex-col gap-2 overflow-y-auto">
              {visibleDoors.map(({ floor, door, index }) => (
                <button key={`${floor.id}:${door.code}`} type="button" onClick={() => chooseDoor(floor.id, index)} className={cn("rounded-[13px] border p-3 text-left", selectedDoor.code === door.code && floorId !== "all" ? "border-white/25 bg-white/[0.055]" : "border-white/[0.07] bg-black/20")}>
                  <div className="flex items-center gap-2"><span className="font-mono text-[8px] font-bold" style={{ color: floor.color }}>{door.code}</span><span className={cn("ml-auto h-1.5 w-1.5 rounded-full", door.status === "open" ? "bg-[#C4F24E]" : door.status === "failed" ? "bg-[#FF9B9B]" : "bg-[#D9B461]")} /></div>
                  <p className="mt-2 text-xs font-semibold">{door.title}</p><p className="mt-1 text-[10px] leading-4 text-white/36">{floor.label} · {door.description}</p>
                </button>
              ))}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">{(["live", "expected", "failure", "loop"] as TraceMode[]).map((mode) => <button key={mode} type="button" onClick={() => setTraceMode(mode)} className={cn("min-h-8 rounded-full border px-3 font-mono text-[8px] uppercase tracking-[0.14em]", traceMode === mode ? "border-[#C4F24E]/35 bg-[#C4F24E]/10 text-[#C4F24E]" : "border-white/10 text-white/38")}>{mode}</button>)}<button type="button" onClick={replayRoute} className="ml-auto inline-flex min-h-8 items-center gap-2 rounded-full border border-[#C9A87C]/26 px-3 font-mono text-[8px] uppercase tracking-[0.14em] text-[#C9A87C]"><Play className="h-3 w-3" />{replaying ? "Replaying…" : "Replay route"}</button></div>
            <RouteMap door={selectedDoor} color={selectedFloor.color} traceMode={traceMode} replayToken={replayToken} selectedGate={selectedGate} onSelectGate={setSelectedGate} />
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[14px] border border-white/[0.08] bg-black/22 p-3"><span className="font-mono text-[8px] uppercase tracking-[0.16em] text-white/35">Binding</span><code className="break-all font-mono text-[9px] text-[#C9A87C]">{selectedDoor.binding}</code><button type="button" onClick={copyReport} className="ml-auto inline-flex min-h-8 items-center gap-2 rounded-full border border-[#C4F24E]/28 px-3 font-mono text-[8px] uppercase tracking-[0.13em] text-[#C4F24E]"><Clipboard className="h-3 w-3" />{copied ? "Copied" : floorId === "all" ? "Copy city report" : "Copy report"}</button></div>
          </div>

          <aside className="rounded-[18px] border border-white/[0.08] bg-[#08090A]/70 p-4">
            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#C9A87C]">Node inspector</p>
            {selectedGateDetail ? <><p className="mt-4 font-mono text-[9px] text-white/38">{selectedGateDetail.id}</p><h3 className="mt-2 text-lg font-semibold">{selectedGateDetail.label}</h3><span className={cn("mt-3 inline-flex rounded-full border px-3 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.14em]", STATUS_STYLE[selectedGateDetail.status])}>{statusLabel(selectedGateDetail.status)}</span><p className="mt-4 text-xs leading-5 text-white/52">{selectedGateDetail.evidence}</p></> : <p className="mt-4 text-sm leading-6 text-white/42">Select a route checkpoint to inspect its production evidence.</p>}
            <div className="mt-6 border-t border-white/[0.08] pt-4"><p className="font-mono text-[8px] uppercase tracking-[0.18em] text-white/34">Outcome</p><p className="mt-2 text-sm font-semibold">{selectedDoor.exit.outcome}</p><p className="mt-2 text-xs leading-5 text-white/42">{selectedFloor.loop}</p></div>
          </aside>
        </section>

        <section className="mx-4 mb-3 rounded-[18px] border border-white/[0.08] bg-[#08090A]/72 p-4 sm:mx-7" data-testid="architect-system-ledger">
          <div className="flex flex-wrap items-center gap-2">
            <div><p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#C9A87C]">System ledger</p><p className="mt-1 text-xs text-white/40">{ledgerRows.length} records · current filtered view</p></div>
            <label className="ml-auto flex min-h-9 min-w-[220px] items-center gap-2 rounded-full border border-white/12 px-3"><Search className="h-3 w-3 text-white/35" /><input value={ledgerSearch} onChange={(event) => setLedgerSearch(event.target.value)} placeholder="Search the ledger…" className="min-w-0 flex-1 bg-transparent font-mono text-[9px] outline-none placeholder:text-white/28" /></label>
            {(["all", "30m", "1h", "2h"] as const).map((range) => <button key={range} type="button" onClick={() => setTimeRange(range)} className={cn("min-h-8 rounded-full border px-3 font-mono text-[8px] uppercase tracking-[0.12em]", timeRange === range ? "border-[#C4F24E]/30 text-[#C4F24E]" : "border-white/10 text-white/36")}>{range}</button>)}
            <input type="date" value={date} onChange={(event) => changeLedgerDate(event.target.value)} className="min-h-8 rounded-full border border-white/10 bg-transparent px-3 font-mono text-[9px] text-white/55 [color-scheme:dark]" />
            <button type="button" onClick={() => downloadCsv(ledgerRows, floorId, date)} className="inline-flex min-h-8 items-center gap-2 rounded-full border border-white/12 px-3 font-mono text-[8px] uppercase tracking-[0.12em] text-white/50"><Download className="h-3 w-3" />Export CSV</button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead><tr className="border-b border-white/[0.08] font-mono text-[8px] uppercase tracking-[0.14em] text-white/30">{["Time", "Name / reference", "Contact", "Identity", "Door used", "Money", "Status"].map((label) => <th key={label} className="px-2 py-3 font-normal">{label}</th>)}</tr></thead>
              <tbody>{ledgerRows.map((row) => <tr key={row.id} onClick={() => { setLedgerSelection(row); if (row.doorCode) { const match = manifest.floors.flatMap((floor) => floor.doors.map((door, index) => ({ floor, door, index }))).find((item) => item.door.code === row.doorCode); if (match) chooseDoor(match.floor.id, match.index); } }} className="cursor-pointer border-b border-white/[0.055] text-[11px] text-white/52 hover:bg-white/[0.025]"><td className="whitespace-nowrap px-2 py-3 font-mono text-[9px]">{formatTime(row.occurredAt)}</td><td className="px-2 py-3 font-semibold text-white/75">{row.primary}</td><td className="px-2 py-3">{row.contact}</td><td className="px-2 py-3">{row.identity}</td><td className="px-2 py-3 font-mono text-[9px] text-[#C9A87C]">{row.doorCode ? `${row.doorCode} · ${row.doorLabel}` : "Not routable yet"}</td><td className="px-2 py-3">{row.money}</td><td className="px-2 py-3">{row.status}</td></tr>)}</tbody>
            </table>
            {!ledgerRows.length ? <div className="py-12 text-center text-sm text-white/36">No real records match this floor, date, and time range.</div> : null}
          </div>
          {ledgerSelection ? <div className="mt-3 flex items-center gap-3 rounded-[13px] border border-white/[0.08] bg-black/24 p-3 text-xs text-white/48"><span className="font-semibold text-white">{ledgerSelection.primary}</span><span>{ledgerSelection.doorCode ? `${ledgerSelection.doorCode} · ${ledgerSelection.doorLabel}` : "Not routable yet"}</span><button type="button" onClick={() => setLedgerSelection(null)} className="ml-auto"><X className="h-4 w-4" /></button></div> : null}
        </section>

        <section className="mx-4 mb-3 grid gap-3 sm:mx-7 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-[18px] border border-white/[0.08] bg-[#08090A]/72 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">Alert history</p><div className="mt-4 flex min-h-20 gap-2 overflow-x-auto border-t border-white/[0.08] pt-4">{manifest.incidents.length ? manifest.incidents.map((incident) => <button key={incident.id} type="button" className={cn("min-w-[160px] rounded-[12px] border p-3 text-left", incident.severity === "P0" ? "border-[#FF9B9B]/35" : "border-[#D9B461]/25")}><span className="font-mono text-[8px] text-white/32">{incident.severity} · {formatTime(incident.occurredAt)}</span><span className="mt-2 block text-[11px] leading-4 text-white/60">{incident.message}</span></button>) : <span className="text-sm text-white/34">No open incidents returned by Mission Control.</span>}</div></div>
          <div className="rounded-[18px] border border-white/[0.08] bg-[#08090A]/72 p-4"><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">Live incident feed</p><div className="mt-4 space-y-3">{manifest.incidents.slice(0, 5).map((incident) => <div key={incident.id} className="flex gap-3 text-xs"><span className="font-mono text-[8px] text-[#D9B461]">{incident.severity}</span><span className="text-white/52">{incident.message}</span></div>)}{!manifest.incidents.length ? <p className="text-sm text-white/34">No incident evidence in the current manifest.</p> : null}</div></div>
        </section>

        <footer className="flex flex-wrap items-center gap-3 border-t border-white/[0.07] px-4 py-4 font-mono text-[8px] uppercase tracking-[0.13em] text-white/32 sm:px-7"><ShieldCheck className="h-3.5 w-3.5 text-[#C4F24E]" />Manifest {manifest.schemaVersion} · deploy {manifest.deploy.hash} · verified {formatTime(manifest.deploy.verifiedAt)}<Link href="/atlas" className="ml-auto rounded-full border border-[#C9A87C]/25 px-3 py-2 text-[#C9A87C]">System Atlas · 21</Link><span>{architect.email}</span></footer>
      </div>

      {infraDetail ? <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/62 p-4 sm:p-7" role="dialog" aria-modal="true" aria-label={`${infraDetail.label} detail`}><article className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-[20px] border border-white/12 bg-[#090A0B] p-5"><div className="flex justify-between gap-4"><div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#C9A87C]">{infraDetail.label}</p><h2 className="mt-2 text-xl font-semibold">{infraDetail.headline}</h2></div><button type="button" onClick={() => setInfraDetail(null)}><X className="h-4 w-4" /></button></div><p className="mt-3 text-sm leading-6 text-white/48">{infraDetail.detail}</p><div className="mt-5 space-y-2">{infraDetail.metrics.map((metric) => <div key={metric.label} className="flex items-start gap-3 rounded-[12px] border border-white/[0.08] p-3 text-xs">{metric.status === "open" ? <Check className="h-3.5 w-3.5 text-[#C4F24E]" /> : <AlertTriangle className="h-3.5 w-3.5 text-[#D9B461]" />}<span className="text-white/45">{metric.label}</span><span className="ml-auto max-w-[62%] text-right text-white/70">{metric.value}</span></div>)}</div>{infraDetail.id === "vercel" ? <div className="mt-5 rounded-[12px] border border-[#FF9B9B]/24 bg-[#FF9B9B]/5 p-4"><p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#FFB7B7]">Production rollback</p><p className="mt-2 text-xs leading-5 text-white/43">{operationsSnapshot?.capabilities?.vercel_rollback?.evidence ?? "Loading prior production deployments…"}</p><select aria-label="Rollback deployment" value={rollbackTarget} onChange={(event) => setRollbackTarget(event.target.value)} className="mt-3 min-h-10 w-full rounded-[10px] border border-white/12 bg-[#08090A] px-3 font-mono text-[9px] text-white/62"><option value="">Select prior READY production deployment</option>{operationsSnapshot?.rollbackCandidates?.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.commit.slice(0, 12)} · {candidate.url}</option>)}</select><button type="button" disabled={!rollbackTarget || !operationsSnapshot?.capabilities?.vercel_rollback?.executable || manifest.controlsBlocked} onClick={() => { const candidate = operationsSnapshot?.rollbackCandidates?.find((item) => item.id === rollbackTarget); if (!candidate) return; chooseOperation({ action: "vercel_rollback", target: candidate.id, label: `Rollback production to ${candidate.commit.slice(0, 12)}`, payload: { deploymentUrl: candidate.url }, executable: true }); setInfraDetail(null); setPanel("controls"); }} className="mt-3 min-h-9 rounded-full border border-[#FF9B9B]/34 px-4 font-mono text-[8px] font-bold uppercase tracking-[0.13em] text-[#FFB7B7] disabled:opacity-35">Prepare two-click rollback</button></div> : null}<div className="mt-5 rounded-[12px] border border-[#D9B461]/24 bg-[#D9B461]/6 p-4 text-xs leading-5 text-[#E7CD8A]">{infraDetail.runbook}</div></article></div> : null}
    </main>
  );
}
