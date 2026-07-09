"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clipboard, FileCode2, Search, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ArchitectDebugPacket, ArchitectRepairResult } from "@/lib/architect/debug/types";
import { cn } from "@/lib/utils";

type DebugMode = "appointment" | "booking-loop" | "payment" | "routing" | "schema" | "logs" | "deployment" | string;

type ApiError = {
  ok: false;
  error?: string;
  safeMessage?: string;
  stage?: string;
};

const modeOptions = [
  { id: "appointment", label: "Appointment" },
  { id: "booking-loop", label: "Booking Loop" },
  { id: "payment", label: "Payment" },
  { id: "routing", label: "Routing" },
  { id: "schema", label: "Schema" },
  { id: "logs", label: "Parse Log" },
  { id: "deployment", label: "Deployment" }
];

function statusClass(value?: string | null) {
  const normalized = `${value ?? ""}`.toLowerCase();
  if (["healthy", "pass", "eligible", "completed", "succeeded"].some((token) => normalized.includes(token))) {
    return "border-[#C4F24E]/20 bg-[#C4F24E]/10 text-[#e4f9b8]";
  }
  if (["warning", "review", "available", "pending"].some((token) => normalized.includes(token))) {
    return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  }
  if (["broken", "critical", "fail", "missing", "blocked"].some((token) => normalized.includes(token))) {
    return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  }
  return "border-white/10 bg-black/20 text-white/70";
}

function entityTitle(value: string) {
  return value.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase()).trim();
}

function getEndpoint(mode: DebugMode, target: string) {
  const trimmed = target.trim();
  const query = encodeURIComponent(trimmed);
  switch (mode) {
    case "booking-loop":
      return `/api/architect/debug/booking-loop?appointmentId=${query}`;
    case "payment":
      return `/api/architect/debug/payment?appointmentId=${query}`;
    case "routing":
      return `/api/architect/debug/routing?appointmentId=${query}`;
    case "schema":
      return `/api/architect/debug/schema?table=${query}`;
    case "deployment":
      return "/api/architect/debug/deployment";
    default:
      return `/api/architect/debug/appointment?appointmentId=${query}`;
  }
}

function getInitialMode(initialMode?: string): DebugMode {
  if (initialMode === "payment" || initialMode === "routing" || initialMode === "schema" || initialMode === "logs") {
    return initialMode;
  }
  if (initialMode === "deployments") {
    return "deployment";
  }
  return "appointment";
}

async function readJson<T>(response: Response) {
  const body = (await response.json().catch(() => ({}))) as T | ApiError;
  if (!response.ok || (typeof body === "object" && body && "ok" in body && body.ok === false)) {
    const errorBody = body as ApiError;
    throw new Error(errorBody.safeMessage ?? errorBody.error ?? `Request failed with status ${response.status}`);
  }
  return body as T;
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-[20px] border border-white/10 bg-black/35 p-3 text-xs leading-5 text-white/70">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function PacketSummary({ packet }: { packet: ArchitectDebugPacket }) {
  return (
    <Card className="rounded-[28px] border-white/10 bg-black/25 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/45">Diagnosis</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{packet.summary.headline}</h2>
          <p className="mt-2 text-sm text-white/60">{packet.summary.recommendedAction}</p>
        </div>
        <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", statusClass(packet.summary.health))}>
          {packet.summary.health}
        </span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-[20px] border border-white/10 bg-black/20 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-white/40">Code</p>
          <p className="mt-2 break-words font-mono text-sm text-white">{packet.summary.diagnosisCode}</p>
        </div>
        <div className="rounded-[20px] border border-white/10 bg-black/20 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-white/40">Layer</p>
          <p className="mt-2 text-sm text-white">{packet.diagnosis.affectedLayer}</p>
        </div>
        <div className="rounded-[20px] border border-white/10 bg-black/20 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-white/40">Repair</p>
          <p className="mt-2 text-sm text-white">{packet.summary.canRepair ? packet.summary.repairType : "No safe repair"}</p>
        </div>
      </div>
    </Card>
  );
}

function EvidencePanel({ packet }: { packet: ArchitectDebugPacket }) {
  const evidence = [
    ...packet.evidence.databaseTruth,
    ...packet.evidence.schemaEvidence,
    ...packet.evidence.routeEvidence,
    ...packet.evidence.logEvidence
  ];
  return (
    <Card className="rounded-[28px] border-white/10 bg-black/25 p-5">
      <h3 className="text-lg font-semibold text-white">Evidence</h3>
      <div className="mt-4 space-y-3">
        {evidence.map((item, index) => (
          <div key={`${item.label}-${index}`} className="rounded-[20px] border border-white/10 bg-black/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-white">{item.label}</p>
              <span className={cn("rounded-full border px-2 py-1 text-[11px]", statusClass(item.status))}>{item.status}</span>
            </div>
            <p className="mt-2 text-sm text-white/58">{item.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function EntitiesPanel({ packet }: { packet: ArchitectDebugPacket }) {
  const entries = Object.entries(packet.entities).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value);
  });
  return (
    <Card className="rounded-[28px] border-white/10 bg-black/25 p-5">
      <h3 className="text-lg font-semibold text-white">Database Truth</h3>
      <div className="mt-4 grid gap-3">
        {entries.map(([key, value]) => (
          <details key={key} className="rounded-[20px] border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-white">{entityTitle(key)}</summary>
            <div className="mt-3">
              <JsonBlock value={value} />
            </div>
          </details>
        ))}
      </div>
    </Card>
  );
}

function ChecklistPanel({ packet }: { packet: ArchitectDebugPacket }) {
  return (
    <Card className="rounded-[28px] border-white/10 bg-black/25 p-5">
      <h3 className="text-lg font-semibold text-white">Validation Checklist</h3>
      <div className="mt-4 space-y-2">
        {packet.validationChecklist.map((item) => (
          <div key={item.stage} className="flex items-center justify-between gap-3 rounded-[20px] border border-white/10 bg-black/20 p-3">
            <div>
              <p className="font-mono text-sm text-white">{item.stage}</p>
              {item.reason ? <p className="mt-1 text-xs text-white/50">{item.reason}</p> : null}
            </div>
            <span className={cn("rounded-full border px-2 py-1 text-[11px]", statusClass(item.status))}>{item.status}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SidePanel({
  packet,
  onRepair,
  repairPending,
  repairResult
}: {
  packet: ArchitectDebugPacket;
  onRepair: () => void;
  repairPending: boolean;
  repairResult: ArchitectRepairResult | null;
}) {
  return (
    <div className="space-y-4">
      <Card className="rounded-[28px] border-white/10 bg-black/25 p-5">
        <div className="flex items-center gap-2 text-white">
          <Wrench className="h-4 w-4" />
          <h3 className="font-semibold">Repair</h3>
        </div>
        <div className="mt-4 space-y-3">
          {packet.repairActions.length ? packet.repairActions.map((action) => (
            <div key={action.repairType} className="rounded-[20px] border border-white/10 bg-black/20 p-3">
              <p className="font-medium text-white">{action.label}</p>
              <p className="mt-1 text-sm text-white/58">{action.description}</p>
              <Button className="mt-3 w-full" disabled={!action.canRun || repairPending} onClick={onRepair}>
                {repairPending ? "Running repair" : "Run safe repair"}
              </Button>
            </div>
          )) : (
            <p className="text-sm text-white/58">No safe repair is available for this packet.</p>
          )}
          {repairResult ? (
            <div className={cn("rounded-[20px] border p-3 text-sm", statusClass(repairResult.ok ? "succeeded" : "failed"))}>
              {repairResult.warning ?? (repairResult.ok ? "Repair completed." : repairResult.error ?? "Repair failed.")}
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="rounded-[28px] border-white/10 bg-black/25 p-5">
        <div className="flex items-center gap-2 text-white">
          <FileCode2 className="h-4 w-4" />
          <h3 className="font-semibold">Codex Prompt</h3>
        </div>
        <textarea
          readOnly
          value={packet.codexPrompt ?? ""}
          className="mt-4 h-64 w-full resize-none rounded-[20px] border border-white/10 bg-black/30 p-3 font-mono text-xs text-white/70"
        />
      </Card>

      <Card className="rounded-[28px] border-white/10 bg-black/25 p-5">
        <div className="flex items-center gap-2 text-white">
          <Clipboard className="h-4 w-4" />
          <h3 className="font-semibold">SQL</h3>
        </div>
        <div className="mt-4 space-y-3">
          {packet.sqlSnippets.map((snippet) => (
            <div key={snippet.label}>
              <p className="text-sm font-medium text-white">{snippet.label}</p>
              <pre className="mt-2 overflow-auto rounded-[20px] border border-white/10 bg-black/30 p-3 text-xs text-white/65">{snippet.sql}</pre>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function DebugConsole({ initialMode }: { initialMode?: string }) {
  const [mode, setMode] = useState<DebugMode>(getInitialMode(initialMode));
  const [target, setTarget] = useState("2090ae1e-3b7c-59d2-81ac-9f88908fd735");
  const [logText, setLogText] = useState("");
  const [packet, setPacket] = useState<ArchitectDebugPacket | null>(null);
  const [logResult, setLogResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [repairPending, setRepairPending] = useState(false);
  const [repairResult, setRepairResult] = useState<ArchitectRepairResult | null>(null);

  const quickCards = useMemo(() => [
    { label: "Booking Loop", mode: "booking-loop", detail: "Demand to calendar visibility" },
    { label: "Payment Capture", mode: "payment", detail: "Saved card and payment row" },
    { label: "Payout Eligibility", mode: "routing", detail: "Routing and release readiness" },
    { label: "Schema Drift", mode: "schema", detail: "Production columns" }
  ], []);

  async function runDebug() {
    setError(null);
    setRepairResult(null);
    setLoading(true);
    try {
      if (mode === "logs") {
        const response = await fetch("/api/architect/debug/parse-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ log: logText })
        });
        setLogResult(await readJson<unknown>(response));
        setPacket(null);
        return;
      }

      const response = await fetch(getEndpoint(mode, target));
      const body = await readJson<ArchitectDebugPacket>(response);
      setPacket(body);
      setLogResult(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Debug request failed.");
    } finally {
      setLoading(false);
    }
  }

  async function runRoutingRepair() {
    if (!packet?.entities.appointment?.id) return;
    setRepairPending(true);
    setError(null);
    try {
      const response = await fetch("/api/architect/repairs/payment-routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: packet.entities.appointment.id })
      });
      const result = await readJson<ArchitectRepairResult>(response);
      setRepairResult(result);
      await runDebug();
    } catch (repairError) {
      setError(repairError instanceof Error ? repairError.message : "Repair failed.");
    } finally {
      setRepairPending(false);
    }
  }

  return (
    <main className="px-2 pb-12 pt-4 sm:px-3 lg:px-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.92),rgba(5,5,5,0.96))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.34)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#C4F24E]/18 bg-[#C4F24E]/8 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#e4f9b8]">
                <ShieldCheck className="h-4 w-4" />
                Production command center
              </div>
              <h1 className="mt-4 text-3xl font-semibold text-white">BVRB3R Architect Debug Console</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">
                Analyze one production symptom at a time, review the evidence packet, and run safe repairs only when the system exposes them.
              </p>
            </div>
            <div className="grid gap-2 text-sm text-white/62 sm:grid-cols-3 lg:min-w-[28rem]">
              <div className="rounded-[20px] border border-white/10 bg-black/20 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Loop</p>
                <p className="mt-1 text-white">Evidence led</p>
              </div>
              <div className="rounded-[20px] border border-white/10 bg-black/20 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Repair</p>
                <p className="mt-1 text-white">Safe only</p>
              </div>
              <div className="rounded-[20px] border border-white/10 bg-black/20 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-white/40">Audit</p>
                <p className="mt-1 text-white">Tracked</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card className="rounded-[28px] border-white/10 bg-black/25 p-5">
            <div className="grid gap-3 lg:grid-cols-[12rem_minmax(0,1fr)_auto]">
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value)}
                className="min-h-11 rounded-[20px] border border-white/10 bg-black/30 px-3 text-sm text-white"
              >
                {modeOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              {mode === "logs" ? (
                <textarea
                  value={logText}
                  onChange={(event) => setLogText(event.target.value)}
                  placeholder="Paste Vercel runtime log"
                  className="min-h-24 rounded-[20px] border border-white/10 bg-black/30 p-3 text-sm text-white"
                />
              ) : (
                <Input
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder={mode === "schema" ? "payment_routing_records" : "appointment id"}
                  className="min-h-11 border-white/10 bg-black/30 text-white"
                />
              )}
              <Button onClick={runDebug} disabled={loading || (mode !== "deployment" && mode !== "logs" && !target.trim())}>
                <Search className="mr-2 h-4 w-4" />
                {loading ? "Collecting" : "Run Debug"}
              </Button>
            </div>
            {error ? (
              <div className="mt-4 flex items-start gap-2 rounded-[20px] border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-100">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                {error}
              </div>
            ) : null}
          </Card>

          <Card className="rounded-[28px] border-white/10 bg-black/25 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/50">Quick Actions</h2>
            <div className="mt-3 grid gap-2">
              {quickCards.map((card) => (
                <button
                  key={card.mode}
                  type="button"
                  onClick={() => setMode(card.mode)}
                  className="rounded-[20px] border border-white/10 bg-black/20 p-3 text-left transition hover:border-[#C4F24E]/22"
                >
                  <p className="text-sm font-medium text-white">{card.label}</p>
                  <p className="mt-1 text-xs text-white/50">{card.detail}</p>
                </button>
              ))}
            </div>
          </Card>
        </section>

        {packet ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="space-y-5">
              <PacketSummary packet={packet} />
              <div className="grid gap-5 lg:grid-cols-2">
                <EvidencePanel packet={packet} />
                <ChecklistPanel packet={packet} />
              </div>
              <EntitiesPanel packet={packet} />
            </div>
            <SidePanel packet={packet} onRepair={runRoutingRepair} repairPending={repairPending} repairResult={repairResult} />
          </section>
        ) : null}

        {logResult ? (
          <Card className="rounded-[28px] border-white/10 bg-black/25 p-5">
            <div className="mb-4 flex items-center gap-2 text-white">
              <CheckCircle2 className="h-4 w-4" />
              <h2 className="font-semibold">Parsed Log Evidence</h2>
            </div>
            <JsonBlock value={logResult} />
          </Card>
        ) : null}
      </div>
    </main>
  );
}
