"use client";

// Mission Control HOME cockpit — client composition root.
// Receives the SAME MissionControlSnapshot the lane component uses (built server-side
// and passed as a prop) plus the resolved admin identity. Owns cross-panel selection,
// the read-only command transcript, and Codex packet copy. Renders a safe Degraded
// state when the snapshot is null — it never fabricates a Pass.

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { GlassCard } from "@/design/components";
import type { MissionControlSnapshot, MissionLaneId } from "@/lib/architect/mission-control/types";
import {
  resolveReadiness,
  selectCommandDeck,
  selectDirectives,
  selectEnvStrip,
  selectEvidence,
  selectMapNodes,
  selectOfficerLanes,
  selectVitals,
  selectWorkQueue
} from "@/components/architect/mission-control/cockpit-selectors";
import {
  CommandChat,
  CommandDeck,
  EnvStrip,
  EvidenceDrawer,
  OfficerLanes,
  ReadinessRing,
  SessionRail,
  StatusPill,
  SystemVitals,
  TopDirectives,
  WorkQueue
} from "@/components/architect/mission-control/cockpit-panels";
import { SystemMap } from "@/components/architect/mission-control/cockpit-map";
import { VoiceCommand } from "@/components/architect/mission-control/cockpit-voice";

type CockpitUser = { name: string; email: string };

export function CockpitHome({
  snapshot,
  user
}: {
  snapshot: MissionControlSnapshot | null;
  user: CockpitUser;
}) {
  const [selectedLane, setSelectedLane] = useState<MissionLaneId | null>(null);
  const [transcript, setTranscript] = useState<string[]>([]);

  const views = useMemo(() => {
    if (!snapshot) return null;
    const foundation = snapshot.foundation;
    return {
      envStrip: selectEnvStrip(snapshot),
      vitals: selectVitals(snapshot.health),
      readiness: resolveReadiness(foundation),
      mapNodes: selectMapNodes(foundation),
      officerLanes: selectOfficerLanes(foundation),
      workQueue: selectWorkQueue(snapshot),
      commandDeck: selectCommandDeck(foundation)
    };
  }, [snapshot]);

  const directives = useMemo(
    () => (views ? selectDirectives(views.readiness) : []),
    [views]
  );

  const evidence = useMemo(
    () => (snapshot ? selectEvidence(snapshot.foundation, selectedLane) : null),
    [snapshot, selectedLane]
  );

  const pushTranscript = (line: string) => setTranscript((prev) => [...prev, line]);

  const handleCommand = (text: string) => {
    pushTranscript(`You: ${text}`);
    const laneMatch = views?.mapNodes.find((node) => text.toLowerCase().includes(node.label.toLowerCase()));
    if (laneMatch) {
      setSelectedLane(laneMatch.id);
      pushTranscript(`Cockpit: Opened ${laneMatch.label} evidence (read-only).`);
      return;
    }
    pushTranscript("Cockpit: Read-only cockpit — evidence surfaced, no action executed.");
  };

  const handleCopyPacket = (packetId: string) => {
    const packet = snapshot?.packets[packetId]?.codexPacket;
    if (!packet) return;
    void navigator.clipboard?.writeText(packet);
    pushTranscript(`Cockpit: Copied Codex packet for ${packetId}.`);
  };

  if (!snapshot || !views || !evidence) {
    return (
      <main className="px-2 py-4 sm:px-3 lg:px-5" data-testid="architect-mission-control-home">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <GlassCard className="rounded-[20px] p-5" data-testid="cockpit-degraded">
            <div className="flex items-center gap-2 text-amber-100">
              <AlertTriangle className="h-4 w-4" />
              <h1 className="text-lg font-black text-white">Mission Control — Degraded</h1>
              <StatusPill status="Needs Review" tone="review" />
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/64">
              Production evidence could not be collected, so no system status can be shown. Every area stays
              <span className="font-black text-amber-100"> Needs Review</span> — the cockpit never reports Pass from absent proof.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <SessionRail user={user} />
            </div>
            <Link
              href="/architect"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[8px] border border-[#A3FF12]/28 bg-[#A3FF12]/12 px-4 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#A3FF12]/16"
            >
              Retry evidence collection
            </Link>
          </GlassCard>
        </div>
      </main>
    );
  }

  return (
    <main className="px-2 py-4 sm:px-3 lg:px-5" data-testid="architect-mission-control-home">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3">
        <EnvStrip data={views.envStrip} />

        <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
          {/* LEFT RAIL */}
          <div className="flex min-h-0 flex-col gap-3">
            <SessionRail user={user} />
            <SystemVitals vitals={views.vitals} />
            <TopDirectives directives={directives} />
          </div>

          {/* CENTER */}
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex min-h-[300px] flex-col">
              <SystemMap nodes={views.mapNodes} selectedId={selectedLane} onSelect={setSelectedLane} />
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <VoiceCommand onCommand={handleCommand} />
              <GlassCard className="flex items-center justify-center rounded-[16px] px-4 py-2">
                <ReadinessRing readiness={views.readiness} />
              </GlassCard>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex min-h-[280px] flex-col">
                <WorkQueueWithChat
                  tabs={views.workQueue}
                  transcript={transcript}
                  onCopyPacket={handleCopyPacket}
                  onSend={handleCommand}
                />
              </div>
              <div className="flex min-h-[280px] flex-col">
                <OfficerLanes lanes={views.officerLanes} selectedId={selectedLane} onSelect={setSelectedLane} />
              </div>
            </div>
          </div>

          {/* RIGHT RAIL */}
          <div className="flex min-h-0 flex-col gap-3">
            <CommandDeck items={views.commandDeck} />
            <EvidenceDrawer evidence={evidence} />
          </div>
        </div>
      </div>
    </main>
  );
}

// Local composite: the prototype nests the command chat under the Work Queue.
function WorkQueueWithChat({
  tabs,
  transcript,
  onCopyPacket,
  onSend
}: {
  tabs: ReturnType<typeof selectWorkQueue>;
  transcript: string[];
  onCopyPacket: (packetId: string) => void;
  onSend: (text: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <WorkQueue tabs={tabs} onCopyPacket={onCopyPacket} />
      <CommandChat transcript={transcript} onSend={onSend} />
    </div>
  );
}
