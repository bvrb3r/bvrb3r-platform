"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Brain, CheckCircle2, Clipboard, FileCode2, RefreshCw, Rocket, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ArchitectRepairResult } from "@/lib/architect/debug/types";
import { buildMissionControlFoundation } from "@/lib/architect/mission-control/foundation";
import type {
  ActionRegistryEntry,
  ArchitectIncident,
  CoreLoopValidator,
  HiveAgentEntry,
  MissionControlFoundation,
  MissionControlSnapshot,
  MissionDepartmentLane,
  MissionEvidenceCard,
  MissionIncidentDefinition,
  MissionValidationResult,
  SourceVaultEntry
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
      <p className="mt-3 text-sm leading-6 text-white/68">{card.summary}</p>
      <ul className="mt-3 space-y-1 text-xs leading-5 text-white/48">
        {card.evidence.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}

function MissionControlNavigationPanel({ foundation }: { foundation: MissionControlFoundation }) {
  return (
    <section aria-labelledby="mission-control-navigation" className="rounded-lg border border-white/10 bg-black/25 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[#d7ffab]">BVRB3R Mission Control Navigation</p>
          <h2 id="mission-control-navigation" className="mt-2 text-2xl font-semibold text-white">CEO lane is the default landing lane</h2>
        </div>
        <StatusPill status="Needs Review" />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {foundation.navigationLanes.map((lane) => (
          <a
            key={lane.id}
            href={lane.href}
            aria-current={lane.id === foundation.defaultLaneId ? "page" : undefined}
            className={cn(
              "rounded-lg border p-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/40",
              lane.id === foundation.defaultLaneId
                ? "border-[#7CFF00]/28 bg-[#7CFF00]/10"
                : "border-white/10 bg-white/[0.025] hover:border-[#7CFF00]/20"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-white">{lane.label}</p>
              {lane.id === foundation.defaultLaneId ? <StatusPill status="Default" /> : null}
            </div>
            <p className="mt-2 text-xs leading-5 text-white/54">{lane.purpose}</p>
          </a>
        ))}
      </div>
    </section>
  );
}

function CeoCommandCenter({ foundation }: { foundation: MissionControlFoundation }) {
  return (
    <section aria-labelledby="ceo-command-center" className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-[#d7ffab]">CEO Command Center</p>
        <h2 id="ceo-command-center" className="mt-2 text-2xl font-semibold text-white">Health, risk, and next decisions</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {foundation.ceoCommandCenter.map((card) => <EvidenceCard key={card.id} card={card} />)}
      </div>
    </section>
  );
}

function DepartmentLanePanel({ lanes }: { lanes: MissionDepartmentLane[] }) {
  return (
    <section aria-labelledby="department-lanes" className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-[#d7ffab]">Department Lanes</p>
        <h2 id="department-lanes" className="mt-2 text-2xl font-semibold text-white">Read-only evidence cards</h2>
      </div>
      <div className="space-y-4">
        {lanes.filter((lane) => lane.id !== "ceo").map((lane) => (
          <article key={lane.id} id={lane.id === "content_community" ? "content-community" : lane.id} className="rounded-lg border border-white/10 bg-black/25 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">{lane.label}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{lane.purpose}</h3>
              </div>
              <StatusPill status={lane.status} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {lane.cards.map((card) => <EvidenceCard key={card.id} card={card} />)}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CoreLoopValidatorPanel({ validators }: { validators: CoreLoopValidator[] }) {
  return (
    <section aria-labelledby="core-loop-validators" className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-[#d7ffab]">Core Loop Validators</p>
        <h2 id="core-loop-validators" className="mt-2 text-2xl font-semibold text-white">Workflow truth checks</h2>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {validators.map((validator) => (
          <article key={validator.id} className="rounded-lg border border-white/10 bg-black/24 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">{validator.department}</p>
                <h3 className="mt-2 text-lg font-semibold text-white">{validator.label}</h3>
              </div>
              <StatusPill status={validator.status} />
            </div>
            <p className="mt-3 text-sm text-white/62">{validator.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em]">
              <span className={cn("rounded-full border px-2 py-1", validator.safeRepairAvailable ? statusClass("warning") : statusClass("needs review"))}>
                Safe repair: {validator.safeRepairAvailable ? "yes" : "no"}
              </span>
              <span className={cn("rounded-full border px-2 py-1", validator.codexPatchNeeded ? statusClass("warning") : statusClass("needs review"))}>
                Codex patch: {validator.codexPatchNeeded ? "yes" : "no"}
              </span>
            </div>
            <ul className="mt-3 space-y-1 text-xs leading-5 text-white/48">
              {validator.validationChecklist.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function IncidentTypePanel({ incidentTypes }: { incidentTypes: MissionIncidentDefinition[] }) {
  return (
    <section aria-labelledby="incident-types" className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-[#d7ffab]">Incident System</p>
        <h2 id="incident-types" className="mt-2 text-2xl font-semibold text-white">Known failure classes</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {incidentTypes.map((incidentType) => (
          <article key={incidentType.type} className="rounded-lg border border-white/10 bg-black/24 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs text-white/42">{incidentType.type}</p>
                <h3 className="mt-2 text-base font-semibold text-white">{incidentType.affectedWorkflow}</h3>
              </div>
              <StatusPill status={incidentType.severity === "warning" ? "Warning" : "Failed"} />
            </div>
            <p className="mt-3 text-sm leading-6 text-white/62">{incidentType.likelyRootCause}</p>
            <p className="mt-3 text-xs text-white/44">Safe repair available: {incidentType.safeRepairAvailable ? "yes" : "no"} / Codex patch needed: {incidentType.codexPatchNeeded ? "yes" : "no"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SourceVaultPanel({ sources }: { sources: SourceVaultEntry[] }) {
  return (
    <section aria-labelledby="source-vault" className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-[#d7ffab]">Source Vault</p>
        <h2 id="source-vault" className="mt-2 text-2xl font-semibold text-white">Registered, not ingested</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sources.map((source) => (
          <article key={source.id} className="rounded-lg border border-white/10 bg-black/24 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-white">{source.sourceName}</h3>
              <StatusPill status={source.status} />
            </div>
            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-white/40">{source.category} / {source.linkedSystemArea}</p>
            <p className="mt-3 text-sm leading-6 text-white/62">{source.purpose}</p>
            <p className="mt-3 text-xs text-white/44">{source.ingestionStatus}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ActionRegistryPanel({ actions }: { actions: ActionRegistryEntry[] }) {
  return (
    <section aria-labelledby="action-registry" className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-[#d7ffab]">Action Registry</p>
        <h2 id="action-registry" className="mt-2 text-2xl font-semibold text-white">Boundaries before buttons</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => (
          <article key={action.id} className="rounded-lg border border-white/10 bg-black/24 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">{action.riskClass}</p>
                <h3 className="mt-2 text-base font-semibold text-white">{action.label}</h3>
              </div>
              <StatusPill status={action.status} />
            </div>
            <p className="mt-3 text-sm leading-6 text-white/62">{action.description}</p>
            <p className="mt-3 text-xs text-white/44">Allowed: {action.allowed ? "yes" : "no"} / Approval: {action.approvalRequired ? "required" : "not required"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AgentRegistryPanel({ agents }: { agents: HiveAgentEntry[] }) {
  return (
    <section aria-labelledby="agent-registry" className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-[#d7ffab]">Hive AI / Agent Registry</p>
        <h2 id="agent-registry" className="mt-2 text-2xl font-semibold text-white">Read-only workforce brain</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((agent) => (
          <article key={agent.id} className="rounded-lg border border-white/10 bg-black/24 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">{agent.department}</p>
                <h3 className="mt-2 text-base font-semibold text-white">{agent.name}</h3>
              </div>
              <StatusPill status={agent.currentStatus} />
            </div>
            <p className="mt-3 text-sm leading-6 text-white/62">{agent.job}</p>
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/52">
              <p>Autonomy: {agent.autonomyLevel}</p>
              <p>Data: {agent.dataAccess}</p>
              <p>Action: {agent.actionAccess}</p>
              <p>Failure rule: {agent.failureRule}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function IncidentCard({
  incident,
  selected,
  onAnalyze,
  onRepair,
  onValidate,
  busy
}: {
  incident: ArchitectIncident;
  selected: boolean;
  onAnalyze: () => void;
  onRepair: () => void;
  onValidate: () => void;
  busy: boolean;
}) {
  return (
    <article className={cn("rounded-lg border bg-black/24 p-4 transition", selected ? "border-[#7CFF00]/35" : "border-white/10")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-white/42">{incident.id}</p>
          <h3 className="mt-2 text-lg font-semibold text-white">{incident.headline}</h3>
          <p className="mt-1 text-sm text-white/58">{incident.affectedEntity}</p>
        </div>
        <span className={cn("rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]", statusClass(incident.severity))}>
          {incident.severity}
        </span>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-white/58 sm:grid-cols-3">
        <span>Code: <strong className="text-white/82">{incident.diagnosisCode}</strong></span>
        <span>Dept: <strong className="text-white/82">{incident.affectedDepartment ?? incident.affectedRole}</strong></span>
        <span>Confidence: <strong className="text-white/82">{incident.confidence}</strong></span>
      </div>
      <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-5 text-white/56">
        <p>Workflow: <strong className="text-white/82">{incident.affectedWorkflow ?? incident.analysis.affectedLayer}</strong></p>
        <p>Table: <strong className="text-white/82">{incident.affectedTable ?? "none"}</strong></p>
        <p>Safe repair available: <strong className="text-white/82">{incident.canRepair ? "yes" : "no"}</strong></p>
        <p>Codex patch needed: <strong className="text-white/82">{incident.codexRequired ? "yes" : "no"}</strong></p>
      </div>
      <ul className="mt-3 space-y-1 text-xs leading-5 text-white/48">
        {incident.evidence.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
      </ul>
      {incident.validationChecklist?.length ? (
        <details className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/56">
          <summary className="cursor-pointer text-white/72">Validation checklist</summary>
          <ul className="mt-2 space-y-1">
            {incident.validationChecklist.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
      ) : null}
      <p className="mt-3 text-sm text-white/70">{incident.recommendedAction}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={onAnalyze}>Analyze</Button>
        {incident.canRepair ? (
          <Button type="button" onClick={onRepair} disabled={busy}>
            <Wrench className="h-4 w-4" />
            {busy ? "Repairing" : "Run Safe Repair"}
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={onValidate}>Validate</Button>
      </div>
    </article>
  );
}

function AnalysisPanel({ incident }: { incident: ArchitectIncident | null }) {
  if (!incident) {
    return (
      <Card className="border-white/10 bg-black/25 p-5">
        <div className="flex items-center gap-2 text-white">
          <Brain className="h-4 w-4" />
          <h2 className="text-lg font-semibold">AI Analysis</h2>
        </div>
        <p className="mt-4 text-sm text-white/58">Select an incident to see the failure layer, ruled-out causes, and next action.</p>
      </Card>
    );
  }

  return (
    <Card className="border-white/10 bg-black/25 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-white">
          <Brain className="h-4 w-4" />
          <h2 className="text-lg font-semibold">AI Analysis</h2>
        </div>
        <span className="rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/10 px-3 py-1 text-xs text-[#d7ffab]">
          {incident.analysis.confidence}% confidence
        </span>
      </div>
      <div className="mt-5 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/40">Likely Root Cause</p>
          <p className="mt-2 text-sm leading-6 text-white">{incident.analysis.likelyRootCause}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-white/40">Affected Layer</p>
            <p className="mt-2 text-sm text-white">{incident.analysis.affectedLayer}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-white/40">Failed Invariant</p>
            <p className="mt-2 text-sm text-white">{incident.analysis.failedInvariant}</p>
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/40">Supporting Evidence</p>
          <ul className="mt-2 space-y-2 text-sm text-white/68">
            {incident.analysis.supportingEvidence.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/40">Ruled Out</p>
          <p className="mt-2 text-sm text-white/68">{incident.analysis.ruledOut.join(", ") || "Nothing ruled out yet."}</p>
        </div>
        <div className={cn("rounded-lg border p-3 text-sm", statusClass(incident.analysis.safeRepairAvailable ? "warning" : incident.analysis.codexRequired ? "broken" : "healthy"))}>
          {incident.analysis.nextBestAction}
        </div>
      </div>
    </Card>
  );
}

function ActionsPanel({
  snapshot,
  incident,
  onCopy,
  onRefresh,
  onRepair,
  onValidate,
  busy
}: {
  snapshot: MissionControlSnapshot | null;
  incident: ArchitectIncident | null;
  onCopy: (kind: "chatGptPacket" | "codexPacket" | "incidentPacket") => void;
  onRefresh: () => void;
  onRepair: () => void;
  onValidate: () => void;
  busy: boolean;
}) {
  const disabled = !incident;
  return (
    <Card className="border-white/10 bg-black/25 p-5">
      <div className="flex items-center gap-2 text-white">
        <Rocket className="h-4 w-4" />
        <h2 className="text-lg font-semibold">Actions</h2>
      </div>
      <div className="mt-4 grid gap-2">
        <Button type="button" onClick={onRefresh} disabled={busy} variant="secondary">
          <RefreshCw className="h-4 w-4" />
          Re-run Detection
        </Button>
        <Button type="button" onClick={onRepair} disabled={busy || !incident?.canRepair}>
          <Wrench className="h-4 w-4" />
          Run Safe Repair
        </Button>
        <Button type="button" variant="secondary" onClick={() => onCopy("codexPacket")} disabled={disabled}>
          <FileCode2 className="h-4 w-4" />
          Generate Codex Patch
        </Button>
        <Button type="button" variant="secondary" onClick={() => onCopy("chatGptPacket")} disabled={disabled}>
          <Clipboard className="h-4 w-4" />
          Copy ChatGPT Packet
        </Button>
        <Button type="button" variant="secondary" onClick={() => onCopy("codexPacket")} disabled={disabled}>
          <Clipboard className="h-4 w-4" />
          Copy Codex Packet
        </Button>
        <Button type="button" variant="secondary" onClick={() => onCopy("incidentPacket")} disabled={disabled}>
          <Clipboard className="h-4 w-4" />
          Copy Incident Packet
        </Button>
        <Button type="button" variant="secondary" onClick={onValidate} disabled={disabled || busy}>
          <CheckCircle2 className="h-4 w-4" />
          Validate Production
        </Button>
        <Link
          href={incident?.targetType === "appointment" ? `/architect/debug/appointment?appointmentId=${encodeURIComponent(incident.targetId)}` : "/architect/debug"}
          className={cn("inline-flex min-h-[48px] items-center justify-center rounded-full border border-white/10 bg-white/[0.035] px-4 text-center text-[10px] font-extrabold uppercase tracking-[0.18em] text-white transition hover:border-[#A3FF12]/30", !snapshot && "pointer-events-none opacity-50")}
        >
          Open Deep Debug
        </Link>
      </div>
    </Card>
  );
}

function ValidationPanel({ validation }: { validation: MissionValidationResult | null }) {
  return (
    <Card className="border-white/10 bg-black/25 p-5">
      <div className="flex items-center gap-2 text-white">
        <ShieldCheck className="h-4 w-4" />
        <h2 className="text-lg font-semibold">Validation</h2>
      </div>
      {!validation ? (
        <p className="mt-4 text-sm text-white/58">Run production validation for the selected appointment.</p>
      ) : (
        <div className="mt-4 space-y-2">
          <div className={cn("rounded-lg border p-3 text-sm", statusClass(validation.passed ? "pass" : "fail"))}>
            {validation.passed ? "Validation passed." : "Validation found failed checks."}
          </div>
          {validation.checks.map((item) => (
            <div key={item.stage} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <div>
                <p className="font-mono text-sm text-white">{item.stage}</p>
                {item.reason ? <p className="mt-1 text-xs text-white/48">{item.reason}</p> : null}
              </div>
              <span className={cn("rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em]", statusClass(item.status))}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function ArchitectMissionControl() {
  const [snapshot, setSnapshot] = useState<MissionControlSnapshot | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [validation, setValidation] = useState<MissionValidationResult | null>(null);
  const [repairResult, setRepairResult] = useState<ArchitectRepairResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const incidents = useMemo(() => [...(snapshot?.incidents ?? [])].sort((a, b) => severityRank(a) - severityRank(b)), [snapshot]);
  const selectedIncident = incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0] ?? null;
  const foundation = useMemo(
    () => snapshot?.foundation ?? buildMissionControlFoundation(snapshot?.incidents ?? [], snapshot?.checkedAt),
    [snapshot]
  );

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

  async function runRepair(incident = selectedIncident) {
    if (!incident?.canRepair || incident.repairType !== "payment_routing") return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/architect/repairs/payment-routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: incident.targetId })
      });
      const body = await readJson<ArchitectRepairResult>(response);
      setRepairResult(body);
      setNotice(body.warning ?? (body.repaired ? "Safe repair completed." : "Routing was already repaired."));
      await loadSnapshot();
    } catch (repairError) {
      setError(repairError instanceof Error ? repairError.message : "Safe repair failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runValidation(incident = selectedIncident) {
    if (!incident || incident.targetType !== "appointment") return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/architect/mission-control/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: incident.targetId })
      });
      const body = await readJson<MissionValidationResult>(response);
      setValidation(body);
      setNotice(body.passed ? "Production validation passed." : "Production validation found failed checks.");
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Validation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="px-2 pb-12 pt-4 sm:px-3 lg:px-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-lg border border-white/10 bg-black/35 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-[#7CFF00]/18 bg-[#7CFF00]/8 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
                <ShieldCheck className="h-4 w-4" />
                Mission Control
              </div>
              <h1 className="mt-4 text-3xl font-semibold text-white">BVRB3R Architect Operating System</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
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
        {repairResult?.result === "failed" ? (
          <div className="rounded-lg border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-100">
            {repairResult.error ?? "Repair failed."}
          </div>
        ) : null}

        {loading && !snapshot ? (
          <Card className="border-white/10 bg-black/25 p-6">
            <p className="text-sm text-white/58">Collecting production evidence.</p>
          </Card>
        ) : null}

        {snapshot ? (
          <>
            <MissionControlNavigationPanel foundation={foundation} />
            <CeoCommandCenter foundation={foundation} />
            <DepartmentLanePanel lanes={foundation.departmentLanes} />
            <CoreLoopValidatorPanel validators={foundation.coreLoopValidators} />
            <IncidentTypePanel incidentTypes={foundation.incidentTypes} />
            <SourceVaultPanel sources={foundation.sourceVault} />
            <ActionRegistryPanel actions={foundation.actionRegistry} />
            <AgentRegistryPanel agents={foundation.agentRegistry} />

            <section aria-labelledby="active-incidents" className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-[#d7ffab]">Active Incidents</p>
                  <h2 id="active-incidents" className="mt-2 text-2xl font-semibold text-white">
                    {incidents.length ? `${incidents.length} issue${incidents.length === 1 ? "" : "s"} found` : "No active incidents"}
                  </h2>
                </div>
                {incidents.length ? incidents.map((incident) => (
                  <IncidentCard
                    key={incident.id}
                    incident={incident}
                    selected={selectedIncident?.id === incident.id}
                    busy={busy}
                    onAnalyze={() => setSelectedIncidentId(incident.id)}
                    onRepair={() => {
                      setSelectedIncidentId(incident.id);
                      void runRepair(incident);
                    }}
                    onValidate={() => {
                      setSelectedIncidentId(incident.id);
                      void runValidation(incident);
                    }}
                  />
                )) : (
                  <Card className="border-white/10 bg-black/25 p-5">
                    <p className="text-sm text-white/60">Mission Control found no automatic production incidents.</p>
                  </Card>
                )}
              </div>

              <div className="space-y-5">
                <AnalysisPanel incident={selectedIncident} />
                <ActionsPanel
                  snapshot={snapshot}
                  incident={selectedIncident}
                  busy={busy}
                  onCopy={copyPacket}
                  onRefresh={loadSnapshot}
                  onRepair={() => void runRepair()}
                  onValidate={() => void runValidation()}
                />
                <ValidationPanel validation={validation} />
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
