"use client";

import Link from "next/link";
import type { Route } from "next";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clipboard, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buildArchitectCodexRepairPrompt } from "@/lib/architect/mission-control/codex-prompt-doctrine";
import { buildMissionControlFoundation, buildMissionReadinessBreakdown, buildV1RuntimeProofMatrix, getOfficerCleanupEvidence } from "@/lib/architect/mission-control/foundation";
import type {
  ArchitectIncident,
  AuditSpineModel,
  AuditSpineRecord,
  AuditSpineStatus,
  CeoCardStateSemantics,
  CeoCardStateStatus,
  CeoCardStateType,
  DeploymentRegressionEvidence,
  FinanceLogCategory,
  FinanceLogEntry,
  FinanceRoutingEvidenceSummary,
  FinanceRefundTarget,
  MissionControlFoundation,
  MissionReadinessBreakdown,
  MissionControlSnapshot,
  MissionDepartmentLane,
  MissionEvidenceCard,
  MissionControlStatus,
  MissionLaneId,
  OfficerGreenGate,
  RoleTruthInventory,
  RlsSecurityInventory,
  SourceVaultInventory,
  V1RuntimeProofGroup
} from "@/lib/architect/mission-control/types";
import { cn } from "@/lib/utils";

type ApiError = {
  ok: false;
  error?: string;
  safeMessage?: string;
  stage?: string;
};

type ControlledRefundTarget = FinanceRefundTarget;

type ControlledRefundResult = {
  refund?: {
    id?: string;
    payment_id?: string;
    amount?: number;
    reason?: string | null;
    provider_refund_id?: string | null;
    refunded_at?: string;
  };
  payment?: {
    id?: string;
    paymentStatus?: string;
    payment_status?: string;
  };
  summary?: {
    refundedAmount?: number;
  } | null;
};

type ControlledRefundExecutionState = {
  status: "idle" | "running" | "success" | "error";
  message?: string;
  refundId?: string;
  paymentStatus?: string;
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
    return "border-[#C4F24E]/25 bg-[#C4F24E]/12 text-[#e4f9b8]";
  }
  if (["idle"].some((token) => normalized.includes(token))) {
    return "border-emerald-300/20 bg-emerald-300/8 text-emerald-100";
  }
  if (["parked", "future"].some((token) => normalized.includes(token))) {
    return "border-sky-300/22 bg-sky-300/8 text-sky-100";
  }
  if (["blocked"].some((token) => normalized.includes(token))) {
    return "border-orange-300/28 bg-orange-300/10 text-orange-100";
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
        "min-h-[11rem] rounded-[18px] border border-white/8 bg-black/24 p-4 shadow-[0_18px_42px_rgba(0,0,0,0.20)] transition hover:border-[#C4F24E]/18",
        interactive && "cursor-pointer text-left hover:bg-white/[0.035] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E]/55"
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
        <p className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#e4f9b8]">Open issue detail</p>
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

  if (card.id === "finance-refund-resolution") {
    return "Cancelled appointments with captured payments must have refund or reversal evidence, blocked/manual_review routing, released_at null, and payout_executions count 0 before Finance can Pass.";
  }

  if (card.id === "finance-fees") {
    return "Platform fee posture must be backed by routing math evidence and cannot be inferred from UI totals.";
  }

  return "Full Booth Rent and AutoBooth Rent readiness must remain approval-gated and backed by explicit money-rule evidence.";
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

  if (card.id === "finance-refund-resolution") {
    return "Inspect the cancelled appointment, captured payment, routing row, refund evidence, and payout execution evidence. Resolve only through the canonical refund route after authorization.";
  }

  if (card.id === "finance-fees") {
    return "Inspect routing math and platform-fee source fields. Add tests that prevent UI-derived revenue or fake totals.";
  }

  return "Inspect future money-model gates and ensure booth-rent and AutoBooth rules remain disabled or approval-gated until explicit implementation.";
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

  if (card.id === "finance-refund-resolution") {
    return "Canonical refund/reversal evidence for cancelled appointments that still have captured payments.";
  }

  if (card.id === "finance-fees") {
    return "Platform fee evidence, routing math, and server-side revenue posture.";
  }

  return "Full Booth Rent / AutoBooth Rent readiness gates and future money-model evidence.";
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
  status: CeoCardStateStatus;
  underlyingStatus: MissionControlStatus;
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
  stateSemantics: CeoCardStateSemantics;
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
  futureParkedCount: number;
  criticalBlockers: Array<CompactCeoCard | MissionEvidenceCard>;
  missingRequiredEvidence: Array<CompactCeoCard | MissionEvidenceCard>;
  currentReleaseBlockers: Array<CompactCeoCard | MissionEvidenceCard>;
  evidenceGaps: Array<CompactCeoCard | MissionEvidenceCard>;
  nextFoundationBlockers: Array<CompactCeoCard | MissionEvidenceCard>;
};

type CeoOfficerStatusSummary = {
  laneId: MissionLaneId;
  label: string;
  status: MissionControlStatus;
  href: Route;
  failedCount: number;
  needsReviewCount: number;
  criticalBlockerCount: number;
  proofConnected: boolean;
  blockerReasons: string[];
};

type CeoOfficerBlockerGroup = {
  laneId: MissionLaneId;
  label: string;
  status: MissionControlStatus;
  href: Route;
  failedCount: number;
  needsReviewCount: number;
  criticalBlockerCount: number;
  blockers: Array<CompactCeoCard | MissionEvidenceCard>;
};

type CeoGreenQueueBucketId = "already_green" | "parked_idle" | "needs_proof" | "needs_repair" | "blocked";

type CeoGreenQueueBucket = {
  id: CeoGreenQueueBucketId;
  label: string;
  summary: string;
  cards: CompactCeoCard[];
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
  "refund-evidence",
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

const OFFICER_LANE_IDS: MissionLaneId[] = [
  "product",
  "technology",
  "operations",
  "finance",
  "marketing",
  "compliance",
  "security",
  "content_community"
];

const RUNTIME_PROOF_GROUPS_BY_LANE: Partial<Record<MissionLaneId, V1RuntimeProofGroup["id"][]>> = {
  product: ["client_loop"],
  operations: ["barber_loop", "shop_owner_loop"],
  finance: ["money_loop"],
  technology: ["deployment_loop"],
  security: ["security_loop"],
  compliance: ["audit_loop"]
};

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

const CONTROLLED_REFUND_CONFIRMATION = "REFUND 5";
const CONTROLLED_REFUND_SOURCE = "architect_finance_controlled_refund";
const CONTROLLED_REFUND_INCIDENT_CODE = "cancelled_captured_refund_missing";

function shouldShowControlledRefundResolution(card: MissionEvidenceCard, issue: ArchitectIssueDetail) {
  if (issue.lane.id !== "finance") return false;
  if (card.id !== "finance-refund-resolution") return false;
  return true;
}

function findCeoCard(foundation: MissionControlFoundation, id: string) {
  return foundation.ceoCommandCenter.find((card) => card.id === id);
}

function statusRank(status: MissionControlStatus | CeoCardStateStatus) {
  if (status === "Failed") return 3;
  if (status === "Blocked") return 3;
  if (status === "Warning") return 2;
  if (status === "Needs Review") return 1;
  return 0;
}

function missionStatusForAggregate(status: MissionControlStatus | CeoCardStateStatus | undefined): MissionControlStatus | undefined {
  if (!status) return undefined;
  if (status === "Blocked") return "Failed";
  if (status === "Parked" || status === "Idle") return "Pass";
  return status;
}

function worstStatus(...statuses: Array<MissionControlStatus | CeoCardStateStatus | undefined>): MissionControlStatus {
  return statuses.reduce<MissionControlStatus>((worst, status) => {
    const normalized = missionStatusForAggregate(status);
    if (!normalized) return worst;
    return statusRank(normalized) > statusRank(worst) ? normalized : worst;
  }, "Pass");
}

function laneHref(laneId: MissionLaneId): Route {
  if (laneId === "ceo") return "/architect" as Route;
  return `/architect/${laneId === "content_community" ? "content-community" : laneId}` as Route;
}

function departmentLaneId(department: string): MissionLaneId {
  if (department === "Product") return "product";
  if (department === "Technology") return "technology";
  if (department === "Operations") return "operations";
  if (department === "Finance") return "finance";
  if (department === "Marketing") return "marketing";
  if (department === "Compliance") return "compliance";
  if (department === "Security") return "security";
  if (department === "Content & Community") return "content_community";
  return "technology";
}

function officerLaneForCard(card: CompactCeoCard | MissionEvidenceCard): MissionLaneId {
  const id = card.id.toLowerCase();
  const label = card.label.toLowerCase();
  const workflow = "workflow" in card ? card.workflow.toLowerCase() : "";
  const combined = `${id} ${label} ${workflow}`;

  if (combined.includes("payment") || combined.includes("refund") || combined.includes("payout") || combined.includes("routing") || combined.includes("fee") || combined.includes("money")) {
    return "finance";
  }
  if (combined.includes("rls") || combined.includes("security") || combined.includes("unsafe") || combined.includes("access")) {
    return "security";
  }
  if (combined.includes("role") || combined.includes("trust") || combined.includes("verification") || combined.includes("audit")) {
    return "compliance";
  }
  if (combined.includes("deploy") || combined.includes("regression") || combined.includes("source") || combined.includes("build") || combined.includes("test") || combined.includes("api") || combined.includes("schema")) {
    return "technology";
  }
  if (combined.includes("client") || combined.includes("booking") || combined.includes("culture") || combined.includes("feature")) {
    return "product";
  }
  if (combined.includes("barber") || combined.includes("owner") || combined.includes("appointment") || combined.includes("calendar") || combined.includes("shop") || combined.includes("relationship") || combined.includes("kiosk")) {
    return "operations";
  }
  if (combined.includes("content") || combined.includes("community") || combined.includes("comment")) {
    return "content_community";
  }

  return "department" in card ? departmentLaneId(card.department) : "technology";
}

function departmentForLane(laneId: MissionLaneId): MissionDepartmentLane["label"] {
  if (laneId === "product") return "Product";
  if (laneId === "technology") return "Technology";
  if (laneId === "operations") return "Operations";
  if (laneId === "finance") return "Finance";
  if (laneId === "marketing") return "Marketing";
  if (laneId === "compliance") return "Compliance";
  if (laneId === "security") return "Security";
  if (laneId === "content_community") return "Content & Community";
  return "CEO";
}

function evidenceSourceForCard(evidence: string[]) {
  const connectedRows = evidence.filter((row) => !row.toLowerCase().includes("no connected evidence"));
  return connectedRows.length ? connectedRows.slice(0, 2).join(" | ") : "Not connected";
}

function countEvidenceRows(evidence: string[], tokens: string[]) {
  return evidence.filter((row) => {
    const normalized = row.toLowerCase();
    return tokens.some((token) => normalized.includes(token));
  }).length;
}

function countMissingProofRows(evidence: string[]) {
  return countEvidenceRows(evidence, ["not connected", "missing", "has not been inspected", "needs review", "incomplete"]);
}

function countFailedProofRows(evidence: string[]) {
  return countEvidenceRows(evidence, ["failed", "blocked", "unsafe", "disabled", "drift", "missing required"]);
}

function stateTypeFromStatus(status: CeoCardStateStatus): CeoCardStateType {
  if (status === "Pass") return "pass_evidence";
  if (status === "Parked") return "parked_future";
  if (status === "Idle") return "idle_no_action";
  if (status === "Blocked") return "blocked_requires_repair";
  if (status === "Failed") return "failed_evidence";
  return "needs_proof";
}

function requiredActionForState(label: string, stateType: CeoCardStateType, nextLane: MissionLaneId) {
  if (stateType === "pass_evidence") return `Keep ${label} monitored from connected evidence.`;
  if (stateType === "parked_future") return `${label} is parked by design and should stay neutral until promoted into active scope.`;
  if (stateType === "idle_no_action") return `${label} has no active work item. Leave it idle unless a required incident or packet appears.`;
  if (stateType === "blocked_requires_repair") return `Open ${departmentForLane(nextLane)} and plan the controlled prerequisite repair before expecting this card to go green.`;
  if (stateType === "failed_evidence") return `Open ${departmentForLane(nextLane)} and repair the failed evidence before release readiness can improve.`;
  return `Open ${departmentForLane(nextLane)} and connect the missing proof required for this card.`;
}

function reasonForState(label: string, status: CeoCardStateStatus, stateType: CeoCardStateType, summary: string) {
  if (stateType === "pass_evidence") return `${label} has connected evidence currently supporting Pass.`;
  if (stateType === "parked_future") return `${label} is intentionally parked/future and is not expected to be active for V1.`;
  if (stateType === "idle_no_action") return `${label} has no active packet, incident, or action requirement.`;
  if (stateType === "blocked_requires_repair") return `${label} is blocked by a controlled prerequisite: ${summary}`;
  if (stateType === "failed_evidence") return `${label} has failed evidence: ${summary}`;
  return `${label} needs proof before it can be treated as green: ${summary}`;
}

function buildCeoStateSemantics(input: {
  id: string;
  label: string;
  status: CeoCardStateStatus;
  underlyingStatus: MissionControlStatus;
  summary: string;
  evidence: string[];
  href?: Route;
  stateType?: CeoCardStateType;
  v1Blocking?: boolean;
  reason?: string;
  requiredAction?: string;
  nextOfficerLane?: MissionLaneId;
}): CeoCardStateSemantics {
  const nextOfficerLane = input.nextOfficerLane ?? officerLaneForCard({
    id: input.id,
    label: input.label,
    status: input.underlyingStatus,
    department: "CEO",
    workflow: input.label,
    summary: input.summary,
    evidence: input.evidence
  });
  const stateType = input.stateType ?? stateTypeFromStatus(input.status);
  const v1Blocking = input.v1Blocking ?? (
    stateType === "failed_evidence"
    || stateType === "blocked_requires_repair"
    || (stateType === "needs_proof" && input.underlyingStatus !== "Pass")
  );
  let openLaneTarget = laneHref(nextOfficerLane);
  if (input.href) {
    openLaneTarget = input.href;
  }

  return {
    cardId: input.id,
    label: input.label,
    officerOwner: departmentForLane(nextOfficerLane),
    currentStatus: input.status,
    intendedStateType: stateType,
    reason: input.reason ?? reasonForState(input.label, input.status, stateType, input.summary),
    evidenceSource: evidenceSourceForCard(input.evidence),
    missingProofCount: stateType === "parked_future" || stateType === "idle_no_action" ? 0 : countMissingProofRows(input.evidence),
    failedProofCount: stateType === "parked_future" || stateType === "idle_no_action" ? 0 : countFailedProofRows(input.evidence),
    v1Blocking,
    requiredAction: input.requiredAction ?? requiredActionForState(input.label, stateType, nextOfficerLane),
    nextOfficerLane,
    openLaneTarget
  };
}

function labelForLane(foundation: MissionControlFoundation, laneId: MissionLaneId) {
  return foundation.departmentLanes.find((lane) => lane.id === laneId)?.label ?? (
    laneId === "content_community" ? "Content & Community" : laneId.replace(/_/g, " ")
  );
}

function buildOfficerBlockerGroups(foundation: MissionControlFoundation, blockers: Array<CompactCeoCard | MissionEvidenceCard>): CeoOfficerBlockerGroup[] {
  const groups = new Map<MissionLaneId, Array<CompactCeoCard | MissionEvidenceCard>>();

  blockers.forEach((blocker) => {
    const laneId = officerLaneForCard(blocker);
    if (!OFFICER_LANE_IDS.includes(laneId)) return;
    const existing = groups.get(laneId) ?? [];
    existing.push(blocker);
    groups.set(laneId, existing);
  });

  return Array.from(groups.entries())
    .map(([laneId, groupBlockers]) => ({
      laneId,
      label: labelForLane(foundation, laneId),
      status: worstStatus(...groupBlockers.map((blocker) => blocker.status)),
      href: laneHref(laneId),
      failedCount: groupBlockers.filter((blocker) => blocker.status === "Failed").length,
      needsReviewCount: groupBlockers.filter((blocker) => blocker.status === "Needs Review").length,
      criticalBlockerCount: groupBlockers.filter((blocker) => "criticality" in blocker && blocker.criticality === "critical").length,
      blockers: groupBlockers.slice(0, 4)
    }))
    .sort((a, b) => statusRank(b.status) - statusRank(a.status) || b.criticalBlockerCount - a.criticalBlockerCount || b.blockers.length - a.blockers.length);
}

function getRuntimeProofGroupsForLane(laneId: MissionLaneId, groups: V1RuntimeProofGroup[]) {
  const ownedGroupIds = RUNTIME_PROOF_GROUPS_BY_LANE[laneId] ?? [];
  if (!ownedGroupIds.length) return [];
  return groups.filter((group) => ownedGroupIds.includes(group.id));
}

function buildOfficerStatusSummaries(
  foundation: MissionControlFoundation,
  runtimeProofGroups: V1RuntimeProofGroup[],
  blockerGroups: CeoOfficerBlockerGroup[]
): CeoOfficerStatusSummary[] {
  return OFFICER_LANE_IDS.map((laneId) => {
    const lane = foundation.departmentLanes.find((candidate) => candidate.id === laneId);
    const blockers = blockerGroups.find((group) => group.laneId === laneId);
    const greenGate: OfficerGreenGate | undefined = foundation.officerGreenGates?.find((gate) => gate.laneId === laneId);
    const ownedProofGroups = getRuntimeProofGroupsForLane(laneId, runtimeProofGroups);
    const laneCards = lane?.cards ?? [];
    const failedCount = greenGate?.failedEvidenceCount ?? (laneCards.filter((card) => card.status === "Failed").length + (blockers?.failedCount ?? 0));
    const needsReviewCount = greenGate?.missingEvidenceCount ?? (laneCards.filter((card) => card.status === "Needs Review").length + (blockers?.needsReviewCount ?? 0));
    const proofConnected = typeof greenGate?.proofConnected === "boolean"
      ? greenGate.proofConnected
      : ownedProofGroups.length > 0
      ? ownedProofGroups.every((group) => group.proofConnected)
      : laneCards.some((card) => card.evidence.length > 0);

    return {
      laneId,
      label: String(lane?.label ?? labelForLane(foundation, laneId)),
      status: worstStatus(greenGate?.status, lane?.status, blockers?.status, ...ownedProofGroups.map((group) => group.status)),
      href: laneHref(laneId),
      failedCount,
      needsReviewCount,
      criticalBlockerCount: blockers?.criticalBlockerCount ?? 0,
      proofConnected,
      blockerReasons: greenGate?.blockerReasons ?? []
    };
  });
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

function displayRiskMeaning(label: string, status: CeoCardStateStatus) {
  if (status === "Parked") {
    return `${label} is intentionally parked. It should stay visible but neutral until the roadmap promotes it into active V1 scope.`;
  }
  if (status === "Idle") {
    return `${label} has no active work item. Idle is neutral and should not be counted as missing proof.`;
  }
  if (status === "Blocked") {
    return `${label} cannot go green until the mapped officer handles the prerequisite repair or approval gate.`;
  }
  return riskMeaning(label, status);
}

function isCriticalChecklistItem(id: string) {
  return CEO_CHECKLIST_IDS.has(id);
}

function passRequirement(label: string) {
  return `${label} must report Pass from connected, role-safe evidence. Missing evidence stays Needs Review, and failed evidence stays Failed.`;
}

function currentTruth(label: string, status: CeoCardStateStatus, value: string, summary: string) {
  return `${label} is currently ${status}. Current value: ${value}. ${summary}`;
}

function missingOrFailed(label: string, status: CeoCardStateStatus, value: string, summary: string) {
  if (status === "Pass") {
    return `No missing or failed evidence is reported for ${label}. Continue monitoring before release decisions.`;
  }
  if (status === "Parked") {
    return `${label} is parked/future by design and does not need active V1 proof yet.`;
  }
  if (status === "Idle") {
    return `${label} has no active packet, incident, or task requirement.`;
  }
  if (status === "Blocked") {
    return `${label} is blocked by a controlled prerequisite: ${summary}`;
  }

  if (status === "Failed") {
    return `${label} has failed evidence: ${summary}`;
  }

  if (value === "Not connected") {
    return `${label} is missing required connected evidence. This cannot be counted as Pass.`;
  }

  return `${label} needs review before it can be counted as Pass: ${summary}`;
}

function nextChecklistAction(label: string, status: CeoCardStateStatus) {
  if (status === "Pass") {
    return `Keep ${label} monitored and revalidate it before launch gates.`;
  }
  if (status === "Parked") {
    return `Leave ${label} parked until it becomes active product scope.`;
  }
  if (status === "Idle") {
    return `No action is required for ${label} unless new incident evidence appears.`;
  }
  if (status === "Blocked") {
    return `Open the mapped officer lane and clear the blocking prerequisite before expecting ${label} to go green.`;
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
  displayStatus?: CeoCardStateStatus;
  stateType?: CeoCardStateType;
  v1Blocking?: boolean;
  stateReason?: string;
  requiredAction?: string;
  nextOfficerLane?: MissionLaneId;
  value?: string;
  summary?: string;
  explanation?: string;
  evidence?: string[];
  riskMeaning?: string;
  chartPoints?: CeoChartPoint[];
  href?: Route;
  actionLabel?: string;
}): CompactCeoCard {
  const underlyingStatus = input.status ?? "Needs Review";
  const status = input.displayStatus ?? underlyingStatus;
  const summary = input.summary ?? "Missing data remains Needs Review.";
  const evidence = input.evidence?.length ? input.evidence : ["No connected evidence source for this card yet."];
  const stateSemantics = buildCeoStateSemantics({
    id: input.id,
    label: input.label,
    status,
    underlyingStatus,
    summary,
    evidence,
    href: input.href,
    stateType: input.stateType,
    v1Blocking: input.v1Blocking,
    reason: input.stateReason,
    requiredAction: input.requiredAction,
    nextOfficerLane: input.nextOfficerLane
  });

  return {
    id: input.id,
    label: input.label,
    status,
    underlyingStatus,
    value: input.value ?? "Not connected",
    summary,
    explanation: input.explanation ?? summary,
    evidence,
    riskMeaning: input.riskMeaning ?? displayRiskMeaning(input.label, status),
    critical: isCriticalChecklistItem(input.id),
    passRequirement: passRequirement(input.label),
    currentTruth: currentTruth(input.label, status, input.value ?? "Not connected", summary),
    missingOrFailed: missingOrFailed(input.label, status, input.value ?? "Not connected", summary),
    nextAction: nextChecklistAction(input.label, status),
    chartPoints: input.chartPoints,
    href: input.href,
    actionLabel: input.actionLabel,
    stateSemantics
  };
}

function readinessFromFoundationBreakdown(breakdown: MissionReadinessBreakdown): CeoReadinessSummary {
  return {
    overallStatus: breakdown.overallStatus,
    passCount: breakdown.v1RequiredPassCount,
    failedCount: breakdown.v1RequiredFailedCount,
    needsReviewCount: breakdown.v1RequiredNeedsReviewCount,
    totalCount: breakdown.v1RequiredTotalCount,
    readinessPercent: breakdown.v1ReadinessPercent,
    futureParkedCount: breakdown.futureParkedCount,
    criticalBlockers: breakdown.currentReleaseBlockers.filter((card) => card.criticality === "critical" && card.status === "Failed"),
    missingRequiredEvidence: breakdown.currentReleaseBlockers.filter((card) => card.criticality === "critical" && card.status !== "Pass" && card.status !== "Failed"),
    currentReleaseBlockers: breakdown.currentReleaseBlockers,
    evidenceGaps: breakdown.evidenceGaps,
    nextFoundationBlockers: breakdown.nextFoundationBlockers
  };
}

function buildCompactCeoCards(foundation: MissionControlFoundation, snapshot: MissionControlSnapshot, selectedIncident: ArchitectIncident | null): CompactCeoCard[] {
  const runtimeProofMatrix = foundation.v1RuntimeProofMatrix ?? buildV1RuntimeProofMatrix(foundation.ceoCommandCenter, foundation.departmentLanes, foundation.coreLoopValidators);
  const readiness = foundation.readinessBreakdown
    ?? buildMissionReadinessBreakdown(foundation.ceoCommandCenter, foundation.departmentLanes, foundation.coreLoopValidators, runtimeProofMatrix);
  const platformGate = foundation.officerGreenGates?.find((gate) => gate.id === "platform_health");
  const platformHealthStatus = platformGate?.status ?? readiness.overallStatus;
  const platform = findCeoCard(foundation, "overall-platform-status");
  const money = findCeoCard(foundation, "ceo-platform-fees");
  const totalUsers = findCeoCard(foundation, "ceo-total-users");
  const clients = findCeoCard(foundation, "ceo-clients-total");
  const barbers = findCeoCard(foundation, "ceo-barbers-total");
  const owners = findCeoCard(foundation, "ceo-shop-owners-total");
  const bookings = findCeoCard(foundation, "ceo-total-bookings");
  const todayBookings = findCeoCard(foundation, "ceo-todays-bookings");
  const payments = findCeoCard(foundation, "ceo-payments-captured");
  const refundCount = findCeoCard(foundation, "ceo-refund-count");
  const totalRefunded = findCeoCard(foundation, "ceo-total-refunded");
  const failedRefundAttempts = findCeoCard(foundation, "ceo-failed-refund-attempts");
  const activeRefundBlockers = findCeoCard(foundation, "ceo-active-refund-blockers");
  const lastRefundTimestamp = findCeoCard(foundation, "ceo-last-refund-timestamp");
  const routing = findCeoCard(foundation, "ceo-payment-routing-health");
  const payout = findCeoCard(foundation, "ceo-payout-readiness-health");
  const culture = findCeoCard(foundation, "ceo-culture-health");
  const shops = findCeoCard(foundation, "ceo-active-shops");
  const activeBarbers = findCeoCard(foundation, "ceo-active-barbers");
  const incidents = findCeoCard(foundation, "critical-incidents") ?? findCeoCard(foundation, "ceo-critical-incidents");
  const deployment = findCeoCard(foundation, "ceo-regression-deployment-health");
  const sourceVault = findCeoCard(foundation, "source-vault-status");
  const unsafeActions = foundation.actionRegistry.filter((action) => action.riskClass === "Unsafe / blocked");
  const unsafeBlocked = unsafeActions.length > 0 && unsafeActions.every((action) => !action.allowed);
  const packetCount = Object.keys(snapshot.packets ?? {}).length;
  const selectedPacket = selectedIncident ? snapshot.packets[selectedIncident.id]?.codexPacket : null;
  const packetRequired = Boolean(selectedIncident);
  const criticalIncidentScanConnected = Boolean(snapshot.checkedAt || incidents?.evidence.some((row) => row.toLowerCase().includes("incident detector")));
  const criticalIncidentCount = snapshot.incidents.filter((incident) => incident.severity === "critical").length;
  const criticalIncidentsStatus: MissionControlStatus = incidents?.status === "Failed"
    ? "Failed"
    : criticalIncidentScanConnected && criticalIncidentCount === 0
      ? "Pass"
      : "Needs Review";
  const sourceVaultSummary = foundation.sourceVaultInventory?.summary ?? null;
  const sourceVaultBlocked = Boolean(sourceVaultSummary && sourceVaultSummary.v1RequiredMissingCount > 0);
  const sourceVaultEvidence = foundation.sourceVaultInventory
    ? [
        `totalSourcesRegistered=${foundation.sourceVaultInventory.summary.totalSourcesRegistered}`,
        `ingestedMetadataCount=${foundation.sourceVaultInventory.summary.ingestedMetadataCount}`,
        `missingRequiredSourceCount=${foundation.sourceVaultInventory.summary.missingRequiredSourceCount}`,
        `privateSourceRequiredCount=${foundation.sourceVaultInventory.summary.privateSourceRequiredCount}`,
        `privateMetadataConnectedCount=${foundation.sourceVaultInventory.summary.privateMetadataConnectedCount}`,
        `privateMetadataMissingCount=${foundation.sourceVaultInventory.summary.privateMetadataMissingCount}`,
        `contentExposedCount=${foundation.sourceVaultInventory.summary.contentExposedCount}`,
        `parkedFutureSourceCount=${foundation.sourceVaultInventory.summary.parkedFutureSourceCount}`,
        foundation.sourceVaultInventory.privacyWarning
      ]
    : foundation.sourceVault.slice(0, 5).map((source) => `${source.sourceName}: ${source.status}; ${source.ingestionStatus}.`);
  const actionRegistryEvidence = unsafeActions.length
    ? unsafeActions.slice(0, 5).map((action) => `${action.label}: ${action.allowed ? "allowed" : "blocked"} (${action.riskClass}).`)
    : ["No unsafe action registry rows are connected."];
  const hiveEvidence = [
    ...getOfficerCleanupEvidence(foundation.agentRegistry),
    ...foundation.agentRegistry.slice(0, 3).map((agent) => `${agent.name}: ${agent.agentClass ?? "Agent"}; ${agent.autonomyLevel}; ${agent.currentStatus}.`)
  ];
  const codexPacketEvidence = selectedIncident
    ? selectedIncident.evidence.concat(`Selected incident: ${selectedIncident.headline}`)
    : ["No active incident packet is selected."];
  const refundMetrics = snapshot.financeEvidence?.refundMetrics ?? null;
  const refundEvidenceStatus: MissionControlStatus = refundMetrics
    ? refundMetrics.activeUnresolvedRefundBlockerCount > 0 || refundMetrics.failedRefundAttemptCount > 0
      ? "Failed"
      : refundMetrics.refundCount > 0 && refundMetrics.lastRefundTimestamp
        ? "Pass"
        : "Needs Review"
    : worstStatus(refundCount?.status, totalRefunded?.status, failedRefundAttempts?.status, activeRefundBlockers?.status, lastRefundTimestamp?.status);
  const refundEvidenceValue = refundMetrics
    ? `${refundMetrics.refundCount} / ${formatRefundMoney(refundMetrics.totalRefundedAmount)}`
    : `${metricValue(refundCount)} / ${metricValue(totalRefunded)}`;
  const refundEvidenceSummary = refundMetrics
    ? `Active refund blockers: ${refundMetrics.activeUnresolvedRefundBlockerCount}. Failed refund attempts: ${refundMetrics.failedRefundAttemptCount}. Last refund: ${refundMetrics.lastRefundTimestamp ?? "Not connected"}.`
    : `Active blockers: ${metricValue(activeRefundBlockers)}. Failed attempts: ${metricValue(failedRefundAttempts)}. Last refund: ${metricValue(lastRefundTimestamp)}.`;
  const refundEvidenceRows = refundMetrics
    ? [
        `refundCount=${refundMetrics.refundCount}`,
        `totalRefunded=${formatRefundMoney(refundMetrics.totalRefundedAmount)}`,
        `failedRefundAttemptCount=${refundMetrics.failedRefundAttemptCount}`,
        `activeUnresolvedRefundBlockerCount=${refundMetrics.activeUnresolvedRefundBlockerCount}`,
        `lastRefundTimestamp=${refundMetrics.lastRefundTimestamp ?? "Not connected"}`
      ]
    : cardEvidence(refundCount, totalRefunded, failedRefundAttempts, activeRefundBlockers, lastRefundTimestamp);

  return [
    compactCard({
      id: "platform-health",
      label: "Platform Health",
      status: platformHealthStatus,
      value: platformHealthStatus,
      summary: platformGate
        ? platformGate.summary
        : readiness.overallStatus === "Failed"
          ? "Required officer evidence includes failed blockers. Platform Health inherits the worst V1-required officer state."
          : metricSummary(platform),
      evidence: [
        ...(platformGate?.evidenceSources ?? []),
        ...(platformGate?.blockerReasons.map((reason) => `Blocker: ${reason}`) ?? []),
        ...cardEvidence(platform),
        `v1RequiredFailedCount=${readiness.v1RequiredFailedCount}`,
        `v1RequiredNeedsReviewCount=${readiness.v1RequiredNeedsReviewCount}`
      ],
      href: "/architect/technology",
      stateType: platformHealthStatus === "Failed" ? "failed_evidence" : platformHealthStatus === "Pass" ? "pass_evidence" : "needs_proof",
      requiredAction: platformHealthStatus === "Failed"
        ? "Open the failed officer lanes and clear V1-required blockers before Platform Health can go green."
        : platformHealthStatus === "Needs Review"
          ? "Connect missing, stale, or incomplete upstream Platform Health proof before this can go green."
        : undefined,
      nextOfficerLane: platformHealthStatus === "Failed"
        ? officerLaneForCard(readiness.currentReleaseBlockers.find((card) => card.status === "Failed") ?? platform ?? {
            id: "platform-health",
            label: "Platform Health",
            department: "CEO",
            workflow: "Global Health",
            status: "Failed",
            summary: "Required officer evidence includes failed blockers.",
            evidence: []
          })
        : "technology"
    }),
    compactCard({ id: "money-revenue", label: "Money / App Revenue", status: money?.status, value: metricValue(money), summary: metricSummary(money), evidence: cardEvidence(money), href: "/architect/finance" }),
    compactCard({ id: "total-users", label: "Total Users", status: totalUsers?.status, value: metricValue(totalUsers), summary: metricSummary(totalUsers), evidence: cardEvidence(totalUsers), href: "/architect/product" }),
    compactCard({ id: "clients", label: "Clients", status: clients?.status, value: metricValue(clients), summary: metricSummary(clients), evidence: cardEvidence(clients), href: "/architect/product" }),
    compactCard({ id: "barbers", label: "Barbers", status: barbers?.status, value: metricValue(barbers), summary: metricSummary(barbers), evidence: cardEvidence(barbers), href: "/architect/operations" }),
    compactCard({ id: "shop-owners", label: "Shop Owners", status: owners?.status, value: metricValue(owners), summary: metricSummary(owners), evidence: cardEvidence(owners), href: "/architect/operations" }),
    compactCard({ id: "bookings", label: "Bookings", status: worstStatus(bookings?.status, todayBookings?.status), value: metricValue(bookings), summary: `Today: ${metricValue(todayBookings)}. ${metricSummary(bookings)}`, evidence: cardEvidence(bookings, todayBookings), href: "/architect/operations" }),
    compactCard({ id: "payments", label: "Payments", status: payments?.status, value: metricValue(payments), summary: metricSummary(payments), evidence: cardEvidence(payments), href: "/architect/finance" }),
    compactCard({
      id: "refund-evidence",
      label: "Refund Evidence",
      status: refundEvidenceStatus,
      value: refundEvidenceValue,
      summary: refundEvidenceSummary,
      evidence: refundEvidenceRows,
      href: "/architect/finance"
    }),
    compactCard({ id: "routing-payout", label: "Routing / Payout Readiness", status: worstStatus(routing?.status, payout?.status), value: `${metricValue(routing)} / ${metricValue(payout)}`, summary: "Payment routing and payout readiness stay separated from money mutation.", evidence: cardEvidence(routing, payout), href: "/architect/finance" }),
    compactCard({ id: "culture", label: "Culture", status: culture?.status, value: metricValue(culture), summary: metricSummary(culture), evidence: cardEvidence(culture), href: "/architect/content-community" }),
    compactCard({ id: "active-supply", label: "Active Shops / Active Barbers", status: worstStatus(shops?.status, activeBarbers?.status), value: `${metricValue(shops)} / ${metricValue(activeBarbers)}`, summary: "Active supply is read from shop and barber evidence.", evidence: cardEvidence(shops, activeBarbers), href: "/architect/operations" }),
    compactCard({
      id: "critical-incidents",
      label: "Critical Incidents",
      status: criticalIncidentsStatus,
      value: String(criticalIncidentCount),
      summary: criticalIncidentsStatus === "Pass"
        ? "Incident scan evidence is connected and reports zero critical incidents."
        : metricSummary(incidents),
      evidence: cardEvidence(incidents),
      href: "/architect/technology",
      stateType: criticalIncidentsStatus === "Pass" ? "pass_evidence" : criticalIncidentsStatus === "Failed" ? "failed_evidence" : "needs_proof"
    }),
    compactCard({ id: "deployment-regression", label: "Deployment / Regression", status: deployment?.status, value: metricValue(deployment), summary: metricSummary(deployment), evidence: cardEvidence(deployment), href: "/architect/technology" }),
    compactCard({
      id: "source-vault",
      label: "Source Vault",
      status: sourceVault?.status,
      displayStatus: sourceVaultBlocked ? "Blocked" : sourceVault?.status,
      value: sourceVaultSummary ? `${sourceVaultSummary.v1RequiredSourceCount} V1 / ${sourceVaultSummary.v1RequiredMissingCount} missing` : `${foundation.sourceVault.length} registered`,
      summary: sourceVaultSummary
        ? `Metadata only. Private required: ${sourceVaultSummary.privateSourceRequiredCount}. Parked/future: ${sourceVaultSummary.parkedFutureSourceCount}.`
        : "Sources are registered, not ingested.",
      evidence: sourceVaultEvidence,
      href: "/architect/technology",
      stateType: sourceVaultBlocked ? "blocked_requires_repair" : undefined,
      v1Blocking: sourceVaultBlocked,
      requiredAction: sourceVaultBlocked
        ? "Open Technology and connect the missing required V1 Source Vault metadata before this card can become green."
        : undefined,
      nextOfficerLane: "technology"
    }),
    compactCard({ id: "action-registry", label: "Action Registry", status: unsafeBlocked ? "Pass" : "Failed", value: unsafeBlocked ? "Unsafe blocked" : "Review needed", summary: `${unsafeActions.length} unsafe action(s) blocked by registry.`, evidence: actionRegistryEvidence, href: "/architect/security" }),
    compactCard({
      id: "hive-ai",
      label: "Hive AI",
      status: "Needs Review",
      displayStatus: "Parked",
      value: `${foundation.agentRegistry.length} agents`,
      summary: "Hive AI is intentionally parked/future. Level 0/1 officer assistants remain read-only or draft-only.",
      evidence: hiveEvidence,
      href: "/architect/technology",
      stateType: "parked_future",
      v1Blocking: false,
      stateReason: "AI is intentionally not active and must not reduce V1 readiness.",
      requiredAction: "Do not activate Hive AI until evidence, audit, RLS, role truth, and deployment foundations are clean.",
      nextOfficerLane: "technology"
    }),
    compactCard({
      id: "codex-packets",
      label: "Codex Packets",
      status: selectedPacket ? "Pass" : packetRequired ? "Needs Review" : "Pass",
      displayStatus: selectedPacket ? "Pass" : packetRequired ? "Needs Review" : "Idle",
      value: `${packetCount} packet(s)`,
      summary: selectedPacket
        ? "Codex packet is available for the selected incident."
        : packetRequired
          ? "An incident is selected but no Codex packet is connected."
          : "No active incident requires a Codex packet.",
      evidence: codexPacketEvidence,
      href: "/architect/technology",
      actionLabel: selectedPacket ? "Copy Codex Packet" : undefined,
      stateType: selectedPacket ? "pass_evidence" : packetRequired ? "needs_proof" : "idle_no_action",
      v1Blocking: packetRequired && !selectedPacket,
      stateReason: selectedPacket
        ? "A packet exists for the selected incident."
        : packetRequired
          ? "The selected incident requires packet evidence before this can be green."
          : "Zero active packets is idle because no incident currently requires one.",
      requiredAction: packetRequired && !selectedPacket
        ? "Open Technology and generate the missing Codex packet for the selected incident."
        : "No packet action is required until an incident requires one.",
      nextOfficerLane: "technology"
    })
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
              className="w-full rounded-t-[8px] border border-[#C4F24E]/22 bg-[#C4F24E]/18"
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
      className="flex min-h-[8rem] cursor-pointer flex-col justify-between rounded-[18px] border border-white/8 bg-black/24 p-4 text-left shadow-[0_18px_42px_rgba(0,0,0,0.20)] transition hover:border-[#C4F24E]/18 hover:bg-white/[0.035] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C4F24E]/55"
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
        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/34">
          {card.stateSemantics.intendedStateType.replace(/_/g, " ")}
        </p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {card.href ? (
          <Link
            href={card.href}
            className="text-[10px] font-black uppercase tracking-[0.16em] text-[#e4f9b8] hover:text-white"
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

function buildGreenQueue(cards: CompactCeoCard[]): CeoGreenQueueBucket[] {
  const buckets: CeoGreenQueueBucket[] = [
    { id: "already_green", label: "Already Green", summary: "Connected evidence currently supports Pass.", cards: [] },
    { id: "parked_idle", label: "Parked / Idle by design", summary: "Neutral items that should not reduce V1 readiness.", cards: [] },
    { id: "needs_proof", label: "Needs Proof", summary: "Missing, stale, or disconnected evidence needs officer inspection.", cards: [] },
    { id: "needs_repair", label: "Needs Repair", summary: "Failed evidence needs a controlled repair plan.", cards: [] },
    { id: "blocked", label: "Blocked / Approval Required", summary: "A prerequisite, approval, migration, or controlled repair must happen first.", cards: [] }
  ];
  const byId = new Map(buckets.map((bucket) => [bucket.id, bucket]));

  cards.forEach((card) => {
    const stateType = card.stateSemantics.intendedStateType;
    if (stateType === "pass_evidence") byId.get("already_green")?.cards.push(card);
    else if (stateType === "parked_future" || stateType === "idle_no_action") byId.get("parked_idle")?.cards.push(card);
    else if (stateType === "needs_proof") byId.get("needs_proof")?.cards.push(card);
    else if (stateType === "blocked_requires_repair") byId.get("blocked")?.cards.push(card);
    else byId.get("needs_repair")?.cards.push(card);
  });

  return buckets;
}

function CeoGreenQueue({ cards }: { cards: CompactCeoCard[] }) {
  const buckets = buildGreenQueue(cards);

  return (
    <article className="rounded-[22px] border border-white/8 bg-black/24 p-4 shadow-[0_18px_48px_rgba(0,0,0,0.22)] sm:p-5" data-testid="ceo-green-queue">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#C4F24E]">Green Queue</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">Officer-owned path to green or neutral</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/62">
            Compact card-state queue. It shows what is already green, what is neutral by design, what needs proof, what needs repair, and what is blocked before remediation.
          </p>
        </div>
        <span className="rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/58">
          {cards.length} card(s)
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-5">
        {buckets.map((bucket) => (
          <section key={bucket.id} className="rounded-[16px] border border-white/8 bg-black/26 p-3" data-testid={`ceo-green-queue-${bucket.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">{bucket.label}</p>
                <p className="mt-1 text-[11px] leading-5 text-white/46">{bucket.summary}</p>
              </div>
              <span className="rounded-[8px] border border-white/10 bg-white/[0.035] px-2 py-1 text-[10px] font-black text-white/62">{bucket.cards.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              {bucket.cards.length ? bucket.cards.map((card) => (
                <div key={card.id} className="rounded-[12px] border border-white/8 bg-black/24 p-2.5" data-testid={`ceo-green-queue-item-${card.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-white">{card.label}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.11em] text-white/36">{card.stateSemantics.officerOwner}</p>
                    </div>
                    <StatusPill status={card.status} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-white/52">{card.stateSemantics.requiredAction}</p>
                  <Link href={card.stateSemantics.openLaneTarget as Route} className="mt-2 inline-flex text-[10px] font-black uppercase tracking-[0.14em] text-[#e4f9b8] hover:text-white">
                    Open Officer
                  </Link>
                </div>
              )) : (
                <p className="rounded-[12px] border border-dashed border-white/10 bg-white/[0.02] p-3 text-xs leading-5 text-white/44">No cards in this state.</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

function CeoReadinessCard({
  readiness,
  officerSummaries,
  blockerGroups
}: {
  readiness: CeoReadinessSummary;
  officerSummaries: CeoOfficerStatusSummary[];
  blockerGroups: CeoOfficerBlockerGroup[];
}) {
  const headline = readiness.overallStatus === "Pass" ? "100% Pass" : readiness.overallStatus;

  return (
    <article
      data-testid="architect-ceo-readiness"
      className="rounded-[22px] border border-white/8 bg-[linear-gradient(135deg,rgba(196, 242, 78,0.10),rgba(255,255,255,0.025)_42%,rgba(0,0,0,0.24))] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.30)] sm:p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">V1 Readiness</p>
            <StatusPill status={readiness.overallStatus} />
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <p className="text-4xl font-black leading-none tracking-[-0.055em] text-white sm:text-5xl">{headline}</p>
            <p className="pb-1 text-sm font-bold text-white/54">{readiness.readinessPercent}% V1 required Pass evidence</p>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/62">
            App Readiness is version-scoped. V1 counts only required evidence cards. Future and parked scaffolds stay visible, but they do not hide or dilute current release blockers.
          </p>
          <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-white/44">Overall status</p>
        </div>

        <div className="grid min-w-full gap-2 sm:grid-cols-5 lg:min-w-[42rem]">
          <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">V1 required pass</p>
            <p data-testid="ceo-readiness-pass-count" className="mt-1 text-2xl font-black text-[#e4f9b8]">{readiness.passCount}</p>
          </div>
          <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">V1 required failed</p>
            <p data-testid="ceo-readiness-failed-count" className="mt-1 text-2xl font-black text-rose-100">{readiness.failedCount}</p>
          </div>
          <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">V1 needs review</p>
            <p data-testid="ceo-readiness-needs-review-count" className="mt-1 text-2xl font-black text-amber-100">{readiness.needsReviewCount}</p>
          </div>
          <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Critical blockers</p>
            <p data-testid="ceo-readiness-critical-blockers" className="mt-1 text-2xl font-black text-white">{readiness.criticalBlockers.length}</p>
          </div>
          <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Future parked</p>
            <p data-testid="ceo-readiness-future-parked-count" className="mt-1 text-2xl font-black text-white">{readiness.futureParkedCount}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[18px] border border-white/8 bg-black/18 p-3" data-testid="ceo-blocker-summary">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Current Release Blockers</p>
              <p data-testid="ceo-readiness-current-release-blockers" className="mt-1 text-sm leading-6 text-white/62">
                {blockerGroups.length ? "Grouped by responsible officer lane." : "No V1 current release blockers reported."}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-black uppercase tracking-[0.12em] text-white/42">
              <span className="rounded-[8px] border border-white/8 bg-black/24 px-2 py-1">{readiness.failedCount} Failed</span>
              <span className="rounded-[8px] border border-white/8 bg-black/24 px-2 py-1">{readiness.needsReviewCount} Review</span>
              <span className="rounded-[8px] border border-white/8 bg-black/24 px-2 py-1">{readiness.criticalBlockers.length} Critical</span>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {blockerGroups.length ? blockerGroups.slice(0, 6).map((group) => (
              <section key={group.laneId} data-testid={`ceo-officer-blocker-${group.laneId}`} className="rounded-[14px] border border-white/8 bg-black/24 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">{group.label} officer</p>
                    <p className="mt-1 text-sm font-black text-white">{group.failedCount} failed / {group.needsReviewCount} review</p>
                  </div>
                  <StatusPill status={group.status} />
                </div>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-white/58">
                  {group.blockers.slice(0, 3).map((blocker) => (
                    <li key={blocker.id}>{blocker.label}</li>
                  ))}
                </ul>
                <Link data-testid={`ceo-officer-link-${group.laneId}`} href={group.href} className="mt-3 inline-flex min-h-9 items-center rounded-[8px] border border-[#C4F24E]/24 px-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#e4f9b8] hover:border-[#C4F24E]/50">
                  Open Officer
                </Link>
              </section>
            )) : (
              <div className="rounded-[14px] border border-white/8 bg-black/24 p-3 text-sm text-white/58">
                No release blocker group requires officer action.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-[16px] border border-white/8 bg-black/18 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Evidence Gaps</p>
            <p data-testid="ceo-readiness-evidence-gaps" className="mt-1 text-sm leading-6 text-white/62">
              {readiness.evidenceGaps.length ? `${readiness.evidenceGaps.length} V1 evidence gap(s) need officer inspection.` : "No V1 evidence gaps reported."}
            </p>
          </div>
          <div className="rounded-[16px] border border-white/8 bg-black/18 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Foundation Blockers Before AI</p>
            <p data-testid="ceo-readiness-foundation-blockers" className="mt-1 text-sm leading-6 text-white/62">
              {readiness.nextFoundationBlockers.length ? `${readiness.nextFoundationBlockers.length} foundation blocker(s) remain before AI.` : "No v2/v3 foundation blockers are release-scoped yet."}
            </p>
          </div>
          <div className="rounded-[16px] border border-white/8 bg-black/18 p-3" data-testid="ceo-officer-status-grid">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Officer Status Grid</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {officerSummaries.map((officer) => (
                <Link key={officer.laneId} href={officer.href} className="rounded-[12px] border border-white/8 bg-black/24 p-3 hover:border-[#C4F24E]/26">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-black text-white">{officer.label}</p>
                      <p className="mt-1 text-[11px] text-white/48">
                        {officer.failedCount} failed / {officer.needsReviewCount} review
                      </p>
                    </div>
                    <StatusPill status={officer.status} />
                  </div>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-white/38">
                    proof connected: {officer.proofConnected ? "yes" : "no"}
                  </p>
                  {officer.blockerReasons[0] ? (
                    <p data-testid={`ceo-officer-green-gate-reason-${officer.laneId}`} className="mt-2 line-clamp-2 text-[11px] leading-5 text-white/48">
                      {officer.blockerReasons[0]}
                    </p>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function V1RuntimeProofPanel({ groups }: { groups: V1RuntimeProofGroup[] }) {
  const visibleGroups = groups.length ? groups : [];

  return (
    <article
      data-testid="v1-runtime-proof"
      className="rounded-[22px] border border-white/8 bg-black/24 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.24)] sm:p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">V1 Runtime Proof</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">Role and operating-loop proof matrix</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/62">
            Read-only proof rows show whether the current V1 Client, Barber, Shop Owner, Money, Security, Deployment, and Audit loops are connected, failing, or still missing evidence.
          </p>
        </div>
        <span className="rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/58">
          {visibleGroups.length} loop(s)
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        {visibleGroups.map((group) => (
          <section key={group.id} className="rounded-[16px] border border-white/8 bg-black/26 p-3" data-testid={`v1-proof-group-${group.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">{group.lane}</p>
                <h4 className="mt-1 text-sm font-black text-white">{group.label}</h4>
              </div>
              <StatusPill status={group.status} />
            </div>
            <dl className="mt-3 space-y-2 text-xs leading-5 text-white/58">
              <div>
                <dt className="font-black uppercase tracking-[0.12em] text-white/34">Proof connected</dt>
                <dd data-testid={`v1-proof-connected-${group.id}`} className="text-white/76">{group.proofConnected ? "yes" : "no"}</dd>
              </div>
              <div>
                <dt className="font-black uppercase tracking-[0.12em] text-white/34">Failing evidence</dt>
                <dd data-testid={`v1-proof-failing-count-${group.id}`} className="text-white/76">{group.failingEvidenceCount}</dd>
              </div>
              <div>
                <dt className="font-black uppercase tracking-[0.12em] text-white/34">Next repair lane</dt>
                <dd className="text-white/76">{group.nextRepairLane.replace("_", " ")}</dd>
              </div>
            </dl>
            <Link href={`/architect/${group.nextRepairLane === "ceo" ? "ceo" : group.nextRepairLane}` as Route} className="mt-3 inline-flex text-[10px] font-black uppercase tracking-[0.16em] text-[#e4f9b8] hover:text-white">
              Open lane
            </Link>
          </section>
        ))}
      </div>
    </article>
  );
}

function DeploymentRegressionEvidencePanel({ evidence }: { evidence?: DeploymentRegressionEvidence }) {
  const displayEvidence = evidence ?? {
    status: "Not Connected",
    expectedMainCommit: null,
    runtimeCommit: null,
    productionCommitMatchesMain: null,
    deploymentId: null,
    deploymentEnvironment: null,
    deploymentTarget: null,
    deploymentUrl: null,
    deploymentState: null,
    commitEvidenceStatus: "Not Connected",
    deploymentEvidenceStatus: "Not Connected",
    buildEvidenceStatus: "Not Connected",
    lintEvidenceStatus: "Not Connected",
    typecheckEvidenceStatus: "Not Connected",
    testEvidenceStatus: "Not Connected",
    regressionEvidenceStatus: "Not Connected",
    regressionSuiteName: null,
    regressionTestCount: null,
    validationCommand: null,
    validationSource: null,
    validationCommit: null,
    validationTimestamp: null,
    lastValidatedAt: null,
    verifiedAt: null,
    evidenceSource: "Deployment/regression evidence model is not connected.",
    evidenceFreshness: "missing",
    proofConnected: false,
    staleOrMissingState: ["Deployment/regression evidence model is not connected."],
    failingState: [],
    nextRepairLane: "technology"
  } satisfies DeploymentRegressionEvidence;
  const proofRows = [
    ["Production commit", displayEvidence.runtimeCommit ?? "Not connected"],
    ["Expected main commit", displayEvidence.expectedMainCommit ?? "Not connected"],
    ["Commit match", displayEvidence.productionCommitMatchesMain === null ? "Not connected" : displayEvidence.productionCommitMatchesMain ? "yes" : "no"],
    ["Deployment ID", displayEvidence.deploymentId ?? "Not connected"],
    ["Deployment status", displayEvidence.deploymentState ?? displayEvidence.deploymentEvidenceStatus],
    ["Deployment URL", displayEvidence.deploymentUrl ?? "Not connected"],
    ["Build evidence", displayEvidence.buildEvidenceStatus],
    ["Lint evidence", displayEvidence.lintEvidenceStatus],
    ["Typecheck evidence", displayEvidence.typecheckEvidenceStatus],
    ["Test evidence", displayEvidence.testEvidenceStatus],
    ["Validation commit", displayEvidence.validationCommit ?? "Not connected"],
    ["Validation source", displayEvidence.validationSource ?? "Not connected"],
    ["Validation command", displayEvidence.validationCommand ?? "Not connected"],
    ["Validation timestamp", displayEvidence.validationTimestamp ?? "Not connected"],
    ["Regression suite", displayEvidence.regressionSuiteName ?? "Not connected"],
    ["Regression test count", displayEvidence.regressionTestCount === null ? "Not connected" : String(displayEvidence.regressionTestCount)],
    ["Proof connected", displayEvidence.proofConnected ? "yes" : "no"],
    ["Evidence freshness", displayEvidence.evidenceFreshness],
    ["Evidence source", displayEvidence.evidenceSource],
    ["Next repair lane", displayEvidence.nextRepairLane]
  ] as const;

  return (
    <article
      data-testid="deployment-regression-evidence"
      className="rounded-[22px] border border-white/8 bg-black/24 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.24)] sm:p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">Deployment / Regression Evidence</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">Production proof connector</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/62">
            Read-only deployment proof compares expected main commit, runtime commit, deployment metadata, and validation evidence. Missing build, lint, typecheck, or test proof stays Needs Review.
          </p>
        </div>
        <StatusPill status={displayEvidence.status} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {proofRows.map(([label, value]) => (
          <div key={label} className="rounded-[16px] border border-white/8 bg-black/26 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">{label}</p>
            <p className="mt-2 break-words font-mono text-xs leading-5 text-white/76">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-[16px] border border-white/8 bg-black/18 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Missing validation gaps</p>
          <p data-testid="deployment-regression-missing-gaps" className="mt-2 text-sm leading-6 text-white/62">
            {displayEvidence.staleOrMissingState.length ? displayEvidence.staleOrMissingState.join(" ") : "No missing deployment/regression proof reported."}
          </p>
        </div>
        <div className="rounded-[16px] border border-white/8 bg-black/18 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Commit mismatch / failed evidence</p>
          <p data-testid="deployment-regression-failed-gaps" className="mt-2 text-sm leading-6 text-white/62">
            {displayEvidence.failingState.length ? displayEvidence.failingState.join(" ") : "No failed deployment/regression proof reported."}
          </p>
        </div>
      </div>
    </article>
  );
}

function AuditSpineStageSummary({ label, status }: { label: string; status: AuditSpineStatus }) {
  return (
    <div className="rounded-[14px] border border-white/8 bg-black/24 p-3" data-testid={`audit-spine-stage-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/38">{label}</p>
      <div className="mt-2">
        <StatusPill status={status} />
      </div>
    </div>
  );
}

function AuditSpineRecordCard({ record }: { record: AuditSpineRecord }) {
  return (
    <section className="rounded-[16px] border border-white/8 bg-black/26 p-3" data-testid={`audit-spine-record-${record.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">{record.lane} / {record.actorType}</p>
          <h4 className="mt-1 text-sm font-black text-white">{record.actionType.replaceAll("_", " ")}</h4>
        </div>
        <StatusPill status={record.status} />
      </div>
      <dl className="mt-3 grid gap-2 text-xs leading-5 text-white/58 sm:grid-cols-2">
        <div>
          <dt className="font-black uppercase tracking-[0.12em] text-white/34">Missing stages</dt>
          <dd className="text-white/76">{record.missingStageCount}</dd>
        </div>
        <div>
          <dt className="font-black uppercase tracking-[0.12em] text-white/34">Failing stages</dt>
          <dd className="text-white/76">{record.failingStageCount}</dd>
        </div>
        <div>
          <dt className="font-black uppercase tracking-[0.12em] text-white/34">Next repair lane</dt>
          <dd className="text-white/76">{record.nextRepairLane.replace("_", " ")}</dd>
        </div>
        <div>
          <dt className="font-black uppercase tracking-[0.12em] text-white/34">Related incident</dt>
          <dd className="text-white/76">{record.relatedIncidentCode}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs leading-5 text-white/50">
        <span className="font-black text-white/72">Evidence source:</span> {record.sourceTableOrFunction}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {record.stages.map((stage) => (
          <div key={stage.stage} className="rounded-[12px] border border-white/8 bg-white/[0.025] p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/38">{stage.label}</p>
              <StatusPill status={stage.status} />
            </div>
            <p className="mt-2 text-xs leading-5 text-white/50">{stage.evidence[0]}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AuditSpinePanel({ auditSpine }: { auditSpine?: AuditSpineModel }) {
  if (!auditSpine) {
    return (
      <article data-testid="audit-spine" className="rounded-[22px] border border-white/8 bg-black/24 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">Audit Spine</p>
            <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">Repair audit evidence is not connected</h3>
            <p className="mt-2 text-sm leading-6 text-white/62">No Audit Spine read model was returned. This remains Needs Review and cannot count as Pass.</p>
          </div>
          <StatusPill status="Not Connected" />
        </div>
      </article>
    );
  }

  return (
    <article data-testid="audit-spine" className="rounded-[22px] border border-white/8 bg-black/24 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.24)] sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">Audit Spine</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">Controlled repair evidence stages</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/62">
            Read-only coverage for approval, execution, verification, and score-impact evidence. Refund rows can prove execution, but they cannot fake full repair audit Pass.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={auditSpine.status} />
          <span className="rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/58">
            {auditSpine.records.length} action(s)
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <AuditSpineStageSummary label="Approval" status={auditSpine.summary.approvalCoverageStatus} />
        <AuditSpineStageSummary label="Execution" status={auditSpine.summary.executionCoverageStatus} />
        <AuditSpineStageSummary label="Verification" status={auditSpine.summary.verificationCoverageStatus} />
        <AuditSpineStageSummary label="Score Impact" status={auditSpine.summary.scoreImpactCoverageStatus} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-[16px] border border-white/8 bg-black/18 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Missing Stages</p>
          <p data-testid="audit-spine-missing-stage-count" className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">{auditSpine.missingStageCount}</p>
        </div>
        <div className="rounded-[16px] border border-white/8 bg-black/18 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Failing Stages</p>
          <p data-testid="audit-spine-failing-stage-count" className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">{auditSpine.failingStageCount}</p>
        </div>
        <div className="rounded-[16px] border border-white/8 bg-black/18 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Next Repair Lane</p>
          <p className="mt-1 text-sm font-black uppercase tracking-[0.12em] text-white">{auditSpine.nextRepairLane.replace("_", " ")}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        {auditSpine.records.map((record) => (
          <AuditSpineRecordCard key={record.id} record={record} />
        ))}
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
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#C4F24E]">CEO Card Detail</p>
            <h3 id="ceo-card-detail-title" className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">{card.label}</h3>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill status={card.status} />
              <span className="rounded-[8px] border border-white/10 bg-black/24 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/54">Read-only</span>
            </div>
          </div>
          <button type="button" aria-label="Close CEO card detail" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.035] text-white/70 transition hover:border-[#C4F24E]/35 hover:text-[#C4F24E]" onClick={onClose}>
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

          <section className="mt-3 rounded-[18px] border border-white/8 bg-black/24 p-4" data-testid="ceo-card-state-semantics">
            <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Card state semantics</h4>
            <div className="mt-3 grid gap-3 text-xs leading-5 text-white/62 sm:grid-cols-2">
              <p><span className="font-black text-white/84">State type:</span> {card.stateSemantics.intendedStateType.replace(/_/g, " ")}</p>
              <p><span className="font-black text-white/84">Officer owner:</span> {card.stateSemantics.officerOwner}</p>
              <p><span className="font-black text-white/84">Evidence source:</span> {card.stateSemantics.evidenceSource}</p>
              <p><span className="font-black text-white/84">V1 blocking:</span> {card.stateSemantics.v1Blocking ? "yes" : "no"}</p>
              <p><span className="font-black text-white/84">Missing proof:</span> {card.stateSemantics.missingProofCount}</p>
              <p><span className="font-black text-white/84">Failed proof:</span> {card.stateSemantics.failedProofCount}</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/68">{card.stateSemantics.reason}</p>
          </section>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <section className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">Evidence</h4>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-white/62">
                {card.evidence.slice(0, 6).map((item) => (
                  <li key={item} className="border-l border-[#C4F24E]/22 pl-3">{item}</li>
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
            <Link href={card.href} className="inline-flex min-h-11 items-center justify-center rounded-[8px] border border-[#C4F24E]/42 bg-[#C4F24E] px-5 text-sm font-black text-black shadow-[0_14px_32px_rgba(196, 242, 78,0.22)] transition hover:bg-[#e4f9b8]">
              Open Lane
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}


function ArchitectControlPlaneBoundary({ lane }: { lane: MissionDepartmentLane }) {
  return (
    <article className="rounded-[22px] border border-[#C4F24E]/14 bg-[#C4F24E]/6 p-4" data-testid="architect-control-plane-boundary">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#e4f9b8]">Control-plane boundary</p>
          <h3 className="mt-2 text-lg font-black tracking-[-0.03em] text-white">Architect detects issues before it executes actions.</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/64">
            {lane.label} cards are evidence-first issue detectors. Controlled repair actions are separate, gated, auth-bound, and must keep missing UI, missing auth, or missing environment evidence as Needs Review / Not connected.
          </p>
        </div>
        <StatusPill status="Needs Review" />
      </div>
      <div className="mt-3 grid gap-2 text-xs leading-5 text-white/56 md:grid-cols-3">
        <p><span className="font-black text-white/78">Detector:</span> reads evidence, explains risk, and generates Codex packets.</p>
        <p><span className="font-black text-white/78">Repair console:</span> requires explicit authorization, confirmation, canonical routes, and verification.</p>
        <p><span className="font-black text-white/78">Blocked:</span> missing UI/auth/env keeps the issue open; it does not become Pass.</p>
      </div>
    </article>
  );
}
function formatRefundMoney(value: number) {
  return value % 1 === 0 ? `$${value.toFixed(0)}` : `$${value.toFixed(2)}`;
}

function batchRefundConfirmation(targets: ControlledRefundTarget[]) {
  const total = targets.reduce((sum, target) => sum + target.amount, 0);
  return `REFUND ALL ${targets.length} FOR ${formatRefundMoney(total)}`;
}

function ControlledRefundResolutionSection({
  card,
  issue,
  activeTargets,
  onRefundCompleted
}: {
  card: MissionEvidenceCard;
  issue: ArchitectIssueDetail;
  activeTargets: ControlledRefundTarget[];
  onRefundCompleted?: () => Promise<void>;
}) {
  const shouldShow = shouldShowControlledRefundResolution(card, issue);
  const targets = shouldShow ? activeTargets : [];
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const [batchConfirmation, setBatchConfirmation] = useState("");
  const [batchState, setBatchState] = useState<ControlledRefundExecutionState>({ status: "idle" });
  const [executionState, setExecutionState] = useState<Record<string, ControlledRefundExecutionState>>({});

  if (!shouldShow) return null;

  if (!targets.length) {
    return (
      <section className="mt-3 rounded-[20px] border border-[#C4F24E]/22 bg-[#C4F24E]/8 p-4" data-testid="controlled-refund-resolution">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-[#e4f9b8]">Controlled refund resolution</h4>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">
              No active cancelled/captured refund targets. Refund history is available in Finance Logs.
            </p>
          </div>
          <StatusPill status="Pass" />
        </div>
      </section>
    );
  }

  function updateConfirmation(paymentId: string, value: string) {
    setConfirmations((current) => ({ ...current, [paymentId]: value }));
  }

  async function callRefundRoute(target: ControlledRefundTarget) {
    const response = await fetch(`/api/payments/${target.paymentId}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: target.amount,
        reason: target.reason,
        source: CONTROLLED_REFUND_SOURCE,
        confirmation: CONTROLLED_REFUND_CONFIRMATION,
        incidentCode: CONTROLLED_REFUND_INCIDENT_CODE
      })
    });
    return readJson<ControlledRefundResult>(response);
  }

  async function executeOneTarget(target: ControlledRefundTarget) {
    const payload = await callRefundRoute(target);
    setExecutionState((current) => ({
      ...current,
      [target.paymentId]: {
        status: "success",
        message: "Refund route completed. Refreshing Finance evidence.",
        refundId: payload.refund?.id,
        paymentStatus: payload.payment?.paymentStatus ?? payload.payment?.payment_status
      }
    }));
    return payload;
  }

  async function executeRefund(target: ControlledRefundTarget) {
    setExecutionState((current) => ({
      ...current,
      [target.paymentId]: { status: "running", message: "Calling canonical refund route." }
    }));

    try {
      await executeOneTarget(target);
      await onRefundCompleted?.();
    } catch (error) {
      setExecutionState((current) => ({
        ...current,
        [target.paymentId]: {
          status: "error",
          message: error instanceof Error ? error.message : "Refund failed. Payment Health remains Failed until evidence changes."
        }
      }));
    }
  }

  async function executeBatchRefund() {
    const expectedConfirmation = batchRefundConfirmation(targets);
    if (batchConfirmation !== expectedConfirmation) return;

    setBatchState({ status: "running", message: "Running controlled refunds sequentially." });
    let successCount = 0;

    for (const target of targets) {
      setExecutionState((current) => ({
        ...current,
        [target.paymentId]: { status: "running", message: "Calling canonical refund route." }
      }));

      try {
        await executeOneTarget(target);
        successCount += 1;
      } catch (error) {
        setExecutionState((current) => ({
          ...current,
          [target.paymentId]: {
            status: "error",
            message: error instanceof Error ? error.message : "Refund failed. Batch stopped on first failure."
          }
        }));
        setBatchState({
          status: "error",
          message: `Batch stopped after ${successCount} successful refund(s). ${error instanceof Error ? error.message : "Refund failed."}`
        });
        if (successCount > 0) await onRefundCompleted?.();
        return;
      }
    }

    setBatchState({
      status: "success",
      message: `Batch completed ${successCount} sequential refund(s). Refreshing Finance evidence.`
    });
    await onRefundCompleted?.();
  }

  const expectedBatchConfirmation = batchRefundConfirmation(targets);
  const batchTotal = targets.reduce((sum, target) => sum + target.amount, 0);
  const batchDisabled = batchConfirmation !== expectedBatchConfirmation || batchState.status === "running";

  return (
    <section className="mt-3 rounded-[20px] border border-amber-300/24 bg-amber-300/8 p-4" data-testid="controlled-refund-resolution">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">Controlled refund resolution</h4>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68">
            Approved cancelled/captured refund targets only. This calls Stripe through the canonical app refund route and does not release payouts, change appointment lifecycle, or mark Finance Pass.
          </p>
        </div>
        <StatusPill status="Needs Review" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[14px] border border-white/8 bg-black/24 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">Active targets</p>
          <p data-testid="active-refund-target-count" className="mt-1 text-2xl font-black text-white">{targets.length}</p>
        </div>
        <div className="rounded-[14px] border border-white/8 bg-black/24 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">Approved total</p>
          <p className="mt-1 text-2xl font-black text-white">{formatRefundMoney(batchTotal)}</p>
        </div>
        <div className="rounded-[14px] border border-white/8 bg-black/24 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">Execution mode</p>
          <p className="mt-2 text-xs font-bold text-white/62">One target at a time. Stop on first failure.</p>
        </div>
      </div>
      {targets.length >= 2 ? (
        <div className="mt-4 rounded-[18px] border border-white/10 bg-black/30 p-4" data-testid="controlled-batch-refund">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h5 className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">Controlled batch refund</h5>
              <p className="mt-2 text-sm leading-6 text-white/68">
                Batch action covers {targets.length} active eligible target(s), total {formatRefundMoney(batchTotal)}. It calls the canonical refund route sequentially and stops on first failure.
              </p>
            </div>
            <StatusPill status="Needs Review" />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">Type {expectedBatchConfirmation} to enable</span>
              <input
                aria-label="Type batch refund confirmation"
                className="mt-2 h-11 w-full rounded-[10px] border border-white/10 bg-black/36 px-3 font-mono text-sm text-white outline-none transition placeholder:text-white/28 focus:border-[#C4F24E]/42"
                value={batchConfirmation}
                onChange={(event) => setBatchConfirmation(event.target.value)}
                placeholder={expectedBatchConfirmation}
                disabled={batchState.status === "running"}
              />
            </label>
            <Button
              type="button"
              className="min-h-11 rounded-[8px] border border-[#C4F24E]/42 bg-[#C4F24E] px-5 text-sm font-black text-black hover:bg-[#e4f9b8] disabled:border-white/10 disabled:bg-white/10 disabled:text-[#050505]/34 bvr-on-green"
              disabled={batchDisabled}
              aria-label={`Refund all ${targets.length} active targets through canonical route`}
              onClick={() => void executeBatchRefund()}
            >
              {batchState.status === "running" ? "Refunding sequentially..." : `Refund ${targets.length} targets sequentially`}
            </Button>
          </div>
          {batchState.status === "success" || batchState.status === "error" ? (
            <div className={cn(
              "mt-3 rounded-[14px] border p-3 text-sm leading-6",
              batchState.status === "success"
                ? "border-[#C4F24E]/22 bg-[#C4F24E]/10 text-[#e4f9b8]"
                : "border-rose-400/24 bg-rose-400/10 text-rose-100"
            )}>
              {batchState.message}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4 space-y-3">
        {targets.map((target) => {
          const confirmation = confirmations[target.paymentId] ?? "";
          const state = executionState[target.paymentId] ?? { status: "idle" as const };
          const confirmationMatches = confirmation === CONTROLLED_REFUND_CONFIRMATION;
          const disabled = !confirmationMatches || state.status === "running" || state.status === "success";

          return (
            <article key={target.paymentId} className="rounded-[18px] border border-white/10 bg-black/30 p-4" data-testid={`controlled-refund-${target.paymentId}`}>
              <div className="grid gap-3 text-sm leading-6 text-white/66 md:grid-cols-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">Appointment ID</p>
                  <p className="mt-1 break-all font-mono text-xs text-white/78">{target.appointmentId}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">Payment ID</p>
                  <p className="mt-1 break-all font-mono text-xs text-white/78">{target.paymentId}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">Amount</p>
                  <p className="mt-1 font-black text-white">${target.amount.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">Current routing state</p>
                  <p className="mt-1 text-white/68">{target.currentRoutingState}</p>
                </div>
              </div>
              <div className="mt-3 rounded-[14px] border border-white/8 bg-black/22 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">Reason</p>
                <p className="mt-1 text-sm text-white/72">{target.reason}</p>
                <p className="mt-3 text-xs leading-5 text-amber-100">
                  Warning: this will call <span className="font-mono">POST /api/payments/{target.paymentId}/refund</span>. The browser UI does not call Stripe directly and does not run SQL.
                </p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">Type REFUND 5 to enable</span>
                  <input
                    aria-label={`Type REFUND 5 for payment ${target.paymentId}`}
                    className="mt-2 h-11 w-full rounded-[10px] border border-white/10 bg-black/36 px-3 font-mono text-sm text-white outline-none transition placeholder:text-white/28 focus:border-[#C4F24E]/42"
                    value={confirmation}
                    onChange={(event) => updateConfirmation(target.paymentId, event.target.value)}
                    placeholder={CONTROLLED_REFUND_CONFIRMATION}
                    disabled={state.status === "running" || state.status === "success"}
                  />
                </label>
                <Button
                  type="button"
                  className="min-h-11 rounded-[8px] border border-[#C4F24E]/42 bg-[#C4F24E] px-5 text-sm font-black text-black hover:bg-[#e4f9b8] disabled:border-white/10 disabled:bg-white/10 disabled:text-[#050505]/34 bvr-on-green"
                  disabled={disabled}
                  aria-label={`Refund $5 through canonical route for payment ${target.paymentId}`}
                  onClick={() => void executeRefund(target)}
                >
                  {state.status === "running" ? "Refunding..." : "Refund $5 through canonical route"}
                </Button>
              </div>
              {state.status === "success" ? (
                <div className="mt-3 rounded-[14px] border border-[#C4F24E]/22 bg-[#C4F24E]/10 p-3 text-sm leading-6 text-[#e4f9b8]">
                  <p className="font-black">Refund success.</p>
                  <p>Refund ID: {state.refundId ?? "returned response did not include refund ID"}</p>
                  <p>Updated payment status: {state.paymentStatus ?? "not returned"}</p>
                </div>
              ) : null}
              {state.status === "error" ? (
                <div className="mt-3 rounded-[14px] border border-rose-400/24 bg-rose-400/10 p-3 text-sm leading-6 text-rose-100">
                  <p className="font-black">Refund failed.</p>
                  <p>{state.message}</p>
                </div>
              ) : null}
              <div className="mt-3 rounded-[14px] border border-white/8 bg-black/22 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">Verification checklist after this refund</p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-white/56">
                  <li>Refund record exists.</li>
                  <li>Payment refunded/refund amount updated.</li>
                  <li>Routing released_at remains null.</li>
                  <li>payout_executions remains 0.</li>
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ArchitectIssueDetailModal({
  card,
  lane,
  activeRefundTargets,
  onClose,
  onOpenFinanceLogs,
  onRefundCompleted
}: {
  card: MissionEvidenceCard;
  lane: MissionDepartmentLane;
  activeRefundTargets: ControlledRefundTarget[];
  onClose: () => void;
  onOpenFinanceLogs: () => void;
  onRefundCompleted?: () => Promise<void>;
}) {
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
  const refundResolutionIssue = card.id === "finance-refund-resolution";
  const contextualPromptLabel = promptState === "building"
    ? "Building repair packet..."
    : promptState === "ready"
      ? "Copy & Paste in Codex"
      : refundResolutionIssue
        ? "Copy Repair Prompt"
        : "Generate Codex Prompt";

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/76 px-3 py-4 backdrop-blur-xl sm:items-center sm:px-5" role="dialog" aria-modal="true" aria-labelledby="architect-issue-detail-title" onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#070707] text-white shadow-[0_34px_100px_rgba(0,0,0,0.62)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-white/8 p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#C4F24E]">Issue Detail</p>
            <h3 id="architect-issue-detail-title" className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">{issue.issueName}</h3>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-[8px] border border-white/10 bg-black/24 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/58">{issue.lane.label}</span>
              <StatusPill status={issue.status} />
              <span className="rounded-[8px] border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-100">{issue.severity}</span>
            </div>
          </div>
          <button type="button" aria-label="Close issue detail" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.035] text-white/70 transition hover:border-[#C4F24E]/35 hover:text-[#C4F24E]" onClick={onClose}>
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
                  <li key={row} className="border-l border-[#C4F24E]/22 pl-3">{row}</li>
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

          <ControlledRefundResolutionSection
            card={card}
            issue={issue}
            activeTargets={activeRefundTargets}
            onRefundCompleted={onRefundCompleted}
          />

          {manualCopyRequired && generatedPrompt ? (
            <div className="mt-3 rounded-[18px] border border-amber-300/20 bg-amber-300/10 p-4">
              <label htmlFor="architect-issue-repair-prompt" className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">Manual copy prompt</label>
              <textarea id="architect-issue-repair-prompt" aria-label="Generated Codex repair prompt" className="mt-3 min-h-56 w-full rounded-[12px] border border-white/10 bg-black/42 p-3 font-mono text-xs leading-5 text-white/76" readOnly value={generatedPrompt} />
            </div>
          ) : null}

          {copyMessage ? (
            <p className="mt-3 rounded-[14px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 p-3 text-sm text-[#e4f9b8]">{copyMessage}</p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-white/8 p-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" className="min-h-11 rounded-[8px]" onClick={onClose}>Close</Button>
          {refundResolutionIssue ? (
            <>
              {issue.status !== "Pass" ? (
                <Button type="button" variant="secondary" className="min-h-11 rounded-[8px]" onClick={() => void handlePromptAction()} disabled={promptState === "building"}>
                  {contextualPromptLabel}
                </Button>
              ) : null}
              <Button type="button" className="min-h-11 rounded-[8px] border border-[#C4F24E]/42 bg-[#C4F24E] px-5 text-sm font-black text-black hover:bg-[#e4f9b8]" onClick={onOpenFinanceLogs}>
                Open Finance Logs
              </Button>
            </>
          ) : (
            <Button type="button" className="min-h-11 rounded-[8px] border border-[#C4F24E]/42 bg-[#C4F24E] px-5 text-sm font-black text-black hover:bg-[#e4f9b8]" onClick={() => void handlePromptAction()} disabled={promptState === "building"}>
              {promptButtonLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function CeoCommandCenter({ foundation, snapshot, selectedIncident, onCopyCodexPacket }: { foundation: MissionControlFoundation; snapshot: MissionControlSnapshot; selectedIncident: ArchitectIncident | null; onCopyCodexPacket: () => void }) {
  const cards = buildCompactCeoCards(foundation, snapshot, selectedIncident);
  const runtimeProofMatrix = useMemo(
    () => foundation.v1RuntimeProofMatrix ?? buildV1RuntimeProofMatrix(foundation.ceoCommandCenter, foundation.departmentLanes, foundation.coreLoopValidators),
    [foundation]
  );
  const readiness = foundation.readinessBreakdown
    ? readinessFromFoundationBreakdown(foundation.readinessBreakdown)
    : readinessFromFoundationBreakdown(buildMissionReadinessBreakdown(foundation.ceoCommandCenter, foundation.departmentLanes, foundation.coreLoopValidators, runtimeProofMatrix));
  const blockerGroups = buildOfficerBlockerGroups(foundation, readiness.currentReleaseBlockers);
  const officerSummaries = buildOfficerStatusSummaries(foundation, runtimeProofMatrix.groups, blockerGroups);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? null;

  return (
    <section aria-labelledby="ceo-command-center" className="space-y-3" data-testid="architect-ceo-one-screen">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">CEO Command Center</p>
          <h2 id="ceo-command-center" className="mt-1 text-2xl font-black tracking-[-0.04em] text-white">One-screen platform posture</h2>
        </div>
        <p className="text-xs text-white/48">Missing data stays Needs Review. Failed evidence stays Failed.</p>
      </div>
      <CeoReadinessCard readiness={readiness} officerSummaries={officerSummaries} blockerGroups={blockerGroups} />
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
      <CeoGreenQueue cards={cards} />
      {selectedCard ? <CeoCardDetailModal card={selectedCard} onClose={() => setSelectedCardId(null)} /> : null}
    </section>
  );
}

const FINANCE_LOG_FILTERS: Array<{ id: "all" | FinanceLogCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "refund", label: "Refunds" },
  { id: "failed_refund", label: "Failed refund attempts" },
  { id: "payout_block", label: "Payout blocks" },
  { id: "manual_review", label: "Manual review" }
];

const FINANCE_TIME_FILTERS = ["Today", "Last 7 days", "All time"] as const;

function logMatchesTimeFilter(log: FinanceLogEntry, filter: typeof FINANCE_TIME_FILTERS[number]) {
  if (filter === "All time") return true;
  if (!log.timestamp) return false;

  const timestamp = new Date(log.timestamp);
  if (Number.isNaN(timestamp.getTime())) return false;

  const now = new Date();
  if (filter === "Today") {
    return timestamp.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  }

  return now.getTime() - timestamp.getTime() <= 7 * 24 * 60 * 60 * 1000;
}

function logMatchesSearch(log: FinanceLogEntry, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;

  return [
    log.paymentId,
    log.appointmentId,
    log.refundId,
    log.providerRefundId,
    log.reason
  ].some((value) => String(value ?? "").toLowerCase().includes(needle));
}

function FinanceRoutingEvidencePanel({ summary }: { summary: FinanceRoutingEvidenceSummary }) {
  const metrics: Array<[string, string | number]> = [
    ["Inspected booking payment rows", summary.inspectedBookingPaymentRows],
    ["Rows with routing", summary.rowsWithRouting],
    ["Completed/captured missing routing", summary.completedCapturedMissingRoutingCount],
    ["Cancelled/captured missing routing", summary.cancelledCapturedMissingRoutingCount],
    ["Cancelled/refunded targets safe", summary.cancelledRefundedSafeRowCount],
    ["Target payout executions", summary.targetPayoutExecutionCount],
    ["Stale target count", summary.staleTargetCount],
    ["Proposed inserts", summary.proposedInsertCount],
    ["Proposed updates", summary.proposedUpdateCount],
    ["Broader payout execution review", summary.broaderPayoutExecutionReviewCount],
    ["Repair route available", summary.repairRouteAvailable ? "yes" : "no"],
    ["Repair route safe to call", summary.repairRouteSafeToCall ? "yes" : "no"]
  ];

  return (
    <article className="rounded-[24px] border border-white/8 bg-black/24 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-5" data-testid="finance-routing-evidence-summary">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#C4F24E]">Finance Routing Evidence</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">
            {summary.repairNeeded ? "Routing repair target detected" : "Routing repair not required"}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/62">{summary.reason}</p>
        </div>
        <StatusPill status={summary.status} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-[16px] border border-white/8 bg-black/24 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">{label}</p>
            <p className="mt-1 break-words text-2xl font-black text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[16px] border border-white/8 bg-white/[0.025] p-3 text-xs leading-5 text-white/58">
        <p><span className="font-black text-white/82">Evidence source:</span> {summary.evidenceSource}</p>
        <p><span className="font-black text-white/82">No repair required:</span> {summary.repairNeeded ? "no" : "yes"}</p>
        <p><span className="font-black text-white/82">Evidence current:</span> {summary.evidenceCurrent ? "yes" : "no"}</p>
        <p><span className="font-black text-white/82">Safety:</span> This section is read-only. It does not call the Architect payment-routing repair route, Stripe, refunds, payouts, SQL mutations, roles, RLS, migrations, or AI.</p>
      </div>
    </article>
  );
}

function FinanceLogsPanel({ logs, metrics }: { logs: FinanceLogEntry[]; metrics: NonNullable<MissionControlSnapshot["financeEvidence"]>["refundMetrics"] }) {
  const [categoryFilter, setCategoryFilter] = useState<"all" | FinanceLogCategory>("all");
  const [timeFilter, setTimeFilter] = useState<typeof FINANCE_TIME_FILTERS[number]>("All time");
  const [search, setSearch] = useState("");
  const filteredLogs = logs.filter((log) =>
    (categoryFilter === "all" || log.category === categoryFilter)
    && logMatchesTimeFilter(log, timeFilter)
    && logMatchesSearch(log, search)
  );

  return (
    <article id="finance-logs" className="rounded-[24px] border border-white/8 bg-black/24 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-5" data-testid="finance-logs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#C4F24E]">Finance Logs</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">Refund History</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/62">
            Searchable refund, failed refund attempt, payout block, and manual-review evidence. This is read-only and does not execute money actions.
          </p>
        </div>
        <StatusPill status={metrics.activeUnresolvedRefundBlockerCount > 0 ? "Failed" : metrics.refundCount > 0 ? "Pass" : "Needs Review"} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Refund count</p>
          <p className="mt-1 text-2xl font-black text-white">{metrics.refundCount}</p>
        </div>
        <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Total refunded</p>
          <p className="mt-1 text-2xl font-black text-white">{formatRefundMoney(metrics.totalRefundedAmount)}</p>
        </div>
        <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Failed attempts</p>
          <p className="mt-1 text-2xl font-black text-white">{metrics.failedRefundAttemptCount}</p>
        </div>
        <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Active blockers</p>
          <p className="mt-1 text-2xl font-black text-white">{metrics.activeUnresolvedRefundBlockerCount}</p>
        </div>
        <div className="rounded-[16px] border border-white/8 bg-black/24 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">Last refund</p>
          <p className="mt-2 break-words font-mono text-xs text-white/68">{metrics.lastRefundTimestamp ?? "Not connected"}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">Search by payment, appointment, refund, provider ID, or reason</span>
          <input
            aria-label="Search Finance Logs"
            className="mt-2 h-11 w-full rounded-[10px] border border-white/10 bg-black/36 px-3 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-[#C4F24E]/42"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Finance Logs"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {FINANCE_TIME_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={cn(
                "min-h-10 rounded-[8px] border px-3 text-xs font-black transition",
                timeFilter === filter
                  ? "border-[#C4F24E]/42 bg-[#C4F24E] text-black"
                  : "border-white/10 bg-white/[0.035] text-white/62 hover:border-[#C4F24E]/30"
              )}
              onClick={() => setTimeFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {FINANCE_LOG_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={cn(
              "min-h-10 rounded-[8px] border px-3 text-xs font-black transition",
              categoryFilter === filter.id
                ? "border-[#C4F24E]/42 bg-[#C4F24E] text-black"
                : "border-white/10 bg-white/[0.035] text-white/62 hover:border-[#C4F24E]/30"
            )}
            onClick={() => setCategoryFilter(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {filteredLogs.length ? filteredLogs.map((log) => (
          <article key={log.id} className="rounded-[18px] border border-white/8 bg-black/30 p-4" data-testid={`finance-log-${log.id}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">{log.category.replace("_", " ")}</p>
                <h4 className="mt-1 text-base font-black text-white">{log.resultStatus}</h4>
              </div>
              <span className="rounded-[8px] border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/56">{log.timestamp ?? "No timestamp"}</span>
            </div>
            <div className="mt-3 grid gap-3 text-xs leading-5 text-white/62 md:grid-cols-2">
              <p><span className="font-black text-white/84">Payment:</span> <span className="break-all font-mono">{log.paymentId ?? "Not connected"}</span></p>
              <p><span className="font-black text-white/84">Appointment:</span> <span className="break-all font-mono">{log.appointmentId ?? "Not connected"}</span></p>
              <p><span className="font-black text-white/84">Refund:</span> <span className="break-all font-mono">{log.refundId ?? "Not connected"}</span></p>
              <p><span className="font-black text-white/84">Provider refund:</span> <span className="break-all font-mono">{log.providerRefundId ?? "Not connected"}</span></p>
              <p><span className="font-black text-white/84">Amount:</span> {log.amount === null ? "Not connected" : formatRefundMoney(log.amount)}</p>
              <p><span className="font-black text-white/84">Actor:</span> {log.actorRole ?? "unknown"} / <span className="break-all font-mono">{log.actorId ?? "Not connected"}</span></p>
              <p><span className="font-black text-white/84">Source:</span> {log.source ?? "Not connected"}</p>
              <p><span className="font-black text-white/84">Routing:</span> {log.routingState ?? "Not connected"}</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/64">{log.reason ?? log.failureReason ?? "No reason connected."}</p>
            {log.failureReason ? <p className="mt-2 text-sm leading-6 text-rose-100">{log.failureReason}</p> : null}
          </article>
        )) : (
          <div className="rounded-[18px] border border-dashed border-white/12 bg-white/[0.025] p-4 text-sm text-white/58">
            No Finance Logs match the current filters.
          </div>
        )}
      </div>
    </article>
  );
}

function RlsInventoryRowCard({ row }: { row: RlsSecurityInventory["rows"][number] }) {
  return (
    <article className="rounded-[16px] border border-white/8 bg-black/24 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs text-white/45">{row.schemaName}.{row.tableName}</p>
          <h4 className="mt-1 text-sm font-black text-white">{row.dataSensitivity}</h4>
        </div>
        <StatusPill status={row.currentStatus} />
      </div>
      <div className="mt-3 grid gap-2 text-xs leading-5 text-white/58 sm:grid-cols-3">
        <p><span className="font-black text-white/82">RLS:</span> {row.rlsEnabled}</p>
        <p><span className="font-black text-white/82">Policies:</span> {row.policyCount ?? "unknown"}</p>
        <p><span className="font-black text-white/82">Risk:</span> {row.currentRiskLevel}</p>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/58">{row.failureMeaning}</p>
      <p className="mt-2 text-xs leading-5 text-white/45">{row.suggestedPolicyPlanSummary}</p>
    </article>
  );
}

function RlsSecurityInventoryPanel({ inventory }: { inventory?: RlsSecurityInventory }) {
  if (!inventory) {
    return (
      <article className="rounded-[24px] border border-amber-300/15 bg-amber-300/8 p-4 text-sm text-amber-100 sm:p-5" data-testid="rls-security-inventory">
        RLS Security Inventory is not connected. Missing inventory evidence remains Needs Review.
      </article>
    );
  }

  const summary = inventory.summary;

  return (
    <article className="rounded-[24px] border border-white/8 bg-black/24 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-5" data-testid="rls-security-inventory">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#C4F24E]">RLS Security Inventory</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">Read-only Supabase RLS posture</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/62">
            Inventory only - no RLS changes applied. Missing production table/policy evidence stays Needs Review, and disabled V1-critical evidence stays Failed.
          </p>
        </div>
        <StatusPill status={inventory.status} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Tables inventoried", summary.totalTablesInventoried],
          ["V1 critical tables", summary.v1CriticalTableCount],
          ["RLS disabled count", summary.rlsDisabledCount],
          ["Unknown posture", summary.unknownPostureCount],
          ["V1 critical disabled", summary.v1CriticalDisabledCount],
          ["Needs Review", summary.needsReviewCount],
          ["Parked future", summary.parkedFutureCount],
          ["Highest risk", summary.highestRiskLevel]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[16px] border border-white/8 bg-white/[0.025] p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">{label}</p>
            <p className="mt-1 text-2xl font-black text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[16px] border border-white/8 bg-white/[0.025] p-3 text-xs leading-5 text-white/58">
        <p><span className="font-black text-white/82">Evidence source:</span> {inventory.evidenceSource}</p>
        <p><span className="font-black text-white/82">Next repair lane:</span> {inventory.nextRepairLane}</p>
      </div>

      <div className="mt-5 space-y-5">
        <section>
          <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-100">V1 critical disabled tables</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {inventory.v1CriticalDisabledTables.length ? inventory.v1CriticalDisabledTables.map((row) => (
              <RlsInventoryRowCard key={row.id} row={row} />
            )) : (
              <div className="rounded-[16px] border border-dashed border-white/12 bg-white/[0.025] p-3 text-sm text-white/58">No named V1 critical disabled table rows are connected.</div>
            )}
          </div>
        </section>

        <section>
          <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">Unknown RLS posture</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {inventory.unknownPostureTables.length ? inventory.unknownPostureTables.slice(0, 8).map((row) => (
              <RlsInventoryRowCard key={row.id} row={row} />
            )) : (
              <div className="rounded-[16px] border border-dashed border-white/12 bg-white/[0.025] p-3 text-sm text-white/58">No unknown table posture rows are connected.</div>
            )}
          </div>
        </section>

        <section>
          <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/50">Future / parked tables</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {inventory.parkedFutureTables.length ? inventory.parkedFutureTables.map((row) => (
              <RlsInventoryRowCard key={row.id} row={row} />
            )) : (
              <div className="rounded-[16px] border border-dashed border-white/12 bg-white/[0.025] p-3 text-sm text-white/58">No parked future RLS rows are connected.</div>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}

function RoleTruthRowCard({ row }: { row: RoleTruthInventory["rows"][number] }) {
  return (
    <article className="rounded-[16px] border border-white/8 bg-black/24 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs text-white/45">{row.currentRoleValue}</p>
          <h4 className="mt-1 text-sm font-black text-white">{row.normalizedDisplayLabel}</h4>
        </div>
        <StatusPill status={row.currentStatus} />
      </div>
      <div className="mt-3 grid gap-2 text-xs leading-5 text-white/58 sm:grid-cols-3">
        <p><span className="font-black text-white/82">Classification:</span> {row.canonicalClassification}</p>
        <p><span className="font-black text-white/82">Destination:</span> {row.expectedCanonicalDestination}</p>
        <p><span className="font-black text-white/82">Risk:</span> {row.securityRisk}</p>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/58">{row.failureMeaning}</p>
      <p className="mt-2 text-xs leading-5 text-white/45">{row.suggestedMigrationPath}</p>
      <p className="mt-2 text-xs leading-5 text-white/45"><span className="font-black text-white/72">Evidence source:</span> {row.evidenceSource}</p>
    </article>
  );
}

function SourceVaultEntryCard({ source }: { source: SourceVaultInventory["entries"][number] }) {
  return (
    <article className="rounded-[16px] border border-white/8 bg-black/24 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">{source.category}</p>
          <h4 className="mt-1 text-sm font-black text-white">{source.sourceName}</h4>
        </div>
        <StatusPill status={source.evidenceStatus} />
      </div>
      <div className="mt-3 grid gap-2 text-xs leading-5 text-white/58 sm:grid-cols-2">
        <p><span className="font-black text-white/82">Type:</span> {source.sourceType}</p>
        <p><span className="font-black text-white/82">Privacy:</span> {source.privacyClass}</p>
        <p><span className="font-black text-white/82">Scope:</span> {source.scope}</p>
        <p><span className="font-black text-white/82">Ingestion:</span> {source.ingestionStatus}</p>
        <p><span className="font-black text-white/82">Source key:</span> {source.privateConnection.sourceKey}</p>
        <p><span className="font-black text-white/82">Required for V1:</span> {source.privateConnection.requiredForV1 ? "true" : "false"}</p>
        <p><span className="font-black text-white/82">Connected:</span> {source.privateConnection.connected ? "true" : "false"}</p>
        <p><span className="font-black text-white/82">Last verified:</span> {source.privateConnection.lastVerifiedAt ?? "not connected"}</p>
        <p><span className="font-black text-white/82">Fingerprint:</span> {source.privateConnection.fingerprint ?? "not connected"}</p>
        <p><span className="font-black text-white/82">Missing count:</span> {source.privateConnection.missingCount}</p>
        <p><span className="font-black text-white/82">Connected count:</span> {source.privateConnection.connectedCount}</p>
        <p><span className="font-black text-white/82">Content exposed:</span> {source.privateConnection.contentExposed ? "true" : "false"}</p>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/58">{source.summary}</p>
      {source.staleOrMissingEvidenceState.length ? (
        <ul className="mt-3 space-y-1 text-xs text-amber-100/82">
          {source.staleOrMissingEvidenceState.slice(0, 3).map((gap) => (
            <li key={gap}>- {gap}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function SourceVaultInventoryPanel({ inventory }: { inventory?: SourceVaultInventory }) {
  if (!inventory) {
    return (
      <article className="rounded-[24px] border border-amber-300/15 bg-amber-300/8 p-4 text-sm text-amber-100 sm:p-5" data-testid="source-vault-inventory">
        Source Vault inventory is not connected. Missing source metadata must stay Needs Review.
      </article>
    );
  }

  const summary = inventory.summary;
  const priorityEntries = [
    ...inventory.missingRequiredSources,
    ...inventory.privateSourceRequiredSources,
    ...inventory.needsReviewSources
  ].filter((entry, index, entries) => entries.findIndex((candidate) => candidate.id === entry.id) === index);

  return (
    <article className="rounded-[24px] border border-white/8 bg-black/24 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-5" data-testid="source-vault-inventory">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#C4F24E]">Source Vault Ingestion Foundation</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">Metadata-only source readiness</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/58">
            {inventory.privacyWarning} Source titles, categories, private-storage references, placeholder hashes, scopes, linked cards, and readiness states are tracked without committing raw PDFs, DOCX files, screenshots, transcripts, secrets, or private strategy documents.
          </p>
        </div>
        <StatusPill status={inventory.status} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Sources registered", summary.totalSourcesRegistered],
          ["Ingested metadata", summary.ingestedMetadataCount],
          ["Missing required", summary.missingRequiredSourceCount],
          ["Missing keys", summary.missingRequiredSourceKeys.length ? summary.missingRequiredSourceKeys.join(", ") : "none"],
          ["Private source required", summary.privateSourceRequiredCount],
          ["Private metadata connected", summary.privateMetadataConnectedCount],
          ["Private metadata missing", summary.privateMetadataMissingCount],
          ["Content exposed", summary.contentExposedCount],
          ["Needs review", summary.needsReviewCount],
          ["Parked/future", summary.parkedFutureSourceCount],
          ["V1 required", summary.v1RequiredSourceCount],
          ["V1 required missing", summary.v1RequiredMissingCount],
          ["Linked Architect cards", summary.linkedArchitectCardsCount],
          ["Highest risk", summary.highestRiskLevel],
          ["Next repair lane", summary.nextRepairLane]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[16px] border border-white/8 bg-white/[0.025] p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/36">{label}</p>
            <p className="mt-1 text-lg font-black text-white">{value}</p>
          </div>
        ))}
      </div>

      <section className="mt-5">
        <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/50">Category breakdown</h4>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {inventory.categories.map((category) => (
            <div key={category.category} className="rounded-[16px] border border-white/8 bg-white/[0.025] p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-black text-white">{category.category}</p>
                <StatusPill status={category.status} />
              </div>
              <div className="mt-2 grid gap-1 text-xs text-white/58">
                <p>Total: {category.total}</p>
                <p>V1 required: {category.v1RequiredCount}</p>
                <p>Missing required: {category.missingRequiredCount}</p>
                <p>Needs Review: {category.needsReviewCount}</p>
                <p>Parked/future: {category.parkedFutureCount}</p>
                <p>Risk: {category.highestRiskLevel}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-5">
        <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">Priority source gaps</h4>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {priorityEntries.length ? priorityEntries.slice(0, 8).map((source) => (
            <SourceVaultEntryCard key={source.id} source={source} />
          )) : (
            <div className="rounded-[16px] border border-dashed border-white/12 bg-white/[0.025] p-3 text-sm text-white/58">No active Source Vault gaps are connected.</div>
          )}
        </div>
      </section>
    </article>
  );
}

function RoleTruthInventoryPanel({ inventory }: { inventory?: RoleTruthInventory }) {
  if (!inventory) {
    return (
      <article className="rounded-[24px] border border-amber-300/15 bg-amber-300/8 p-4 text-sm text-amber-100 sm:p-5" data-testid="role-truth-inventory">
        Role Truth Inventory is not connected. Missing role evidence remains Needs Review.
      </article>
    );
  }

  const summary = inventory.summary;

  return (
    <article className="rounded-[24px] border border-white/8 bg-black/24 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-5" data-testid="role-truth-inventory">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#C4F24E]">Role Truth Inventory</p>
          <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">Read-only account role migration plan</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/62">
            Plan only - no role changes applied. Primary account roles, platform admin, business relationships, staff permissions, legacy drift, and unknown values are separated before any migration is approved.
          </p>
        </div>
        <StatusPill status={inventory.status} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Roles inventoried", summary.totalRoleValuesInventoried],
          ["Canonical account roles", summary.canonicalAccountRoleCount],
          ["Platform admin roles", summary.platformAdminRoleCount],
          ["Business relationships", summary.businessRelationshipCount],
          ["Staff permissions", summary.staffPermissionCount],
          ["Legacy/drift count", summary.legacyOrDriftCount],
          ["Unknown roles", summary.unknownCount],
          ["Migration required", summary.migrationRequiredCount],
          ["V1 critical drift", summary.v1CriticalDriftCount],
          ["Account role misuse", summary.accountRoleMisuseCount],
          ["Highest risk", summary.highestRiskLevel],
          ["Next repair lane", summary.nextRepairLane]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[16px] border border-white/8 bg-white/[0.025] p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">{label}</p>
            <p className="mt-1 text-2xl font-black text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-[16px] border border-white/8 bg-white/[0.025] p-3 text-xs leading-5 text-white/58">
        <p><span className="font-black text-white/82">Evidence source:</span> {inventory.evidenceSource}</p>
        <p><span className="font-black text-white/82">Next repair lane:</span> {inventory.nextRepairLane}</p>
      </div>

      <div className="mt-5 space-y-5">
        <section>
          <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-100">Critical drift / account-role misuse</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {inventory.v1CriticalDriftRoles.length ? inventory.v1CriticalDriftRoles.map((row) => (
              <RoleTruthRowCard key={row.id} row={row} />
            )) : (
              <div className="rounded-[16px] border border-dashed border-white/12 bg-white/[0.025] p-3 text-sm text-white/58">No critical role drift rows are connected.</div>
            )}
          </div>
        </section>

        <section>
          <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">Business relationships and staff permissions</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {[...inventory.businessRelationshipRoles, ...inventory.staffPermissionRoles].slice(0, 10).map((row) => (
              <RoleTruthRowCard key={row.id} row={row} />
            ))}
          </div>
        </section>

        <section>
          <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white/50">Canonical roles and unknown posture</h4>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {[...inventory.canonicalAccountRoles, ...inventory.platformAdminRoles, ...inventory.unknownRoles].map((row) => (
              <RoleTruthRowCard key={row.id} row={row} />
            ))}
          </div>
        </section>
      </div>
    </article>
  );
}

function DepartmentLaneDetail({
  lane,
  snapshot,
  foundation,
  onRefreshSnapshot
}: {
  lane: MissionDepartmentLane;
  snapshot: MissionControlSnapshot;
  foundation: MissionControlFoundation;
  onRefreshSnapshot: () => Promise<void>;
}) {
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const selectedIssue = lane.cards.find((card) => card.id === selectedIssueId) ?? null;
  const issueDetailsEnabled = lane.id === "finance";
  const activeRefundTargets = snapshot.financeEvidence?.activeRefundTargets ?? [];
  const refundLogs = snapshot.financeEvidence?.refundLogs ?? [];
  const routingSummary = snapshot.financeEvidence?.routingSummary ?? null;
  const refundMetrics = snapshot.financeEvidence?.refundMetrics ?? {
    refundCount: 0,
    totalRefundedAmount: 0,
    failedRefundAttemptCount: 0,
    activeUnresolvedRefundBlockerCount: activeRefundTargets.length,
    lastRefundTimestamp: null
  };
  const runtimeProofGroups = getRuntimeProofGroupsForLane(lane.id, foundation.v1RuntimeProofMatrix?.groups ?? []);

  function openFinanceLogs() {
    setSelectedIssueId(null);
    window.setTimeout(() => {
      document.getElementById("finance-logs")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, 0);
  }

  return (
    <section aria-labelledby={`${lane.id}-lane-heading`} className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#C4F24E]">{lane.label} Mission Control</p>
        <h2 id={`${lane.id}-lane-heading`} className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">{lane.purpose}</h2>
      </div>
      <ArchitectControlPlaneBoundary lane={lane} />
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
      {lane.id === "finance" ? (
        <>
          {routingSummary ? <FinanceRoutingEvidencePanel summary={routingSummary} /> : null}
          <FinanceLogsPanel logs={refundLogs} metrics={refundMetrics} />
        </>
      ) : null}
      {runtimeProofGroups.length ? (
        <V1RuntimeProofPanel groups={runtimeProofGroups} />
      ) : null}
      {lane.id === "technology" ? (
        <DeploymentRegressionEvidencePanel evidence={foundation.deploymentRegression} />
      ) : null}
      {lane.id === "finance" || lane.id === "compliance" ? (
        <AuditSpinePanel auditSpine={foundation.auditSpine} />
      ) : null}
      {lane.id === "security" ? (
        <RlsSecurityInventoryPanel inventory={foundation.rlsSecurityInventory} />
      ) : null}
      {lane.id === "security" || lane.id === "compliance" ? (
        <RoleTruthInventoryPanel inventory={foundation.roleTruthInventory} />
      ) : null}
      {lane.id === "technology" ? (
        <SourceVaultInventoryPanel inventory={foundation.sourceVaultInventory} />
      ) : null}
      {issueDetailsEnabled && selectedIssue ? (
        <ArchitectIssueDetailModal
          card={selectedIssue}
          lane={lane}
          activeRefundTargets={activeRefundTargets}
          onClose={() => setSelectedIssueId(null)}
          onOpenFinanceLogs={openFinanceLogs}
          onRefundCompleted={onRefreshSnapshot}
        />
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
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(196, 242, 78,0.08),transparent_32%)]" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-[8px] border border-[#C4F24E]/18 bg-[#C4F24E]/8 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#e4f9b8]">
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
          <div className="flex items-start gap-2 rounded-[18px] border border-[#C4F24E]/20 bg-[#C4F24E]/10 p-3 text-sm text-[#e4f9b8]">
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
              <DepartmentLaneDetail lane={selectedDepartmentLane} snapshot={snapshot} foundation={foundation} onRefreshSnapshot={loadSnapshot} />
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
