"use client";

// Mission Control HOME cockpit — 3D map panel (data + drawer + live polling).
// Composes the real snapshot → map model → <SystemMap3D>, holds the selected
// node, renders the evidence drawer, and polls for live updates so the dots
// track the truth of the system as it changes.
//
// Read-only / Architect-only. No writes, no new tables. "Open lane" links into
// the existing lane routes; "Copy Codex-safe fix packet" copies the existing
// Codex packet already generated for the incident (snapshot.packets) — prompt
// copy never marks anything Pass. Polling keeps the last good snapshot on any
// refresh failure; degraded truth surfaces through the evidence itself.

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Route } from "next";
import Link from "next/link";
import type { MissionControlSnapshot } from "@/lib/architect/mission-control/types";
import { SystemMap3D } from "@/components/architect/mission-control/cockpit-map-3d";
import { buildMapModel } from "@/components/architect/mission-control/cockpit-map-model";

export interface MissionControlMapPanelProps {
  snapshot: MissionControlSnapshot;
  /** Optional: re-fetch the snapshot for live updates (must resolve to ok:true snapshot). */
  refresh?: () => Promise<MissionControlSnapshot>;
  pollMs?: number;
  /** Optional: notify the parent cockpit which lane the selected node belongs to. */
  onLaneSelect?: (laneId: string | null) => void;
}

const PILL: Record<string, CSSProperties> = {
  pass: { background: "rgba(52,208,88,.14)", color: "#8fe6a5", border: "1px solid rgba(52,208,88,.3)" },
  warning: { background: "rgba(245,185,51,.14)", color: "#efc888", border: "1px solid rgba(245,185,51,.3)" },
  failed: { background: "rgba(251,90,106,.14)", color: "#f8a6ae", border: "1px solid rgba(251,90,106,.3)" },
  unknown: { background: "rgba(120,140,130,.14)", color: "#b9c6bd", border: "1px solid rgba(120,140,130,.3)" },
};

export function MissionControlMapPanel({ snapshot: initial, refresh, pollMs = 20000, onLaneSelect }: MissionControlMapPanelProps) {
  const [snapshot, setSnapshot] = useState<MissionControlSnapshot>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [packetCopied, setPacketCopied] = useState(false);

  useEffect(() => setSnapshot(initial), [initial]);
  useEffect(() => setPacketCopied(false), [selectedId]);

  // live polling — keep last-good snapshot on failure; never fabricate state
  useEffect(() => {
    if (!refresh) return;
    let alive = true;
    const id = setInterval(async () => {
      try {
        const next = await refresh();
        if (alive && next && next.ok === true) setSnapshot(next);
      } catch {
        // keep last-good; degraded truth shows through the evidence itself
      }
    }, pollMs);
    return () => { alive = false; clearInterval(id); };
  }, [refresh, pollMs]);

  const model = useMemo(() => buildMapModel(snapshot), [snapshot]);
  const selected = useMemo(() => model.nodes.find((n) => n.id === selectedId) ?? null, [model, selectedId]);

  const handleSelect = (id: string | null) => {
    setSelectedId(id);
    if (!onLaneSelect) return;
    const node = id ? model.nodes.find((n) => n.id === id) : null;
    onLaneSelect(node?.clusterId ?? null);
  };

  const connections = useMemo(() => {
    if (!selected) return { sends: [] as string[], receives: [] as string[] };
    const nameOf = (id: string) => model.nodes.find((n) => n.id === id)?.name ?? id;
    const sends = model.edges.filter((e) => e.from === selected.id).map((e) => nameOf(e.to));
    const receives = model.edges.filter((e) => e.to === selected.id).map((e) => nameOf(e.from));
    return { sends, receives };
  }, [selected, model]);

  const codexPacket = selected?.incidentId ? snapshot.packets[selected.incidentId]?.codexPacket : undefined;

  const handleCopyPacket = () => {
    if (!codexPacket) return;
    void navigator.clipboard?.writeText(codexPacket);
    setPacketCopied(true);
  };

  const laneHref = (clusterId: string): Route =>
    (`/architect/${clusterId === "content_community" ? "content-community" : clusterId}`) as Route;

  return (
    <div style={{ position: "relative" }} data-testid="cockpit-map-panel">
      <SystemMap3D
        clusters={model.clusters}
        nodes={model.nodes}
        edges={model.edges}
        selectedId={selectedId}
        onSelect={handleSelect}
        height={524}
      />

      {selected && (
        <div
          data-testid="cockpit-map-drawer"
          style={{ position: "absolute", right: 12, top: 12, bottom: 12, width: 300, border: "1px solid rgba(124,255,0,.18)", borderRadius: 12, background: "rgba(6,11,9,.95)", backdropFilter: "blur(12px)", padding: 16, overflow: "auto", boxShadow: "-14px 0 40px rgba(0,0,0,.5)" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: 1.3, color: "#8fbf9a" }}>
              {model.clusters.find((c) => c.id === selected.clusterId)?.label ?? selected.clusterId}
            </span>
            <button
              type="button"
              aria-label="Close node detail"
              onClick={() => handleSelect(null)}
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#7f8f86", cursor: "pointer", background: "transparent", border: "none", padding: 0 }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#eafff0", marginTop: 8 }}>{selected.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <span style={{ display: "inline-block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: .8, padding: "3px 9px", borderRadius: 7, ...PILL[selected.status] }}>
              {selected.status === "pass" ? "Pass" : selected.status === "warning" ? "Needs Review" : selected.status === "failed" ? "Failed" : "Unknown"}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: "#5f6d64" }}>spin paused</span>
          </div>
          {selected.desc && <div style={{ fontSize: 13, lineHeight: 1.55, color: "#aebbb2", marginTop: 12 }}>{selected.desc}</div>}

          {selected.issue && (
            <div style={{ marginTop: 12, border: `1px solid ${selected.status === "failed" ? "rgba(251,90,106,.28)" : "rgba(245,185,51,.28)"}`, background: selected.status === "failed" ? "rgba(251,90,106,.09)" : "rgba(245,185,51,.09)", borderRadius: 9, padding: "10px 12px", fontSize: 12, lineHeight: 1.5, color: selected.status === "failed" ? "#f2b3ba" : "#e8cf9a" }}>
              ⚠ {selected.issue}
            </div>
          )}

          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 1.4, color: "#5f6d64", marginTop: 16 }}>DATA FLOW</div>
          {connections.sends.length > 0 && <div style={{ fontSize: 12, color: "#9fb3a8", marginTop: 6 }}><span style={{ color: "#22d3ee" }}>→ sends to</span> {connections.sends.join(", ")}</div>}
          {connections.receives.length > 0 && <div style={{ fontSize: 12, color: "#9fb3a8", marginTop: 5 }}><span style={{ color: "#7CFF00" }}>← receives from</span> {connections.receives.join(", ")}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            <Link href={laneHref(selected.clusterId)} style={{ textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 1, color: "#c9e8cf", border: "1px solid rgba(124,255,0,.28)", borderRadius: 9, padding: "10px", textDecoration: "none" }}>
              Open lane →
            </Link>
            {codexPacket && (
              <button
                type="button"
                onClick={handleCopyPacket}
                data-testid="cockpit-map-copy-codex"
                style={{ textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 1, color: "#05100a", background: "#7CFF00", border: "none", borderRadius: 9, padding: "11px", cursor: "pointer", fontWeight: 700 }}
              >
                {packetCopied ? "Codex packet copied" : "Copy Codex-safe fix packet"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MissionControlMapPanel;
