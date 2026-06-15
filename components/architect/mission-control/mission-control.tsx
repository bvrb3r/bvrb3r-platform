"use client";

import Link from "next/link";
import type { Route } from "next";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clipboard, ShieldCheck, X } from "lucide-react";
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
    <span className={cn("rounded-[8px] border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]", statusClass(status))}>
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
    <article className="min-h-[11rem] rounded-[18px] border border-white/8 bg-black/24 p-4 shadow-[0_18px_42px_rgba(0,0,0,0.20)] transition hover:border-[#A3FF12]/18">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">{card.department} / {card.workflow}</p>
          <h3 className="mt-2 text-base font-black tracking-[-0.02em] text-white">{card.label}</h3>
        </div>
        <StatusPill status={card.status} />
      </div>
      {card.metricValue ? (
        <p className="mt-4 text-3xl font-black tracking-[-0.04em] text-white">{card.metricValue}</p>
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
  explanation: string;
  evidence: string[];
  riskMeaning: string;
  critical: boolean;
  passRequirement: string;
  currentTruth: string;
  missingOrFailed: string;
  nextAction: string;
  chartPoints?: CeoChartPoint[];
  href?: Route;
  actionLabel?: string;
};

type CeoChartPoint = {
  label: string;
  value: number;
};

type CeoReadinessSummary = {
  overallStatus: MissionControlStatus;
  passCount: number;
  failedCount: number;
  needsReviewCount: number;
  totalCount: number;
  readinessPercent: number;
  criticalBlockers: CompactCeoCard[];
  missingRequiredEvidence: CompactCeoCard[];
};

const CEO_CHECKLIST_IDS = new Set([
  "platform-health",
  "money-revenue",
  "total-users",
  "clients",
  "barbers",
  "shop-owners",
  "bookings",
  "payments",
  "routing-payout",
  "culture",
  "active-supply",
  "critical-incidents",
  "deployment-regression",
  "source-vault",
  "action-registry",
  "hive-ai",
  "codex-packets"
]);

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

function cardEvidence(...cards: Array<MissionEvidenceCard | undefined>) {
  const evidence = cards.flatMap((card) => card?.evidence ?? []).filter(Boolean);
  return evidence.length ? evidence : ["No connected evidence source for this card yet."];
}

function riskMeaning(label: string, status: MissionControlStatus) {
  if (status === "Pass") {
    return `${label} has connected evidence currently reporting Pass. Keep monitoring it as part of the CEO operating posture.`;
  }
  if (status === "Failed") {
    return `${label} has failed evidence. Treat this as active operational risk until the underlying workflow is repaired and revalidated.`;
  }
  if (status === "Warning") {
    return `${label} has warning evidence. It is not blocking by itself, but it needs review before being treated as launch-ready.`;
  }
  return `${label} is not fully connected. Do not treat this as healthy until real evidence is wired and verified.`;
}

function isCriticalChecklistItem(id: string) {
  return CEO_CHECKLIST_IDS.has(id);
}

function passRequirement(label: string) {
  return `${label} must report Pass from connected, role-safe evidence. Missing evidence stays Needs Review, and failed evidence stays Failed.`;
}

function currentTruth(label: string, status: MissionControlStatus, value: string, summary: string) {
  return `${label} is currently ${status}. Current value: ${value}. ${summary}`;
}

function missingOrFailed(label: string, status: MissionControlStatus, value: string, summary: string) {
  if (status === "Pass") {
    return `No missing or failed evidence is reported for ${label}. Continue monitoring before release decisions.`;
  }

  if (status === "Failed") {
    return `${label} has failed evidence: ${summary}`;
  }

  if (value === "Not connected") {
    return `${label} is missing required connected evidence. This cannot be counted as Pass.`;
  }

  return `${label} needs review before it can be counted as Pass: ${summary}`;
}

function nextChecklistAction(label: string, status: MissionControlStatus) {
  if (status === "Pass") {
    return `Keep ${label} monitored and revalidate it before launch gates.`;
  }

  if (status === "Failed") {
    return `Open the mapped Architect lane, repair the failed evidence, then rerun validation for ${label}.`;
  }

  return `Open the mapped Architect lane and connect the missing evidence required for ${label}.`;
}

function compactCard(input: {
  id: string;
  label: string;
  status?: MissionControlStatus;
  value?: string;
  summary?: string;
  explanation?: string;
  evidence?: string[];
  riskMeaning?: string;
  chartPoints?: CeoChartPoint[];
  href?: Route;
  actionLabel?: string;
}): CompactCeoCard {
  const status = input.status ?? "Needs Review";
  const summary = input.summary ?? "Missing data remains Needs Review.";

  return {
    id: input.id,
    label: input.label,
    status,
    value: input.value ?? "Not connected",
    summary,
    explanation: input.explanation ?? summary,
    evidence: input.evidence?.length ? input.evidence : ["No connected evidence source for this card yet."],
    riskMeaning: input.riskMeaning ?? riskMeaning(input.label, status),
    critical: isCriticalChecklistItem(input.id),
    passRequirement: passRequirement(input.label),
    currentTruth: currentTruth(input.label, status, input.value ?? "Not connected", summary),
    missingOrFailed: missingOrFailed(input.label, status, input.value ?? "Not connected", summary),
    nextAction: nextChecklistAction(input.label, status),
    chartPoints: input.chartPoints,
    href: input.href,
    actionLabel: input.actionLabel
  };
}

function buildCeoReadiness(cards: CompactCeoCard[]): CeoReadinessSummary {
  const passCount = cards.filter((card) => card.status === "Pass").length;
  const failedCount = cards.filter((card) => card.status === "Failed").length;
  const needsReviewCount = cards.filter((card) => card.status !== "Pass" && card.status !== "Failed").length;
  const criticalBlockers = cards.filter((card) => card.critical && card.status === "Failed");
  const missingRequiredEvidence = cards.filter((card) => card.critical && card.status !== "Pass" && card.status !== "Failed");
  const totalCount = cards.length;
  const readinessPercent = totalCount ? Math.round((passCount / totalCount) * 100) : 0;
  const overallStatus: MissionControlStatus = criticalBlockers.length
    ? "Failed"
    : missingRequiredEvidence.length
      ? "Needs Review"
      : totalCount > 0 && passCount === totalCount
        ? "Pass"
        : "Needs Review";

  return {
    overallStatus,
    passCount,
    failedCount,
    needsReviewCount,
    totalCount,
    readinessPercent,
    criticalBlockers,
    missingRequiredEvidence
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
  const sourceVaultEvidence = foundation.sourceVault.slice(0, 5).map((source) => `${source.sourceName}: ${source.status}; ${source.ingestionStatus}.`);
  const actionRegistryEvidence = unsafeActions.length
    ? unsafeActions.slice(0, 5).map((action) => `${action.label}: ${action.allowed ? "allowed" : "blocked"} (${action.riskClass}).`)
    : ["No unsafe action registry rows are connected."];
  const hiveEvidence = foundation.agentRegistry.slice(0, 5).map((agent) => `${agent.name}: ${agent.autonomyLevel}; ${agent.currentStatus}.`);
  const codexPacketEvidence = selectedIncident
    ? selectedIncident.evidence.concat(`Selected incident: ${selectedIncident.headline}`)
    : ["No active incident packet is selected."];

  return [
    compactCard({ id: "platform-health", label: "Platform Health", status: platform?.status, value: platform?.status, summary: metricSummary(platform), evidence: cardEvidence(platform), href: "/architect/technology" }),
    compactCard({ id: "money-revenue", label: "Money / App Revenue", status: money?.status, value: metricValue(money), summary: metricSummary(money), evidence: cardEvidence(money), href: "/architect/finance" }),
    compactCard({ id: "total-users", label: "Total Users", status: totalUsers?.status, value: metricValue(totalUsers), summary: metricSummary(totalUsers), evidence: cardEvidence(totalUsers), href: "/architect/product" }),
    compactCard({ id: "clients", label: "Clients", status: clients?.status, value: metricValue(clients), summary: metricSummary(clients), evidence: cardEvidence(clients), href: "/architect/product" }),
    compactCard({ id: "barbers", label: "Barbers", status: barbers?.status, value: metricValue(barbers), summary: metricSummary(barbers), evidence: cardEvidence(barbers), href: "/architect/operations" }),
    compactCard({ id: "shop-owners", label: "Shop Owners", status: owners?.status, value: metricValue(owners), summary: metricSummary(owners), evidence: cardEvidence(owners), href: "/architect/operations" }),
    compactCard({ id: "bookings", label: "Bookings", status: worstStatus(bookings?.status, todayBookings?.status), value: metricValue(bookings), summary: `Today: ${metricValue(todayBookings)}. ${metricSummary(bookings)}`, evidence: cardEvidence(bookings, todayBookings), href: "/architect/operations" }),
    compactCard({ id: "payments", label: "Payments", status: payments?.status, value: metricValue(payments), summary: metricSummary(payments), evidence: cardEvidence(payments), href: "/architect/finance" }),
    compactCard({ id: "routing-payout", label: "Routing / Payout Readiness", status: worstStatus(routing?.status, payout?.status), value: `${metricValue(routing)} / ${metricValue(payout)}`, summary: "Payment routing and payout readiness stay separated from money mutation.", evidence: cardEvidence(routing, payout), href: "/architect/finance" }),
    compactCard({ id: "culture", label: "Culture", status: culture?.status, value: metricValue(culture), summary: metricSummary(culture), evidence: cardEvidence(culture), href: "/architect/content-community" }),
    compactCard({ id: "active-supply", label: "Active Shops / Active Barbers", status: worstStatus(shops?.status, activeBarbers?.status), value: `${metricValue(shops)} / ${metricValue(activeBarbers)}`, summary: "Active supply is read from shop and barber evidence.", evidence: cardEvidence(shops, activeBarbers), href: "/architect/operations" }),
    compactCard({ id: "critical-incidents", label: "Critical Incidents", status: incidents?.status, value: metricValue(incidents), summary: metricSummary(incidents), evidence: cardEvidence(incidents), href: "/architect/technology" }),
    compactCard({ id: "deployment-regression", label: "Deployment / Regression", status: deployment?.status, value: metricValue(deployment), summary: metricSummary(deployment), evidence: cardEvidence(deployment), href: "/architect/technology" }),
    compactCard({ id: "source-vault", label: "Source Vault", status: sourceVault?.status, value: `${foundation.sourceVault.length} registered`, summary: "Sources are registered, not ingested.", evidence: sourceVaultEvidence, href: "/architect/technology" }),
    compactCard({ id: "action-registry", label: "Action Registry", status: unsafeBlocked ? "Pass" : "Failed", value: unsafeBlocked ? "Unsafe blocked" : "Review needed", summary: `${unsafeActions.length} unsafe action(s) blocked by registry.`, evidence: actionRegistryEvidence, href: "/architect/security" }),
    compactCard({ id: "hive-ai", label: "Hive AI", status: hiveAi?.status, value: `${foundation.agentRegistry.length} agents`, summary: "Hive AI remains Level 0/1 only.", evidence: hiveEvidence, href: "/architect/technology" }),
    compactCard({ id: "codex-packets", label: "Codex Packets", status: selectedPacket ? "Pass" : "Needs Review", value: `${packetCount} packet(s)`, summary: selectedPacket ? "Codex packet is available for the selected incident." : "No active incident packet is selected.", evidence: codexPacketEvidence, href: "/architect/technology", actionLabel: selectedPacket ? "Copy Codex Packet" : undefined })
  ];
}

function CeoHistoricalChart({ points }: { points?: CeoChartPoint[] }) {
  if (!points?.length) {
    return (
      <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.025] p-4 text-sm text-white/58">
        No historical data connected yet
      </div>
    );
  }

  const maxValue = Math.max(...points.map((point) => point.value), 1);

  return (
    <div className="rounded-[18px] border border-white/8 bg-black/24 p-4">
      <div className="flex h-32 items-end gap-2">
        {points.map((point) => (
          <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div
              className="w-full rounded-t-[8px] border border-[#A3FF12]/22 bg-[#A3FF12]/18"
              style={{ height: `${Math.max(8, (point.value / maxValue) * 100)}%` }}
            />
            <span className="truncate text-[10px] font-black uppercase tracking-[0.08em] text-white/44">{point.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function handleCardKeyboard(event: ReactKeyboardEvent<HTMLElement>, onOpenDetail: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onOpenDetail();
  }
}

function CompactCeoCard({ card, onAction, onOpenDetail }: { card: CompactCeoCard; onAction?: () => void; onOpenDetail: () => void }) {
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Open ${card.label} detail`}
      data-testid={`architect-ceo-card-${card.id}`}
      className="flex min-h-[8rem] cursor-pointer flex-col justify-between rounded-[18px] border border-white/8 bg-black/24 p-4 text-left shadow-[0_18px_42px_rgba(0,0,0,0.20)] transition hover:border-[#A3FF12]/18 hover:bg-white/[0.035] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/55"
      onClick={onOpenDetail}
      onKeyDown={(event) => handleCardKeyboard(event, onOpenDetail)}
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-xs font-black uppercase tracking-[0.14em] text-white/58">{card.label}</h3>
          <StatusPill status={card.status} />
        </div>
        <p className="mt-3 break-words text-2xl font-black leading-tight tracking-[-0.04em] text-white sm:text-3xl">{card.value}</p>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/56">{card.summary}</p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {card.href ? (
          <Link
            href={card.href}
            className="text-[10px] font-black uppercase tracking-[0.16em] text-[#d7ffab] hover:text-white"
            onClick={(event) => event.stopPropagation()}
          >
            Open lane
          </Link>
        ) : null}
        {card.actionLabel && onAction ? (
          <Button
            type="button"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation();
              onAction();
            }}
            className="min-h-8 rounded-[8px] px-3 text-[10px] font-black"
          >
            <Clipboard className="h-3.5 w-3.5" />
            {card.actionLabel}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function CeoReadinessCard({ readiness }: { readiness: CeoReadinessSummary }) {
  const headline = readiness.overallStatus === "Pass" ? "100% Pass" : readiness.overallStatus;
  const blockerLabels = readiness.criticalBlockers.map((card) => card.label);

  return (
    <article
      data-testid="architect-ceo-readiness"
      className="rounded-[22px] border border-white/8 bg-[linear-gradient(135deg,rgba(163,255,18,0.10),rgba(255,255,255,0.025)_42%,rgba(0,0,0,0.24))] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.30)] sm:p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">App Readiness</p>
            <StatusPill status={readiness.overallStatus} />
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <p className="text-4xl font-black leading-none tracking-[-0.055em] text-white sm:text-5xl">{headline}</p>
            <p className="pb-1 text-sm font-bold text-white/54">{readiness.readinessPercent}% Pass evidence</p>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/62">
            Overall status requires every CEO checklist item to report Pass from connected evidence. Failed critical evidence blocks release; missing evidence stays Needs Review.
          </p>
          <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-white/44">Overall status</p>
        </div>

        <div className="grid min-w-full gap-2 sm:grid-cols-4 lg:min-w-[34rem]">
          <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Pass count</p>
            <p data-testid="ceo-readiness-pass-count" className="mt-1 text-2xl font-black text-[#d7ffab]">{readiness.passCount}</p>
          </div>
          <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Failed count</p>
            <p data-testid="ceo-readiness-failed-count" className="mt-1 text-2xl font-black text-rose-100">{readiness.failedCount}</p>
          </div>
          <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Needs Review count</p>
            <p data-testid="ceo-readiness-needs-review-count" className="mt-1 text-2xl font-black text-amber-100">{readiness.needsReviewCount}</p>
          </div>
          <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Critical blockers</p>
            <p data-testid="ceo-readiness-critical-blockers" className="mt-1 text-2xl font-black text-white">{readiness.criticalBlockers.length}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-[16px] border border-white/8 bg-black/18 p-3">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Critical Blocker</p>
        <p className="mt-1 text-sm leading-6 text-white/62">
          {blockerLabels.length ? blockerLabels.join(", ") : "No failed critical checklist blockers reported."}
        </p>
      </div>
    </article>
  );
}

function CeoCardDetailModal({ card, onClose }: { card: CompactCeoCard; onClose: () => void }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/76 px-3 py-4 backdrop-blur-xl sm:items-center sm:px-5" role="dialog" aria-modal="true" aria-labelledby="ceo-card-detail-title" onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#070707] text-white shadow-[0_34px_100px_rgba(0,0,0,0.62)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-white/8 p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#A3FF12]">CEO Card Detail</p>
            <h3 id="ceo-card-detail-title" className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">{card.label}</h3>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill status={card.status} />
              <span className="rounded-[8px] border border-white/10 bg-black/24 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/54">Read-only</span>
            </div>
          </div>
          <button type="button" aria-label="Close CEO card detail" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.035] text-white/70 transition hover:border-[#A3FF12]/35 hover:text-[#A3FF12]" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Main value</p>
              <p className="mt-3 break-words text-3xl font-black leading-tight tracking-[-0.04em] text-white">{card.value}</p>
            </div>
            <div className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Checklist status</p>
              <div className="mt-3">
                <StatusPill status={card.status} />
              </div>
              <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Plain-English explanation</p>
              <p className="mt-3 text-sm leading-6 text-white/70">{card.explanation}</p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">What must be true for Pass</h4>
              <p className="mt-3 text-sm leading-6 text-white/68">{card.passRequirement}</p>
            </section>
            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">What is currently true</h4>
              <p className="mt-3 text-sm leading-6 text-white/68">{card.currentTruth}</p>
            </section>
            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">What is missing or failed</h4>
              <p className="mt-3 text-sm leading-6 text-white/68">{card.missingOrFailed}</p>
            </section>
            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Why it matters</h4>
              <p className="mt-3 text-sm leading-6 text-white/68">{card.riskMeaning}</p>
            </section>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Evidence</h4>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-white/62">
                {card.evidence.slice(0, 6).map((item) => (
                  <li key={item} className="border-l border-[#A3FF12]/22 pl-3">{item}</li>
                ))}
              </ul>
            </section>

            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Next action</h4>
              <p className="mt-3 text-sm leading-6 text-white/68">{card.nextAction}</p>
            </section>
          </div>

          <section className="mt-3">
            <h4 className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Historical signal</h4>
            <CeoHistoricalChart points={card.chartPoints} />
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-white/8 p-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" className="min-h-11 rounded-[8px]" onClick={onClose}>Close</Button>
          {card.href ? (
            <Link href={card.href} className="inline-flex min-h-11 items-center justify-center rounded-[8px] border border-[#A3FF12]/42 bg-[#A3FF12] px-5 text-sm font-black text-black shadow-[0_14px_32px_rgba(163,255,18,0.22)] transition hover:bg-[#d7ffab]">
              Open Lane
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CeoCommandCenter({ foundation, snapshot, selectedIncident, onCopyCodexPacket }: { foundation: MissionControlFoundation; snapshot: MissionControlSnapshot; selectedIncident: ArchitectIncident | null; onCopyCodexPacket: () => void }) {
  const cards = buildCompactCeoCards(foundation, snapshot, selectedIncident);
  const readiness = buildCeoReadiness(cards);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? null;

  return (
    <section aria-labelledby="ceo-command-center" className="space-y-3" data-testid="architect-ceo-one-screen">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">CEO Command Center</p>
          <h2 id="ceo-command-center" className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">One-screen platform posture</h2>
        </div>
        <p className="text-xs text-white/48">Missing data stays Needs Review. Failed evidence stays Failed.</p>
      </div>
      <CeoReadinessCard readiness={readiness} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
        {cards.map((card) => (
          <CompactCeoCard
            key={card.id}
            card={card}
            onOpenDetail={() => setSelectedCardId(card.id)}
            onAction={card.id === "codex-packets" ? onCopyCodexPacket : undefined}
          />
        ))}
      </div>
      {selectedCard ? <CeoCardDetailModal card={selectedCard} onClose={() => setSelectedCardId(null)} /> : null}
    </section>
  );
}

function DepartmentLaneDetail({ lane }: { lane: MissionDepartmentLane }) {
  return (
    <section aria-labelledby={`${lane.id}-lane-heading`} className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">{lane.label} Mission Control</p>
        <h2 id={`${lane.id}-lane-heading`} className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">{lane.purpose}</h2>
      </div>
      <article id={lane.id === "content_community" ? "content-community" : lane.id} className="rounded-[24px] border border-white/8 bg-black/24 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">{lane.label}</p>
            <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">Read-only evidence cards</h3>
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
    <main className="px-2 pb-8 pt-2 sm:px-3 sm:pt-3 lg:px-5" data-testid="architect-mission-control-root">
      <div className="mx-auto max-w-7xl space-y-3">
        <section className="relative overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:p-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(163,255,18,0.08),transparent_32%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-[8px] border border-[#A3FF12]/18 bg-[#A3FF12]/8 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#d7ffab]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Mission Control
              </div>
              <h1 className="mt-3 text-3xl font-black leading-none tracking-[-0.045em] text-white sm:text-4xl">BVRB3R Architect Operating System</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
                Evidence to diagnosis to safe repair to Codex packet to deploy verification to production validation.
              </p>
            </div>
            <div className="grid gap-2 rounded-[18px] border border-white/8 bg-black/24 p-3 text-xs text-white/58 sm:min-w-[18rem]">
              <div>
                <p className="font-black uppercase tracking-[0.14em] text-white/36">Commit</p>
                <p className="mt-1 truncate font-mono text-sm text-white/78">{snapshot?.environment.commitHash ?? "unknown"}</p>
              </div>
              <div>
                <p className="font-black uppercase tracking-[0.14em] text-white/36">Deploy</p>
                <p className="mt-1 truncate font-mono text-sm text-white/78">{snapshot?.environment.deploymentId ?? "unknown"}</p>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="flex items-start gap-2 rounded-[18px] border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="flex items-start gap-2 rounded-[18px] border border-[#A3FF12]/20 bg-[#A3FF12]/10 p-3 text-sm text-[#d7ffab]">
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
            {notice}
          </div>
        ) : null}
        {loading && !snapshot ? (
          <Card className="rounded-[24px] border-white/10 bg-black/25 p-5">
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
