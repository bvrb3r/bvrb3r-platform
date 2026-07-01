"use client";

// Mission Control HOME cockpit — center system map (cluster view).
// Department lanes render as glowing nodes around the BVRB3R core with connective
// lines; node color is evidence-driven tone (never a hardcoded green). Selecting a
// node drives the Evidence Drawer. SVG + DOM (no canvas) keeps hit-testing reliable.

import { useMemo } from "react";
import { TONE_DOT, type MapNodeView } from "@/components/architect/mission-control/cockpit-selectors";
import type { MissionLaneId } from "@/lib/architect/mission-control/types";

type NodePlacement = MapNodeView & { x: number; y: number };

function placeNodes(nodes: MapNodeView[]): NodePlacement[] {
  const count = Math.max(nodes.length, 1);
  return nodes.map((node, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      x: 50 + Math.cos(angle) * 38,
      y: 50 + Math.sin(angle) * 34
    };
  });
}

export function SystemMap({
  nodes,
  selectedId,
  onSelect
}: {
  nodes: MapNodeView[];
  selectedId: MissionLaneId | null;
  onSelect: (laneId: MissionLaneId) => void;
}) {
  const placed = useMemo(() => placeNodes(nodes), [nodes]);

  return (
    <div
      className="relative flex-1 overflow-hidden rounded-[16px] border border-white/8 bg-[radial-gradient(900px_600px_at_50%_45%,rgba(163,255,18,0.05),rgba(6,9,13,0.6))]"
      data-testid="cockpit-system-map"
    >
      <div className="absolute left-4 top-3 z-10 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/56">BVRB3R System Map</span>
        <span className="flex items-center gap-1 font-mono text-[9px] text-[#d7ffab]">
          Live <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#A3FF12]" />
        </span>
      </div>

      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {placed.map((node) => (
          <line
            key={`line-${node.id}`}
            x1={50}
            y1={50}
            x2={node.x}
            y2={node.y}
            stroke={node.id === selectedId ? TONE_DOT[node.tone] : "rgba(255,255,255,0.08)"}
            strokeWidth={0.3}
          />
        ))}
      </svg>

      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="text-3xl font-black tracking-[0.14em] text-white [text-shadow:0_0_30px_rgba(163,255,18,0.25)] sm:text-4xl">BVRB3R</div>
        <div className="font-mono text-[10px] tracking-[0.32em] text-[#d7ffab]">CORE SYSTEM</div>
      </div>

      {placed.map((node) => (
        <button
          key={node.id}
          type="button"
          onClick={() => onSelect(node.id)}
          data-testid={`cockpit-map-node-${node.id}`}
          className="absolute z-[3] -translate-x-1/2 -translate-y-1/2 rounded-[8px] border bg-black/78 px-2 py-1.5 text-left transition hover:bg-black/90"
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`,
            borderColor: node.id === selectedId ? TONE_DOT[node.tone] : "rgba(255,255,255,0.12)"
          }}
        >
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TONE_DOT[node.tone] }} />
            <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-white/86">{node.label}</span>
          </div>
          <div className="mt-0.5 font-mono text-[8px] text-white/44">{node.status}</div>
        </button>
      ))}
    </div>
  );
}
