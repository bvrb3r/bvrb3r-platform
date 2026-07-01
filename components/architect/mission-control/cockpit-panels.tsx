"use client";

// Mission Control HOME cockpit — presentational panels.
// These render the SAME snapshot the lane component uses, styled with @/design tokens
// (GlassCard + brand #A3FF12 on black glass). No data fetching, no money mutation.

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { Activity, Clipboard, Command, Radio, Send, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/design/components";
import { cn } from "@/lib/utils";
import type { MissionLaneId, MissionReadinessBreakdown } from "@/lib/architect/mission-control/types";
import {
  TONE_CLASSES,
  TONE_DOT,
  type CommandDeckItemView,
  type DirectiveView,
  type EnvChipView,
  type EvidenceView,
  type OfficerLaneView,
  type VitalView,
  type WorkQueueTabId,
  type WorkQueueTabView
} from "@/components/architect/mission-control/cockpit-selectors";

export function StatusPill({ status, tone }: { status: string; tone: keyof typeof TONE_CLASSES }) {
  return (
    <span className={cn("rounded-[8px] border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]", TONE_CLASSES[tone])}>
      {status}
    </span>
  );
}

export function CockpitClock() {
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return <span className="font-mono text-sm text-white/78 tabular-nums">{now || "--:--:--"}</span>;
}

export function EnvStrip({
  data
}: {
  data: { env: string; commit: string; deploy: string; chips: EnvChipView[] };
}) {
  return (
    <GlassCard className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[16px] px-4 py-3" data-testid="cockpit-env-strip">
      <div className="flex items-center gap-2 pr-3">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-[6px] border border-[#A3FF12]/40">
          <span className="h-1.5 w-1.5 rounded-[2px] bg-[#A3FF12] shadow-[0_0_8px_#A3FF12]" />
        </span>
        <span className="text-[13px] font-black uppercase tracking-[0.2em] text-white">BVRB3R</span>
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/44">Mission Control</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-white/56">
        <span>ENV:&nbsp;<b className="text-[#d7ffab]">{data.env}</b></span>
        <span>COMMIT:&nbsp;<b className="text-white/78">{data.commit}</b></span>
        <span>DEPLOY:&nbsp;<b className="text-white/78">{data.deploy}</b></span>
      </div>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        {data.chips.map((chip) => (
          <span
            key={chip.label}
            className={cn("inline-flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em]", TONE_CLASSES[chip.tone])}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TONE_DOT[chip.tone] }} />
            {chip.label}:&nbsp;{chip.value}
          </span>
        ))}
        <CockpitClock />
      </div>
    </GlassCard>
  );
}

export function SessionRail({ user }: { user: { name: string; email: string } }) {
  return (
    <GlassCard className="rounded-[16px] p-4" data-testid="cockpit-session-rail">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#A3FF12]/40 bg-[linear-gradient(135deg,rgba(163,255,18,0.18),rgba(8,8,8,0.95))] font-mono text-xs font-bold text-[#d7ffab]">
          BVR
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{user.name}</p>
          <p className="truncate font-mono text-[11px] text-white/56">{user.email}</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/56">
        Executive truth, workflow health, source vault, action boundaries, and Hive AI agents.
      </p>
      <div className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#d7ffab]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#A3FF12]" />
        Active session
      </div>
    </GlassCard>
  );
}

export function SystemVitals({ vitals }: { vitals: VitalView[] }) {
  return (
    <GlassCard className="flex min-h-0 flex-1 flex-col rounded-[16px] p-4" data-testid="cockpit-system-vitals">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/56">
          <Activity className="h-3.5 w-3.5" /> System Vitals
        </span>
        <span className="font-mono text-[9px] text-white/40">{vitals.length} systems</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {vitals.map((vital) => (
          <div key={vital.key} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 border-b border-white/5 py-1.5">
            <span className="h-2 w-2 justify-self-center rounded-full" style={{ backgroundColor: TONE_DOT[vital.tone] }} />
            <span className="truncate text-xs text-white/78" title={vital.summary}>{vital.label}</span>
            <StatusPill status={vital.status} tone={vital.tone} />
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

export function TopDirectives({ directives }: { directives: DirectiveView[] }) {
  return (
    <GlassCard className="rounded-[16px] p-4" data-testid="cockpit-directives">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/56">Top Directives</div>
      {directives.length ? (
        <div className="flex flex-col gap-2">
          {directives.map((directive) => (
            <div key={directive.id} className="flex gap-2 rounded-[8px] border border-white/8 bg-white/[0.03] p-2">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] bg-white/10 font-mono text-[10px] font-bold text-white/72">
                {directive.n}
              </div>
              <div className="min-w-0">
                <div className={cn("font-mono text-[9px] uppercase tracking-[0.1em]", TONE_CLASSES[directive.tone], "border-0 bg-transparent px-0")}>
                  {directive.tag}
                </div>
                <div className="text-xs leading-4 text-white/86">{directive.title}</div>
                <div className="mt-0.5 truncate text-[10px] text-white/48">Next: {directive.next}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-white/48">No release blockers reported from connected evidence.</p>
      )}
    </GlassCard>
  );
}

export function ReadinessRing({ readiness }: { readiness: MissionReadinessBreakdown }) {
  const tone = readiness.overallStatus === "Pass" ? "pass" : readiness.overallStatus === "Failed" ? "failed" : "review";
  const circumference = 2 * Math.PI * 52;
  const dash = (readiness.v1ReadinessPercent / 100) * circumference;

  return (
    <div className="flex flex-col items-center" data-testid="cockpit-readiness-ring">
      <div className="relative h-[132px] w-[132px]">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke={TONE_DOT[tone]}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#d7ffab]">V1 Readiness</span>
          <span className="text-3xl font-black leading-none text-white">{readiness.v1ReadinessPercent}%</span>
          <StatusPill status={readiness.overallStatus} tone={tone} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono text-[9px] uppercase tracking-[0.1em]">
        <div>
          <div className="text-[#d7ffab]" data-testid="cockpit-readiness-pass">{readiness.v1RequiredPassCount}</div>
          <div className="text-white/44">Pass</div>
        </div>
        <div>
          <div className="text-amber-200" data-testid="cockpit-readiness-review">{readiness.v1RequiredNeedsReviewCount}</div>
          <div className="text-white/44">Review</div>
        </div>
        <div>
          <div className="text-rose-300" data-testid="cockpit-readiness-blocked">{readiness.currentReleaseBlockers.length}</div>
          <div className="text-white/44">Blocked</div>
        </div>
      </div>
    </div>
  );
}

export function WorkQueue({
  tabs,
  onCopyPacket
}: {
  tabs: WorkQueueTabView[];
  onCopyPacket: (packetId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<WorkQueueTabId>("critical");
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <GlassCard className="flex min-h-0 flex-1 flex-col rounded-[16px] p-4" data-testid="cockpit-work-queue">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-white/56">Work Queue</div>
      <div className="mb-3 flex flex-wrap gap-3 border-b border-white/8 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            data-testid={`cockpit-work-queue-tab-${tab.id}`}
            className={cn(
              "border-b-2 pb-1 font-mono text-[10px] uppercase tracking-[0.08em] transition",
              tab.id === active?.id ? "border-[#A3FF12] text-white" : "border-transparent text-white/48 hover:text-white/72"
            )}
          >
            {tab.label} <span className="text-white/40">{tab.count}</span>
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {active && active.items.length ? (
          active.items.map((item) => (
            <div key={item.id} className="flex items-start gap-3 border-b border-white/5 py-2.5">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TONE_DOT[item.tone] }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-white">{item.title}</span>
                  <StatusPill status={item.status} tone={item.tone} />
                </div>
                <p className="mt-0.5 text-[11px] leading-4 text-white/56">{item.body}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-white/36">{item.meta}</span>
                  {item.packetId ? (
                    <button
                      type="button"
                      onClick={() => onCopyPacket(item.packetId as string)}
                      className="inline-flex items-center gap-1 rounded-[6px] border border-[#A3FF12]/30 bg-[#A3FF12]/8 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#d7ffab] transition hover:bg-[#A3FF12]/14"
                    >
                      <Clipboard className="h-3 w-3" /> Copy packet
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="py-6 text-center text-xs text-white/44">No items in this queue from connected evidence.</p>
        )}
      </div>
    </GlassCard>
  );
}

export function OfficerLanes({
  lanes,
  selectedId,
  onSelect
}: {
  lanes: OfficerLaneView[];
  selectedId: MissionLaneId | null;
  onSelect: (laneId: MissionLaneId) => void;
}) {
  return (
    <GlassCard className="flex min-h-0 flex-1 flex-col rounded-[16px] p-4" data-testid="cockpit-officer-lanes">
      <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/56">
        <ShieldCheck className="h-3.5 w-3.5" /> Officer Lanes
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
        {lanes.map((lane) => (
          <div
            key={lane.id}
            className={cn(
              "flex flex-col gap-1 rounded-[10px] border bg-black/24 p-2.5 transition",
              lane.id === selectedId ? "border-[#A3FF12]/40" : "border-white/8"
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(lane.id)}
              data-testid={`cockpit-officer-lane-${lane.id}`}
              className="text-left"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-white/86">{lane.label}</span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: TONE_DOT[lane.tone] }} />
              </div>
              <p className="mt-1 line-clamp-2 text-[10px] leading-3 text-white/44">{lane.note}</p>
            </button>
            <Link
              href={lane.href as Route}
              data-testid={`cockpit-officer-link-${lane.id}`}
              className="mt-1 rounded-[5px] border border-[#A3FF12]/22 px-2 py-1 text-center font-mono text-[9px] uppercase tracking-[0.08em] text-[#d7ffab] transition hover:bg-[#A3FF12]/10"
            >
              Open lane
            </Link>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

export function CommandDeck({ items }: { items: CommandDeckItemView[] }) {
  return (
    <GlassCard className="flex min-h-0 flex-1 flex-col rounded-[16px] p-4" data-testid="cockpit-command-deck">
      <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/56">
        <Command className="h-3.5 w-3.5" /> Command Deck
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-[8px] border border-white/8 bg-white/[0.02] p-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TONE_DOT[item.tone] }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-white">{item.label}</div>
                <div className="truncate font-mono text-[9px] text-white/40">{item.meta}</div>
              </div>
              <StatusPill status={item.status} tone={item.tone} />
            </div>
          ))
        ) : (
          <p className="text-xs text-white/44">No registered actions from connected evidence.</p>
        )}
      </div>
    </GlassCard>
  );
}

export function EvidenceDrawer({ evidence }: { evidence: EvidenceView }) {
  return (
    <GlassCard className="flex min-h-0 flex-col rounded-[16px] p-4" data-testid="cockpit-evidence-drawer">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/56">Evidence Drawer</div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-black text-white">{evidence.title}</span>
        <StatusPill status={evidence.status} tone={evidence.tone} />
      </div>
      <dl className="mt-3 flex flex-col gap-2 text-[11px]">
        <div className="flex justify-between gap-3">
          <dt className="font-mono uppercase tracking-[0.08em] text-white/40">Source</dt>
          <dd className="truncate text-right text-white/72">{evidence.source}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="font-mono uppercase tracking-[0.08em] text-white/40">Confidence</dt>
          <dd className="text-right text-white/72">{evidence.confidence}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] leading-4 text-white/56">{evidence.detail}</p>
      {evidence.items.length ? (
        <div className="mt-3 flex min-h-0 flex-col gap-1 overflow-y-auto border-t border-white/8 pt-2">
          {evidence.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] text-white/72">{item.label}</span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: TONE_DOT[item.tone] }} />
            </div>
          ))}
        </div>
      ) : null}
    </GlassCard>
  );
}

export function CommandChat({ transcript, onSend }: { transcript: string[]; onSend: (text: string) => void }) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="cockpit-command-chat">
      {transcript.length ? (
        <div className="max-h-20 overflow-y-auto rounded-[8px] border border-white/8 bg-black/30 p-2 text-[11px] text-white/64">
          {transcript.slice(-4).map((line, index) => (
            <p key={`${index}-${line.slice(0, 8)}`} className="truncate">{line}</p>
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2 rounded-[9px] border border-white/12 bg-black/40 px-3 py-2">
        <Radio className="h-3.5 w-3.5 text-white/36" />
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          placeholder="Type a command or ask anything…"
          className="flex-1 bg-transparent text-[13px] text-white/86 outline-none placeholder:text-white/36"
          data-testid="cockpit-command-chat-input"
        />
        <button type="button" onClick={submit} aria-label="Send command" className="text-[#d7ffab] transition hover:brightness-125">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

