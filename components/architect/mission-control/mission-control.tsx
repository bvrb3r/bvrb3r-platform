"use client";

import Link from "next/link";
import type { Route } from "next";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clipboard, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buildArchitectCodexRepairPrompt } from "@/lib/architect/mission-control/codex-prompt-doctrine";
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

function EvidenceCard({ card, onOpenIssue }: { card: MissionEvidenceCard; onOpenIssue?: () => void }) {
  const interactive = Boolean(onOpenIssue);

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Open ${card.label} issue detail` : undefined}
      data-testid={`architect-issue-card-${card.id}`}
      className={cn(
        "min-h-[11rem] rounded-[18px] border border-white/8 bg-black/24 p-4 shadow-[0_18px_42px_rgba(0,0,0,0.20)] transition hover:border-[#A3FF12]/18",
        interactive && "cursor-pointer text-left hover:bg-white/[0.035] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/55"
      )}
      onClick={onOpenIssue}
      onKeyDown={interactive ? (event) => handleCardKeyboard(event, onOpenIssue as () => void) : undefined}
    >
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
      {interactive ? (
        <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#d7ffab]">Open issue detail</p>
      ) : null}
    </article>
  );
}

function issueStatusLabel(card: MissionEvidenceCard): IssueStatusLabel {
  if (card.status === "Needs Review" && card.metricValue === "Not connected") {
    return "Not Connected";
  }
  return card.status;
}

function issueSeverity(status: IssueStatusLabel) {
  if (status === "Failed") return "Critical blocker";
  if (status === "Warning") return "Warning";
  if (status === "Not Connected") return "Not connected";
  if (status === "Needs Review") return "Evidence gap";
  return "Monitoring";
}

function issuePassRequirement(card: MissionEvidenceCard, lane: MissionDepartmentLane) {
  if (lane.id !== "finance") {
    return `${card.label} must report Pass from connected Architect evidence before this issue can be considered resolved.`;
  }

  if (card.id === "finance-payment-health") {
    return "Appointment, payment, status history, routing, and payout guard evidence must all pass from server, Supabase, Stripe, and ledger truth.";
  }

  if (card.id === "finance-stripe") {
    return "Stripe provider truth must be readable and reconciled without any Architect UI money mutation.";
  }

  if (card.id === "finance-routing") {
    return "Payment routing records must exist or expose a clear safe failure state for captured money, with regression coverage.";
  }

  if (card.id === "finance-payout") {
    return "Payout readiness must be based on completed service, captured payment, routing, status history, and policy truth. Architect must not release payouts.";
  }

  if (card.id === "finance-fees") {
    return "Platform fee posture must be backed by routing math evidence and cannot be inferred from UI totals.";
  }

  return "Booth rent and commission readiness must remain approval-gated and backed by explicit money-rule evidence.";
}

function issueMissingOrFailed(card: MissionEvidenceCard, status: IssueStatusLabel) {
  if (status === "Pass") {
    return "No missing or failed evidence is currently reported. Keep this issue under read-only monitoring.";
  }

  if (status === "Failed") {
    return `${card.label} is Failed. Evidence: ${card.evidence.join(" ") || card.summary}`;
  }

  if (status === "Not Connected") {
    return `${card.label} is not connected to required evidence yet. Do not mark it Pass from absence of data.`;
  }

  return `${card.label} needs review. ${card.summary}`;
}

function issueSuggestedFixDirection(card: MissionEvidenceCard, lane: MissionDepartmentLane) {
  if (lane.id !== "finance") {
    return "Inspect the owning lane data source, repair the missing evidence path, and add regression coverage before changing status.";
  }

  if (card.id === "finance-routing" || card.id === "finance-payment-health") {
    return "Trace appointment -> payment -> status history -> payment_routing_records. Repair the server-side evidence or guarded repair path only if Stripe/Supabase truth confirms the missing row.";
  }

  if (card.id === "finance-stripe") {
    return "Inspect read-only Stripe diagnostics and environment/provider configuration. Do not create charges, refunds, or payment status overrides.";
  }

  if (card.id === "finance-payout") {
    return "Inspect payout readiness derivation and guards. Keep payout release blocked until completion, routing, and policy evidence pass.";
  }

  if (card.id === "finance-fees") {
    return "Inspect routing math and platform-fee source fields. Add tests that prevent UI-derived revenue or fake totals.";
  }

  return "Inspect future money-model gates and ensure booth-rent/commission rules remain disabled or approval-gated until explicit implementation.";
}

function issuePrimaryRepairTarget(card: MissionEvidenceCard, lane: MissionDepartmentLane) {
  if (lane.id !== "finance") {
    return `${lane.label} Mission Control evidence source for ${card.label}.`;
  }

  if (card.id === "finance-payment-health") {
    return "Server-side payment routing creation/reconciliation after payment capture and appointment completion.";
  }

  if (card.id === "finance-stripe") {
    return "Read-only Stripe diagnostics and provider truth connection.";
  }

  if (card.id === "finance-routing") {
    return "Payment routing evidence and guarded server-side routing repair path.";
  }

  if (card.id === "finance-payout") {
    return "Payout readiness derivation and release-blocking guard evidence.";
  }

  if (card.id === "finance-fees") {
    return "Platform fee evidence, routing math, and server-side revenue posture.";
  }

  return "Booth rent / commission readiness gates and future money-model evidence.";
}

function buildIssueDetail(card: MissionEvidenceCard, lane: MissionDepartmentLane): ArchitectIssueDetail {
  const status = issueStatusLabel(card);
  const evidenceRows = card.evidence.length ? card.evidence : ["No connected evidence source for this issue yet."];
  const financeIssue = lane.id === "finance";

  return {
    issueName: card.label,
    lane,
    affectedRole: financeIssue ? "Architect / Finance operator" : `${lane.label} operator`,
    affectedFlow: financeIssue ? `${card.workflow} finance readiness` : `${card.workflow} readiness`,
    status,
    severity: issueSeverity(status),
    passRequirement: issuePassRequirement(card, lane),
    currentTruth: `${card.label} is currently ${status}. ${card.metricValue ? `Metric value: ${card.metricValue}. ` : ""}${card.summary}`,
    missingOrFailed: issueMissingOrFailed(card, status),
    evidenceRows,
    whyItMatters: lane.id === "finance"
      ? "Finance posture controls trust, provider reconciliation, routing integrity, payout safety, and release readiness. Prompt generation is read-only and does not change money truth."
      : "This issue affects its department lane readiness and must stay evidence-backed.",
    suggestedFixDirection: issueSuggestedFixDirection(card, lane),
    primaryRepairTarget: issuePrimaryRepairTarget(card, lane),
    rolePermissionRules: financeIssue ? FINANCE_ROLE_PERMISSION_RULES : ["Keep role access scoped to the owning lane.", "Do not expose Architect repair controls to public users."],
    dataSourceTruthRules: financeIssue ? FINANCE_DATA_SOURCE_RULES : ["Use server-owned evidence as source of truth.", "Missing evidence remains Needs Review / Not connected."],
    actionRules: financeIssue ? FINANCE_ACTION_RULES : ["Generate a repair prompt only.", "Do not mutate data or mark Pass from prompt generation."],
    moneyRules: financeIssue ? FINANCE_MONEY_RULES : undefined,
    bookingRules: financeIssue ? FINANCE_BOOKING_RULES : undefined,
    riskNotes: financeIssue
      ? [
        "Money fixes must respect Stripe, server, Supabase, and ledger truth.",
        "No UI component can calculate final money, release payout, refund money, or fake routing.",
        "Prompt generation alone must not change this issue status."
      ]
      : ["Prompt generation is read-only and must not change issue status."],
    requiredValidation: financeIssue ? FINANCE_REQUIRED_VALIDATION : ["Validate the owning evidence source and keep missing evidence as Needs Review."],
    requiredTests: financeIssue ? FINANCE_REQUIRED_TESTS : ["Targeted Architect lane tests", "npm run typecheck", "npm run build"],
    inspectAreas: financeIssue ? FINANCE_REPAIR_INSPECT_AREAS : ["Owning lane data loader", "Mission Control foundation", "Relevant Architect tests"],
    acceptanceCriteria: [
      `${card.label} remains ${status} until real evidence changes.`,
      "No fake Pass state is introduced.",
      "The issue popup still shows evidence, risk, validation, and tests.",
      "Dirty/unrelated files remain untouched."
    ],
    doNotTouch: financeIssue ? FINANCE_DO_NOT_TOUCH : ["unrelated dirty files"]
  };
}

function buildCodexRepairPrompt(issue: ArchitectIssueDetail) {
  return buildArchitectCodexRepairPrompt({
    exactGoal: `Repair ${issue.issueName} inside Architect Mission Control without changing unrelated systems.`,
    exactIssue: issue.issueName,
    lane: issue.lane.label,
    affectedRole: issue.affectedRole,
    affectedFlow: issue.affectedFlow,
    currentStatus: issue.status,
    severity: issue.severity,
    currentTruth: issue.currentTruth,
    evidence: issue.evidenceRows,
    rootCauseHypothesis: issue.missingOrFailed,
    primaryRepairTarget: issue.primaryRepairTarget,
    filesToInspect: issue.inspectAreas,
    rolePermissionRules: issue.rolePermissionRules,
    dataSourceTruthRules: issue.dataSourceTruthRules,
    actionRules: issue.actionRules,
    moneyRules: issue.moneyRules,
    bookingRules: issue.bookingRules,
    doNotTouch: issue.doNotTouch,
    acceptanceCriteria: [
      issue.passRequirement,
      ...issue.acceptanceCriteria
    ],
    requiredValidation: issue.requiredValidation,
    testsToRun: issue.requiredTests
  });
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

type IssueStatusLabel = MissionControlStatus | "Not Connected";

type ArchitectIssueDetail = {
  issueName: string;
  lane: MissionDepartmentLane;
  affectedRole: string;
  affectedFlow: string;
  status: IssueStatusLabel;
  severity: string;
  passRequirement: string;
  currentTruth: string;
  missingOrFailed: string;
  evidenceRows: string[];
  whyItMatters: string;
  suggestedFixDirection: string;
  primaryRepairTarget: string;
  rolePermissionRules: string[];
  dataSourceTruthRules: string[];
  actionRules: string[];
  moneyRules?: string[];
  bookingRules?: string[];
  riskNotes: string[];
  requiredValidation: string[];
  requiredTests: string[];
  inspectAreas: string[];
  acceptanceCriteria: string[];
  doNotTouch: string[];
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

const FINANCE_REPAIR_INSPECT_AREAS = [
  "lib/architect/mission-control/foundation.ts",
  "app/api/architect/debug/payment/route.ts",
  "app/api/architect/debug/routing/route.ts",
  "app/api/architect/repairs/payment-routing/route.ts",
  "app/api/bookings/route.ts",
  "payment_routing_records table",
  "payments table",
  "appointments/status history tables",
  "Stripe provider reconciliation path"
];

const FINANCE_DO_NOT_TOUCH = [
  "Client UX",
  "Barber UX",
  "Owner UX",
  "Booking flow UI",
  "Stripe mutation logic",
  "Payout/release logic",
  "Refund/dispute mutation logic",
  "Kiosk",
  "Culture feed",
  "More settings",
  "unrelated dirty files"
];

const FINANCE_REQUIRED_VALIDATION = [
  "Use Stripe/server/Supabase/ledger truth as the source of record.",
  "Confirm no UI component calculates final money.",
  "Confirm no UI component releases payout or refunds money.",
  "Confirm failed issue evidence remains Failed until real evidence changes after fix, deploy, and validation.",
  "Confirm routing/payment fixes include regression coverage.",
  "Confirm no fake routing or payout readiness state is introduced."
];

const FINANCE_ROLE_PERMISSION_RULES = [
  "Architect is read-only for issue prompt generation.",
  "Only approved server-side finance paths may inspect or repair payment/routing evidence.",
  "Public client, barber, and owner UX must not receive Architect repair controls.",
  "Prompt generation must not change permissions, roles, or account state."
];

const FINANCE_DATA_SOURCE_RULES = [
  "Stripe, server, Supabase, and ledger truth are authoritative for money state.",
  "Payment routing records and appointment status history must be reconciled server-side.",
  "Missing finance evidence remains Needs Review / Not connected.",
  "Failed finance evidence remains Failed until real validation changes."
];

const FINANCE_ACTION_RULES = [
  "Generate a repair prompt only.",
  "Do not auto-fix code from Architect UI.",
  "Do not mutate database records from prompt generation.",
  "Do not mark any issue Pass from prompt generation alone."
];

const FINANCE_MONEY_RULES = [
  "Respect Stripe/server/Supabase/ledger truth.",
  "No UI optimism for money state.",
  "No payout guess.",
  "No refund or dispute mutation unless explicitly required and approved.",
  "Routing/payment fixes require regression coverage.",
  "No UI component calculates final money.",
  "No UI component releases payout."
];

const FINANCE_BOOKING_RULES = [
  "Booking lifecycle truth must stay consistent with appointment/payment records.",
  "Legal status transitions must be preserved.",
  "Payment and appointment consistency must be verified.",
  "Client, barber, and owner visibility checks must remain role-safe."
];

const FINANCE_REQUIRED_TESTS = [
  "Targeted Architect Mission Control tests",
  "Targeted payment/routing debug tests when touched",
  "Targeted payment routing repair tests when touched",
  "Targeted booking/payment regression tests when touched",
  "Targeted ESLint on touched files",
  "npm run typecheck",
  "npm run build"
];

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

function ArchitectIssueDetailModal({ card, lane, onClose }: { card: MissionEvidenceCard; lane: MissionDepartmentLane; onClose: () => void }) {
  const issue = useMemo(() => buildIssueDetail(card, lane), [card, lane]);
  const [promptState, setPromptState] = useState<"idle" | "building" | "ready">("idle");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [manualCopyRequired, setManualCopyRequired] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function copyPrompt(prompt: string) {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard is not available.");
    }
    await navigator.clipboard.writeText(prompt);
  }

  async function handlePromptAction() {
    const prompt = generatedPrompt || buildCodexRepairPrompt(issue);
    setPromptState("building");
    setCopyMessage(null);
    setManualCopyRequired(false);
    setGeneratedPrompt(prompt);
    await new Promise((resolve) => window.setTimeout(resolve, 10));

    try {
      await copyPrompt(prompt);
      setCopyMessage("Prompt copied to clipboard. Paste it into Codex.");
    } catch {
      setManualCopyRequired(true);
      setCopyMessage("Clipboard unavailable. Copy the prompt manually.");
    } finally {
      setPromptState("ready");
    }
  }

  const promptButtonLabel = promptState === "building"
    ? "Building repair packet..."
    : promptState === "ready"
      ? "Copy & Paste in Codex"
      : "Generate Codex Prompt";

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/76 px-3 py-4 backdrop-blur-xl sm:items-center sm:px-5" role="dialog" aria-modal="true" aria-labelledby="architect-issue-detail-title" onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#070707] text-white shadow-[0_34px_100px_rgba(0,0,0,0.62)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-white/8 p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#A3FF12]">Issue Detail</p>
            <h3 id="architect-issue-detail-title" className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">{issue.issueName}</h3>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-[8px] border border-white/10 bg-black/24 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/58">{issue.lane.label}</span>
              <StatusPill status={issue.status} />
              <span className="rounded-[8px] border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-100">{issue.severity}</span>
            </div>
          </div>
          <button type="button" aria-label="Close issue detail" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.035] text-white/70 transition hover:border-[#A3FF12]/35 hover:text-[#A3FF12]" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-2">
            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">What must be true for Pass</h4>
              <p className="mt-3 text-sm leading-6 text-white/68">{issue.passRequirement}</p>
            </section>
            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">What is currently true</h4>
              <p className="mt-3 text-sm leading-6 text-white/68">{issue.currentTruth}</p>
            </section>
            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">What is missing or failed</h4>
              <p className="mt-3 text-sm leading-6 text-white/68">{issue.missingOrFailed}</p>
            </section>
            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Why it matters</h4>
              <p className="mt-3 text-sm leading-6 text-white/68">{issue.whyItMatters}</p>
            </section>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Evidence rows</h4>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-white/62">
                {issue.evidenceRows.map((row) => (
                  <li key={row} className="border-l border-[#A3FF12]/22 pl-3">{row}</li>
                ))}
              </ul>
            </section>
            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Suggested fix direction</h4>
              <p className="mt-3 text-sm leading-6 text-white/68">{issue.suggestedFixDirection}</p>
              <h4 className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Risk notes</h4>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-white/62">
                {issue.riskNotes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            </section>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Required validation</h4>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-white/62">
                {issue.requiredValidation.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Required tests</h4>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-white/62">
                {issue.requiredTests.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          </div>

          {manualCopyRequired && generatedPrompt ? (
            <div className="mt-3 rounded-[18px] border border-amber-300/20 bg-amber-300/10 p-4">
              <label htmlFor="architect-issue-repair-prompt" className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">Manual copy prompt</label>
              <textarea id="architect-issue-repair-prompt" aria-label="Generated Codex repair prompt" className="mt-3 min-h-56 w-full rounded-[12px] border border-white/10 bg-black/42 p-3 font-mono text-xs leading-5 text-white/76" readOnly value={generatedPrompt} />
            </div>
          ) : null}

          {copyMessage ? (
            <p className="mt-3 rounded-[14px] border border-[#A3FF12]/18 bg-[#A3FF12]/8 p-3 text-sm text-[#d7ffab]">{copyMessage}</p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-white/8 p-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" className="min-h-11 rounded-[8px]" onClick={onClose}>Close</Button>
          <Button type="button" className="min-h-11 rounded-[8px] border border-[#A3FF12]/42 bg-[#A3FF12] px-5 text-sm font-black text-black hover:bg-[#d7ffab]" onClick={() => void handlePromptAction()} disabled={promptState === "building"}>
            {promptButtonLabel}
          </Button>
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
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const selectedIssue = lane.cards.find((card) => card.id === selectedIssueId) ?? null;
  const issueDetailsEnabled = lane.id === "finance";

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
          {lane.cards.map((card) => (
            <EvidenceCard
              key={card.id}
              card={card}
              onOpenIssue={issueDetailsEnabled ? () => setSelectedIssueId(card.id) : undefined}
            />
          ))}
        </div>
      </article>
      {issueDetailsEnabled && selectedIssue ? (
        <ArchitectIssueDetailModal card={selectedIssue} lane={lane} onClose={() => setSelectedIssueId(null)} />
      ) : null}
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
