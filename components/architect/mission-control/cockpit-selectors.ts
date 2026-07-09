// Mission Control HOME cockpit — pure snapshot -> view-model selectors.
// This module holds ZERO data fetching. It maps the SAME MissionControlSnapshot the
// lane component consumes into the panels the cockpit renders, and it encodes the
// "Needs Review until proof connected" doctrine: absent/unknown evidence never
// renders as Pass. Safe to import from both server and client modules.

import { buildMissionReadinessBreakdown } from "@/lib/architect/mission-control/foundation";
import type {
  ActionRegistryEntry,
  ArchitectIncident,
  MissionControlFoundation,
  MissionControlHealthItem,
  MissionControlSnapshot,
  MissionDepartmentLane,
  MissionEvidenceCard,
  MissionLaneId,
  MissionReadinessBreakdown
} from "@/lib/architect/mission-control/types";

export type CockpitTone = "pass" | "warning" | "review" | "failed" | "blocked" | "neutral";

const FAILED_TOKENS = ["failed", "fail", "critical", "broken", "error", "missing", "disabled"];
const NEUTRAL_TOKENS = ["parked", "idle", "future"];
const WARNING_TOKENS = ["warning", "warn", "degraded"];
const PASS_TOKENS = ["pass", "healthy", "ready", "eligible", "complete"];

// Maps any status string (MissionControlStatus, health status, gate status) to a tone.
// Unknown / not-connected / needs-review always collapse to "review" — never "pass".
export function toneForStatus(status: string | null | undefined): CockpitTone {
  const normalized = String(status ?? "").toLowerCase();
  if (!normalized) return "review";
  if (normalized.includes("blocked")) return "blocked";
  if (normalized.includes("review") || normalized.includes("unknown") || normalized.includes("not connected")) {
    return "review";
  }
  if (FAILED_TOKENS.some((token) => normalized.includes(token))) return "failed";
  if (NEUTRAL_TOKENS.some((token) => normalized.includes(token))) return "neutral";
  if (WARNING_TOKENS.some((token) => normalized.includes(token))) return "warning";
  if (PASS_TOKENS.some((token) => normalized.includes(token))) return "pass";
  return "review";
}

export const TONE_CLASSES: Record<CockpitTone, string> = {
  pass: "border-[#C4F24E]/25 bg-[#C4F24E]/10 text-[#e4f9b8]",
  warning: "border-amber-300/25 bg-amber-300/10 text-amber-100",
  review: "border-amber-300/22 bg-amber-300/8 text-amber-100",
  failed: "border-rose-400/25 bg-rose-400/10 text-rose-100",
  blocked: "border-orange-300/28 bg-orange-300/10 text-orange-100",
  neutral: "border-sky-300/22 bg-sky-300/8 text-sky-100"
};

export const TONE_DOT: Record<CockpitTone, string> = {
  pass: "#C4F24E",
  warning: "#fbbf24",
  review: "#fbbf24",
  failed: "#fb7185",
  blocked: "#fdba74",
  neutral: "#7dd3fc"
};

export function laneHref(laneId: MissionLaneId): string {
  if (laneId === "ceo") return "/architect";
  return `/architect/${laneId === "content_community" ? "content-community" : laneId}`;
}

// Readiness ring — per instruction: buildMissionReadinessBreakdown(...) is primary,
// with fallback to the foundation's pre-computed readinessBreakdown when the live
// computation is degenerate (no V1-required cards to score).
export function resolveReadiness(foundation: MissionControlFoundation): MissionReadinessBreakdown {
  const computed = buildMissionReadinessBreakdown(
    foundation.ceoCommandCenter,
    foundation.departmentLanes,
    foundation.coreLoopValidators,
    foundation.v1RuntimeProofMatrix
  );
  if (computed.v1RequiredTotalCount > 0) return computed;
  return foundation.readinessBreakdown ?? computed;
}

export type VitalView = {
  key: string;
  label: string;
  status: string;
  tone: CockpitTone;
  summary: string;
};

export function selectVitals(health: MissionControlHealthItem[]): VitalView[] {
  return health.map((item) => ({
    key: item.key,
    label: item.label,
    status: item.status,
    tone: toneForStatus(item.status),
    summary: item.summary
  }));
}

export type DirectiveView = {
  id: string;
  n: number;
  tag: string;
  tone: CockpitTone;
  title: string;
  next: string;
};

export function selectDirectives(readiness: MissionReadinessBreakdown): DirectiveView[] {
  const blockers = readiness.currentReleaseBlockers.length
    ? readiness.currentReleaseBlockers
    : readiness.evidenceGaps;
  return blockers.slice(0, 3).map((card, index) => ({
    id: card.id,
    n: index + 1,
    tag: card.status,
    tone: toneForStatus(card.status),
    title: card.label,
    next: `${card.department} · ${card.evidenceRequiredForPass ?? "connect proof"}`
  }));
}

export type MapNodeView = {
  id: MissionLaneId;
  label: string;
  status: string;
  tone: CockpitTone;
  href: string;
};

export function selectMapNodes(foundation: MissionControlFoundation): MapNodeView[] {
  return foundation.departmentLanes.map((lane) => ({
    id: lane.id,
    label: lane.label,
    status: lane.status,
    tone: toneForStatus(lane.status),
    href: laneHref(lane.id)
  }));
}

export type OfficerLaneView = MapNodeView & {
  proofConnected: boolean;
  failedCount: number;
  needsReviewCount: number;
  note: string;
};

export function selectOfficerLanes(foundation: MissionControlFoundation): OfficerLaneView[] {
  return foundation.departmentLanes.map((lane) => {
    const gate = foundation.officerGreenGates?.find((candidate) => candidate.laneId === lane.id);
    const failedCount = gate?.failedEvidenceCount ?? lane.cards.filter((card) => card.status === "Failed").length;
    const needsReviewCount = gate?.missingEvidenceCount ?? lane.cards.filter((card) => card.status === "Needs Review").length;
    const proofConnected = gate?.proofConnected ?? lane.cards.some((card) => card.status === "Pass" && card.evidence.length > 0);
    return {
      id: lane.id,
      label: lane.label,
      status: lane.status,
      tone: toneForStatus(lane.status),
      href: laneHref(lane.id),
      proofConnected,
      failedCount,
      needsReviewCount,
      note: proofConnected ? lane.purpose : "Needs Review until proof connected"
    };
  });
}

export type WorkQueueTabId = "critical" | "needs" | "approval" | "codex" | "recent";

export type WorkQueueItemView = {
  id: string;
  title: string;
  body: string;
  status: string;
  tone: CockpitTone;
  meta: string;
  packetId?: string;
};

export type WorkQueueTabView = {
  id: WorkQueueTabId;
  label: string;
  count: number;
  items: WorkQueueItemView[];
};

function allEvidenceCards(foundation: MissionControlFoundation): MissionEvidenceCard[] {
  return [...foundation.ceoCommandCenter, ...foundation.departmentLanes.flatMap((lane) => lane.cards)];
}

function incidentTone(incident: ArchitectIncident): CockpitTone {
  if (incident.severity === "critical") return "failed";
  if (incident.severity === "broken") return "warning";
  return "review";
}

export function selectWorkQueue(snapshot: MissionControlSnapshot): WorkQueueTabView[] {
  const { foundation, incidents, packets } = snapshot;
  const cards = allEvidenceCards(foundation);

  const critical: WorkQueueItemView[] = incidents
    .filter((incident) => incident.severity === "critical" || incident.severity === "broken")
    .map((incident) => ({
      id: incident.id,
      title: incident.headline,
      body: incident.recommendedAction,
      status: incident.severity,
      tone: incidentTone(incident),
      meta: incident.affectedDepartment ?? incident.affectedRole
    }));

  const needs: WorkQueueItemView[] = cards
    .filter((card) => card.status === "Needs Review")
    .map((card) => ({
      id: `needs:${card.id}`,
      title: card.label,
      body: card.summary,
      status: card.status,
      tone: "review",
      meta: `${card.department} · ${card.workflow}`
    }));

  const approval: WorkQueueItemView[] = foundation.actionRegistry
    .filter((action: ActionRegistryEntry) => action.approvalRequired || action.riskClass === "Needs approval")
    .map((action) => ({
      id: `approval:${action.id}`,
      title: action.label,
      body: action.description,
      status: action.allowed ? action.riskClass : "Blocked",
      tone: action.allowed ? "review" : "blocked",
      meta: action.department
    }));

  const codex: WorkQueueItemView[] = incidents
    .filter((incident) => incident.codexRequired || Boolean(packets[incident.id]))
    .map((incident) => ({
      id: `codex:${incident.id}`,
      title: incident.headline,
      body: packets[incident.id] ? "Codex packet available to copy." : incident.recommendedAction,
      status: incident.codexRequired ? "Codex required" : "Packet ready",
      tone: incident.codexRequired ? "warning" : "neutral",
      meta: incident.affectedDepartment ?? incident.affectedRole,
      packetId: packets[incident.id] ? incident.id : undefined
    }));

  const recent: WorkQueueItemView[] = [...incidents]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
    .map((incident) => ({
      id: `recent:${incident.id}`,
      title: incident.headline,
      body: `Detected ${incident.createdAt}`,
      status: incident.severity,
      tone: incidentTone(incident),
      meta: incident.affectedDepartment ?? incident.affectedRole
    }));

  return [
    { id: "critical", label: "Critical", count: critical.length, items: critical },
    { id: "needs", label: "Needs", count: needs.length, items: needs },
    { id: "approval", label: "Approval", count: approval.length, items: approval },
    { id: "codex", label: "Codex", count: codex.length, items: codex },
    { id: "recent", label: "Recent", count: recent.length, items: recent }
  ];
}

export type CommandDeckItemView = {
  id: string;
  label: string;
  status: string;
  tone: CockpitTone;
  meta: string;
};

export function selectCommandDeck(foundation: MissionControlFoundation): CommandDeckItemView[] {
  return foundation.actionRegistry.slice(0, 12).map((action) => ({
    id: action.id,
    label: action.label,
    status: action.allowed ? action.status : "Blocked",
    tone: action.allowed ? toneForStatus(action.status) : "blocked",
    meta: `${action.department} · ${action.riskClass}`
  }));
}

export type EvidenceView = {
  title: string;
  status: string;
  tone: CockpitTone;
  source: string;
  confidence: string;
  detail: string;
  items: Array<{ id: string; label: string; status: string; tone: CockpitTone }>;
};

const NOT_CONNECTED = "Needs Review until proof connected";

export function selectEvidence(
  foundation: MissionControlFoundation,
  laneId: MissionLaneId | null
): EvidenceView {
  const lane: MissionDepartmentLane | undefined = laneId
    ? foundation.departmentLanes.find((candidate) => candidate.id === laneId)
    : undefined;

  if (!lane) {
    return {
      title: "System evidence",
      status: "Needs Review",
      tone: "review",
      source: foundation.sourceVaultInventory?.evidenceSource ?? "Select a system node",
      confidence: "Select a node on the map to inspect its connected proof.",
      detail: "Officer lane evidence stays Needs Review until a connected, fresh proof source is available.",
      items: []
    };
  }

  const connectedCard = lane.cards.find((card) => card.evidence.length > 0);
  const proofConnected = foundation.officerGreenGates?.find((gate) => gate.laneId === lane.id)?.proofConnected
    ?? Boolean(connectedCard && lane.cards.some((card) => card.status === "Pass"));

  return {
    title: `${lane.label} lane`,
    status: lane.status,
    tone: toneForStatus(lane.status),
    source: connectedCard?.evidence[0] ?? NOT_CONNECTED,
    confidence: proofConnected ? "Proof connected" : NOT_CONNECTED,
    detail: lane.purpose,
    items: lane.cards.slice(0, 6).map((card) => ({
      id: card.id,
      label: card.label,
      status: card.status,
      tone: toneForStatus(card.status)
    }))
  };
}

export type EnvChipView = { label: string; value: string; tone: CockpitTone };

export function selectEnvStrip(snapshot: MissionControlSnapshot): {
  env: string;
  commit: string;
  deploy: string;
  chips: EnvChipView[];
} {
  const { environment, foundation } = snapshot;
  const deployment = foundation.deploymentRegression;
  const auditSpine = foundation.auditSpine;
  const readiness = resolveReadiness(foundation);

  const chips: EnvChipView[] = [
    {
      label: "Deployment",
      value: deployment?.status ?? "Not Connected",
      tone: toneForStatus(deployment?.status ?? "Not Connected")
    },
    {
      label: "Regression",
      value: deployment?.regressionEvidenceStatus ?? "Not Connected",
      tone: toneForStatus(deployment?.regressionEvidenceStatus ?? "Not Connected")
    },
    {
      label: "Build",
      value: deployment?.buildEvidenceStatus ?? "Not Connected",
      tone: toneForStatus(deployment?.buildEvidenceStatus ?? "Not Connected")
    },
    {
      label: "Audit Spine",
      value: auditSpine ? `${auditSpine.status} · ${auditSpine.records.length}` : "Not Connected",
      tone: toneForStatus(auditSpine?.status ?? "Not Connected")
    },
    {
      label: "V1 Readiness",
      value: `${readiness.v1ReadinessPercent}%`,
      tone: toneForStatus(readiness.overallStatus)
    }
  ];

  return {
    env: environment.appEnv || "unknown",
    commit: environment.commitHash ?? "unknown",
    deploy: environment.deploymentId ?? environment.deploymentStatus ?? "unknown",
    chips
  };
}
