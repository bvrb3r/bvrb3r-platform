"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clipboard, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buildMissionControlFoundation } from "@/lib/architect/mission-control/foundation";
import type {
  ArchitectIncident,
  MissionControlFoundation,
  MissionControlSnapshot,
  MissionDepartmentLane,
  MissionEvidenceCard,
  MissionControlStatus,
  MissionLaneId
} from "@/lib/architect/mission-control/types";
import { cn } from "@/lib/utils";

type ApiError = {
  ok: false;
  error?: string;
  safeMessage?: string;
  stage?: string;
};

async function readJson<T>(response: Response) {
  const body = (await response.json().catch(() => ({}))) as T | ApiError;
  if (!response.ok || (typeof body === "object" && body && "ok" in body && body.ok === false)) {
    const errorBody = body as ApiError;
    throw new Error(errorBody.safeMessage ?? errorBody.error ?? `Request failed with status ${response.status}`);
  }
  return body as T;
}

function statusClass(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  if (["healthy", "pass", "completed", "eligible", "ready"].some((token) => normalized.includes(token))) {
    return "border-[#7CFF00]/25 bg-[#7CFF00]/12 text-[#d7ffab]";
  }
  if (["warning", "review", "unknown"].some((token) => normalized.includes(token))) {
    return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  }
  if (["broken", "critical", "fail", "missing"].some((token) => normalized.includes(token))) {
    return "border-rose-400/25 bg-rose-400/10 text-rose-100";
  }
  return "border-white/10 bg-white/[0.035] text-white/64";
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", statusClass(status))}>
      {status}
    </span>
  );
}

function severityRank(incident: ArchitectIncident) {
  if (incident.severity === "critical") return 0;
  if (incident.severity === "broken") return 1;
  return 2;
}

function EvidenceCard({ card }: { card: MissionEvidenceCard }) {
  return (
    <article className="rounded-lg border border-white/10 bg-black/24 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">{card.department} / {card.workflow}</p>
          <h3 className="mt-2 text-base font-semibold text-white">{card.label}</h3>
        </div>
        <StatusPill status={card.status} />
      </div>
      {card.metricValue ? (
        <p className="mt-4 text-3xl font-semibold tracking-tight text-white">{card.metricValue}</p>
      ) : null}
      <p className="mt-3 text-sm leading-6 text-white/68">{card.summary}</p>
      <ul className="mt-3 space-y-1 text-xs leading-5 text-white/48">
        {card.evidence.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}

type CompactCeoCard = {
  id: string;
  label: string;
  status: MissionControlStatus;
  value: string;
  summary: string;
  href?: Route;
  actionLabel?: string;
};

function findCeoCard(foundation: MissionControlFoundation, id: string) {
  return foundation.ceoCommandCenter.find((card) => card.id === id);
}

function statusRank(status: MissionControlStatus) {
  if (status === "Failed") return 3;
  if (status === "Warning") return 2;
  if (status === "Needs Review") return 1;
  return 0;
}

function worstStatus(...statuses: Array<MissionControlStatus | undefined>): MissionControlStatus {
  return statuses.reduce<MissionControlStatus>((worst, status) => {
    if (!status) return worst;
    return statusRank(status) > statusRank(worst) ? status : worst;
  }, "Pass");
}

function metricValue(card: MissionEvidenceCard | undefined) {
  return card?.metricValue ?? "Not connected";
}

function metricSummary(card: MissionEvidenceCard | undefined) {
  return card?.summary ?? "Missing data remains Needs Review.";
}

function compactCard(input: {
  id: string;
  label: string;
  status?: MissionControlStatus;
  value?: string;
  summary?: string;
  href?: Route;
  actionLabel?: string;
}): CompactCeoCard {
  return {
    id: input.id,
    label: input.label,
    status: input.status ?? "Needs Review",
    value: input.value ?? "Not connected",
    summary: input.summary ?? "Missing data remains Needs Review.",
    href: input.href,
    actionLabel: input.actionLabel
  };
}

function buildCompactCeoCards(foundation: MissionControlFoundation, snapshot: MissionControlSnapshot, selectedIncident: ArchitectIncident | null): CompactCeoCard[] {
  const platform = findCeoCard(foundation, "overall-platform-status");
  const money = findCeoCard(foundation, "ceo-platform-fees");
  const totalUsers = findCeoCard(foundation, "ceo-total-users");
  const clients = findCeoCard(foundation, "ceo-clients-total");
  const barbers = findCeoCard(foundation, "ceo-barbers-total");
  const owners = findCeoCard(foundation, "ceo-shop-owners-total");
  const bookings = findCeoCard(foundation, "ceo-total-bookings");
  const todayBookings = findCeoCard(foundation, "ceo-todays-bookings");
  const payments = findCeoCard(foundation, "ceo-payments-captured");
  const routing = findCeoCard(foundation, "ceo-payment-routing-health");
  const payout = findCeoCard(foundation, "ceo-payout-readiness-health");
  const culture = findCeoCard(foundation, "ceo-culture-health");
  const shops = findCeoCard(foundation, "ceo-active-shops");
  const activeBarbers = findCeoCard(foundation, "ceo-active-barbers");
  const incidents = findCeoCard(foundation, "ceo-critical-incidents");
  const deployment = findCeoCard(foundation, "ceo-regression-deployment-health");
  const sourceVault = findCeoCard(foundation, "source-vault-status");
  const hiveAi = findCeoCard(foundation, "agent-status");
  const unsafeActions = foundation.actionRegistry.filter((action) => action.riskClass === "Unsafe / blocked");
  const unsafeBlocked = unsafeActions.length > 0 && unsafeActions.every((action) => !action.allowed);
  const packetCount = Object.keys(snapshot.packets ?? {}).length;
  const selectedPacket = selectedIncident ? snapshot.packets[selectedIncident.id]?.codexPacket : null;

  return [
    compactCard({ id: "platform-health", label: "Platform Health", status: platform?.status, value: platform?.status, summary: metricSummary(platform), href: "/architect/technology" }),
    compactCard({ id: "money-revenue", label: "Money / App Revenue", status: money?.status, value: metricValue(money), summary: metricSummary(money), href: "/architect/finance" }),
    compactCard({ id: "total-users", label: "Total Users", status: totalUsers?.status, value: metricValue(totalUsers), summary: metricSummary(totalUsers), href: "/architect/product" }),
    compactCard({ id: "clients", label: "Clients", status: clients?.status, value: metricValue(clients), summary: metricSummary(clients), href: "/architect/product" }),
    compactCard({ id: "barbers", label: "Barbers", status: barbers?.status, value: metricValue(barbers), summary: metricSummary(barbers), href: "/architect/operations" }),
    compactCard({ id: "shop-owners", label: "Shop Owners", status: owners?.status, value: metricValue(owners), summary: metricSummary(owners), href: "/architect/operations" }),
    compactCard({ id: "bookings", label: "Bookings", status: worstStatus(bookings?.status, todayBookings?.status), value: metricValue(bookings), summary: `Today: ${metricValue(todayBookings)}. ${metricSummary(bookings)}`, href: "/architect/operations" }),
    compactCard({ id: "payments", label: "Payments", status: payments?.status, value: metricValue(payments), summary: metricSummary(payments), href: "/architect/finance" }),
    compactCard({ id: "routing-payout", label: "Routing / Payout Readiness", status: worstStatus(routing?.status, payout?.status), value: `${metricValue(routing)} / ${metricValue(payout)}`, summary: "Payment routing and payout readiness stay separated from money mutation.", href: "/architect/finance" }),
    compactCard({ id: "culture", label: "Culture", status: culture?.status, value: metricValue(culture), summary: metricSummary(culture), href: "/architect/content-community" }),
    compactCard({ id: "active-supply", label: "Active Shops / Active Barbers", status: worstStatus(shops?.status, activeBarbers?.status), value: `${metricValue(shops)} / ${metricValue(activeBarbers)}`, summary: "Active supply is read from shop and barber evidence.", href: "/architect/operations" }),
    compactCard({ id: "critical-incidents", label: "Critical Incidents", status: incidents?.status, value: metricValue(incidents), summary: metricSummary(incidents), href: "/architect/technology" }),
    compactCard({ id: "deployment-regression", label: "Deployment / Regression", status: deployment?.status, value: metricValue(deployment), summary: metricSummary(deployment), href: "/architect/technology" }),
    compactCard({ id: "source-vault", label: "Source Vault", status: sourceVault?.status, value: `${foundation.sourceVault.length} registered`, summary: "Sources are registered, not ingested.", href: "/architect/technology" }),
    compactCard({ id: "action-registry", label: "Action Registry", status: unsafeBlocked ? "Pass" : "Failed", value: unsafeBlocked ? "Unsafe blocked" : "Review needed", summary: `${unsafeActions.length} unsafe action(s) blocked by registry.`, href: "/architect/security" }),
    compactCard({ id: "hive-ai", label: "Hive AI", status: hiveAi?.status, value: `${foundation.agentRegistry.length} agents`, summary: "Hive AI remains Level 0/1 only.", href: "/architect/technology" }),
    compactCard({ id: "codex-packets", label: "Codex Packets", status: selectedPacket ? "Pass" : "Needs Review", value: `${packetCount} packet(s)`, summary: selectedPacket ? "Codex packet is available for the selected incident." : "No active incident packet is selected.", href: "/architect/technology", actionLabel: selectedPacket ? "Copy Codex Packet" : undefined })
  ];
}

function CompactCeoCard({ card, onAction }: { card: CompactCeoCard; onAction?: () => void }) {
  return (
    <article className="flex min-h-[8.25rem] flex-col justify-between rounded-lg border border-white/10 bg-black/28 p-3">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">{card.label}</h3>
          <StatusPill status={card.status} />
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{card.value}</p>
        <p className="mt-1 text-xs leading-5 text-white/56">{card.summary}</p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {card.href ? (
          <Link href={card.href} className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#d7ffab] hover:text-white">
            Open lane
          </Link>
        ) : null}
        {card.actionLabel && onAction ? (
          <Button type="button" variant="secondary" onClick={onAction} className="min-h-8 px-3 text-[10px]">
            <Clipboard className="h-3.5 w-3.5" />
            {card.actionLabel}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function CeoCommandCenter({ foundation, snapshot, selectedIncident, onCopyCodexPacket }: { foundation: MissionControlFoundation; snapshot: MissionControlSnapshot; selectedIncident: ArchitectIncident | null; onCopyCodexPacket: () => void }) {
  const cards = buildCompactCeoCards(foundation, snapshot, selectedIncident);

  return (
    <section aria-labelledby="ceo-command-center" className="space-y-3" data-testid="architect-ceo-one-screen">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[#d7ffab]">CEO Command Center</p>
          <h2 id="ceo-command-center" className="mt-1 text-2xl font-semibold text-white">One-screen platform posture</h2>
        </div>
        <p className="text-xs text-white/48">Missing data stays Needs Review. Failed evidence stays Failed.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
        {cards.map((card) => (
          <CompactCeoCard
            key={card.id}
            card={card}
            onAction={card.id === "codex-packets" ? onCopyCodexPacket : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function DepartmentLaneDetail({ lane }: { lane: MissionDepartmentLane }) {
  return (
    <section aria-labelledby={`${lane.id}-lane-heading`} className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-[#d7ffab]">{lane.label} Mission Control</p>
        <h2 id={`${lane.id}-lane-heading`} className="mt-2 text-2xl font-semibold text-white">{lane.purpose}</h2>
      </div>
      <article id={lane.id === "content_community" ? "content-community" : lane.id} className="rounded-lg border border-white/10 bg-black/25 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">{lane.label}</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Read-only evidence cards</h3>
          </div>
          <StatusPill status={lane.status} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lane.cards.map((card) => <EvidenceCard key={card.id} card={card} />)}
        </div>
      </article>
    </section>
  );
}

export function ArchitectMissionControl({ laneId = "ceo" }: { laneId?: MissionLaneId }) {
  const [snapshot, setSnapshot] = useState<MissionControlSnapshot | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const incidents = useMemo(() => [...(snapshot?.incidents ?? [])].sort((a, b) => severityRank(a) - severityRank(b)), [snapshot]);
  const selectedIncident = incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0] ?? null;
  const foundation = useMemo(
    () => snapshot?.foundation ?? buildMissionControlFoundation(snapshot?.incidents ?? [], snapshot?.checkedAt),
    [snapshot]
  );
  const activeLane = foundation.navigationLanes.some((lane) => lane.id === laneId) ? laneId : foundation.defaultLaneId;
  const selectedDepartmentLane = foundation.departmentLanes.find((lane) => lane.id === activeLane);

  async function loadSnapshot() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/architect/mission-control");
      const body = await readJson<MissionControlSnapshot>(response);
      setSnapshot(body);
      setSelectedIncidentId(body.selectedIncidentId);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Mission Control could not load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  async function copyPacket(kind: "chatGptPacket" | "codexPacket" | "incidentPacket") {
    if (!snapshot || !selectedIncident) return;
    const packet = snapshot.packets[selectedIncident.id]?.[kind];
    if (!packet) return;
    await navigator.clipboard.writeText(packet);
    setNotice("Packet copied.");
  }

  return (
    <main className="px-2 pb-12 pt-2 sm:px-3 sm:pt-3 lg:px-5" data-testid="architect-mission-control-root">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-lg border border-white/10 bg-black/35 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-[#7CFF00]/18 bg-[#7CFF00]/8 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
                <ShieldCheck className="h-4 w-4" />
                Mission Control
              </div>
              <h1 className="mt-3 text-3xl font-semibold text-white">BVRB3R Architect Operating System</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
                Evidence to diagnosis to safe repair to Codex packet to deploy verification to production validation.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-sm text-white/58">
              <p>Commit: <span className="font-mono text-white/78">{snapshot?.environment.commitHash ?? "unknown"}</span></p>
              <p className="mt-1">Deploy: <span className="font-mono text-white/78">{snapshot?.environment.deploymentId ?? "unknown"}</span></p>
            </div>
          </div>
        </section>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="flex items-start gap-2 rounded-lg border border-[#7CFF00]/20 bg-[#7CFF00]/10 p-3 text-sm text-[#d7ffab]">
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
            {notice}
          </div>
        ) : null}
        {loading && !snapshot ? (
          <Card className="border-white/10 bg-black/25 p-6">
            <p className="text-sm text-white/58">Collecting production evidence.</p>
          </Card>
        ) : null}

        {snapshot ? (
          <>
            {activeLane === "ceo" ? (
              <CeoCommandCenter
                foundation={foundation}
                snapshot={snapshot}
                selectedIncident={selectedIncident}
                onCopyCodexPacket={() => void copyPacket("codexPacket")}
              />
            ) : selectedDepartmentLane ? (
              <DepartmentLaneDetail lane={selectedDepartmentLane} />
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
