"use client";

// Mission Control HOME cockpit — 3D system map (presentational).
// Pure client visualization: renders a rotating 3D graph of the system from REAL
// data passed in as props (clusters / nodes / edges). It owns interaction only —
// spin, drag-to-rotate, click-empty-to-toggle-spin, scroll-to-zoom, and
// click-a-node-to-select (which pauses the spin and calls onSelect). It holds no
// data logic and writes nothing; the parent (MissionControlMapPanel) derives the
// graph from the live snapshot and renders the detail drawer + polling.
//
// Interaction contract:
//  - onSelect(nodeId | null): fires on node tap (id) and on close/empty-tap (null)
//  - selectedId: controlled highlight; when set, spin is paused and the node is
//    ringed with its connections brightened. Clearing it resumes spin.

import { useEffect, useRef, type CSSProperties } from "react";

export type MapStatus = "pass" | "warning" | "failed" | "unknown";

export interface MapCluster {
  id: string;
  label: string;
  status: MapStatus;
}
export interface MapNode {
  id: string;
  name: string;
  clusterId: string;
  status: MapStatus;
  kind: "core" | "service";
  desc?: string;
  issue?: string;
  incidentId?: string;
}
export interface MapEdge {
  from: string;
  to: string;
  kind?: "in" | "cross" | "mesh";
}

export interface SystemMap3DProps {
  clusters: MapCluster[];
  nodes: MapNode[];
  edges: MapEdge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  height?: number;
}

const COLOR: Record<MapStatus, string> = {
  pass: "#34d058",
  warning: "#f5b933",
  failed: "#fb5a6a",
  unknown: "#6f7d83",
};
const GREENS = ["#34d058", "#5fdc7a", "#7CFF00", "#42c98a"];
const AMBIENT_PALETTE = ["#7CFF00", "#34d058", "#5fdc7a", "#22d3ee", "#4d8bff", "#a78bfa", "#f5b933"];

type Vec3 = [number, number, number];
interface GNode {
  ref: MapNode | null; // null for hub / ambient
  pos: Vec3;
  color: string;
  size: number;
  kind: "core" | "service" | "hub" | "ambient";
  id?: string;
  px?: number;
  py?: number;
  pz?: number;
  pscale?: number;
}
interface GEdge {
  a: GNode;
  b: GNode;
  kind: string;
  off: number;
  failed: boolean;
}

function fib(n: number): Vec3[] {
  const pts: Vec3[] = [];
  const gr = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = gr * i;
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return pts;
}
function norm(v: Vec3): Vec3 {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}
function statusColor(s: MapStatus) {
  return COLOR[s] ?? COLOR.unknown;
}

export function SystemMap3D({ clusters, nodes, edges, selectedId, onSelect, height = 524 }: SystemMap3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const geomRef = useRef<{ all: GNode[]; edges: GEdge[]; services: GNode[]; cores: GNode[]; hub: GNode } | null>(null);
  const stateRef = useRef({ rot: 0, tilt: 0.42, zoom: 1, ox: 0, oy: 0, spinning: true, dragging: false, downX: 0, downY: 0, lastX: 0, lastY: 0, vw: 0, vh: 0, dpr: 1 });
  const selRef = useRef<string | null>(selectedId);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { selRef.current = selectedId; }, [selectedId]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // (re)build geometry whenever the real data changes — new services simply appear
  useEffect(() => {
    const clusterDirs = fib(Math.max(clusters.length, 1));
    const dirById: Record<string, Vec3> = {};
    clusters.forEach((c, i) => { dirById[c.id] = clusterDirs[i]; });

    const gById: Record<string, GNode> = {};
    const hub: GNode = { ref: null, pos: [0, 0, 0], color: "#7CFF00", size: 0, kind: "hub" };

    const cores: GNode[] = [];
    const services: GNode[] = [];
    let greenIdx = 0;

    nodes.forEach((n) => {
      const dir = dirById[n.clusterId] ?? [0, 1, 0];
      let pos: Vec3;
      if (n.kind === "core") {
        pos = dir;
      } else {
        const off = norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
        pos = norm([dir[0] + off[0] * 0.62, dir[1] + off[1] * 0.62, dir[2] + off[2] * 0.62]);
      }
      const color = n.status === "pass" ? (n.kind === "core" ? statusColor("pass") : GREENS[greenIdx++ % GREENS.length]) : statusColor(n.status);
      const g: GNode = { ref: n, pos, color, size: n.kind === "core" ? 4.6 : 2.4, kind: n.kind, id: n.id };
      gById[n.id] = g;
      (n.kind === "core" ? cores : services).push(g);
    });

    const gEdges: GEdge[] = [];
    edges.forEach((e) => {
      const a = gById[e.from];
      const b = gById[e.to];
      if (!a || !b) return;
      gEdges.push({ a, b, kind: e.kind ?? "in", off: Math.random(), failed: a.ref?.status === "failed" || b.ref?.status === "failed" });
    });
    // connect each core to the hub (visual spine)
    cores.forEach((c) => gEdges.push({ a: c, b: hub, kind: "hub", off: Math.random(), failed: false }));

    // decorative ambient dots for density (clearly non-interactive)
    const ambient: GNode[] = fib(120).map((p) => {
      const j = 0.82 + Math.random() * 0.22;
      return { ref: null, pos: [p[0] * j, p[1] * j, p[2] * j] as Vec3, color: AMBIENT_PALETTE[(Math.random() * AMBIENT_PALETTE.length) | 0], size: 0.6 + Math.random() * 1.0, kind: "ambient" };
    });

    geomRef.current = { all: [hub, ...cores, ...services, ...ambient], edges: gEdges, services, cores, hub };
  }, [clusters, nodes, edges]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const S = stateRef.current;
    S.dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = w * S.dpr; canvas.height = h * S.dpr;
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      S.vw = w; S.vh = h;
    };
    resize();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    ro?.observe(canvas);

    const project = (n: GNode, cosY: number, sinY: number, cosT: number, sinT: number, cx: number, cy: number, R: number, fov: number) => {
      const p = n.pos;
      const x1 = p[0] * cosY - p[2] * sinY, z1 = p[0] * sinY + p[2] * cosY, y1 = p[1];
      const y2 = y1 * cosT - z1 * sinT, z2 = y1 * sinT + z1 * cosT;
      const scale = fov / (fov - z2);
      n.px = cx + S.ox + x1 * R * S.zoom * scale;
      n.py = cy + S.oy + y2 * R * S.zoom * scale;
      n.pz = z2; n.pscale = scale;
    };

    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const g = geomRef.current;
      if (!g || !S.vw) return;
      const w = S.vw, h = S.vh;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.4;
      const sel = selRef.current;
      if (S.spinning && !sel && !S.dragging) S.rot += 0.0011;
      const cosY = Math.cos(S.rot), sinY = Math.sin(S.rot);
      const cosT = Math.cos(S.tilt), sinT = Math.sin(S.tilt);
      const fov = 3.6;

      g.all.forEach((n) => project(n, cosY, sinY, cosT, sinT, cx, cy, R, fov));

      // ambient
      for (const n of g.all) {
        if (n.kind !== "ambient") continue;
        ctx.globalAlpha = 0.1 + (((n.pz ?? 0) + 1) / 2) * 0.28;
        ctx.fillStyle = n.color;
        ctx.beginPath(); ctx.arc(n.px!, n.py!, Math.max(0.4, n.size * n.pscale! * S.zoom), 0, 6.283); ctx.fill();
      }

      // core wordmark
      const hz = (g.hub.pscale ?? 1) * S.zoom;
      ctx.save();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.96; ctx.fillStyle = "#eafff0";
      ctx.shadowColor = "rgba(124,255,0,.32)"; ctx.shadowBlur = 40 * S.zoom;
      ctx.font = `700 ${Math.round(58 * hz)}px 'Space Grotesk', system-ui, sans-serif`;
      ctx.fillText("BVRB3R", g.hub.px!, g.hub.py! - 6 * hz);
      ctx.shadowBlur = 0; ctx.globalAlpha = 0.85; ctx.fillStyle = "#7CFF00";
      ctx.font = `500 ${Math.round(11 * hz)}px 'JetBrains Mono', monospace`;
      ctx.fillText("C O R E   S Y S T E M", g.hub.px!, g.hub.py! + 28 * hz);
      ctx.restore();

      // edges + flow
      for (const ed of g.edges) {
        const a = ed.a, b = ed.b;
        const connected = !!sel && (a.id === sel || b.id === sel);
        const depth = (((a.pz ?? 0) + (b.pz ?? 0)) / 2 + 1) / 2;
        let alpha = 0.05 + depth * 0.16;
        if (connected) alpha = 0.6;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = connected ? "#7CFF00" : ed.kind === "cross" ? "#22d3ee" : ed.failed ? "#fb5a6a" : "#4f8f5a";
        ctx.lineWidth = connected ? 1.4 : 0.6;
        ctx.beginPath(); ctx.moveTo(a.px!, a.py!); ctx.lineTo(b.px!, b.py!); ctx.stroke();
        const ph = (t * 0.00016 + ed.off) % 1;
        ctx.globalAlpha = (0.4 + depth * 0.6);
        ctx.fillStyle = connected ? "#eafff0" : ed.failed ? "#fb5a6a" : ed.kind === "cross" ? "#67e8f9" : "#9cff6b";
        ctx.beginPath(); ctx.arc(a.px! + (b.px! - a.px!) * ph, a.py! + (b.py! - a.py!) * ph, connected ? 2.2 : 1.5, 0, 6.283); ctx.fill();
      }

      // nodes sorted by depth
      const drawn = [...g.cores, ...g.services].sort((p, q) => (p.pz ?? 0) - (q.pz ?? 0));
      for (const n of drawn) {
        const isSel = n.id === sel;
        const alpha = 0.32 + (((n.pz ?? 0) + 1) / 2) * 0.68;
        const size = n.size * n.pscale! * Math.min(S.zoom, 3.2) * (0.9 + Math.sin(t / 700 + (n.px! + n.py!)) * 0.1);
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.fillStyle = n.color;
        const glow = n.kind === "core" || n.ref?.status === "failed" || n.ref?.status === "warning" || isSel;
        if (glow) { ctx.shadowColor = n.color; ctx.shadowBlur = (isSel ? 20 : n.kind === "core" ? 13 : 8) * n.pscale!; }
        else ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(n.px!, n.py!, Math.max(0.6, size), 0, 6.283); ctx.fill();
        ctx.shadowBlur = 0;
        if (isSel) {
          ctx.globalAlpha = 0.9; ctx.strokeStyle = "#eafff0"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(n.px!, n.py!, size + 6 + Math.sin(t / 300) * 1.5, 0, 6.283); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(loop);

    // ---- interaction ----
    const hitTest = (clientX: number, clientY: number): GNode | null => {
      const g = geomRef.current; if (!g) return null;
      const r = canvas.getBoundingClientRect();
      const x = clientX - r.left, y = clientY - r.top;
      let best: GNode | null = null, bd = 15;
      for (const n of [...g.services, ...g.cores]) {
        if (n.px == null || n.py == null) continue;
        const d = Math.hypot(n.px - x, n.py - y);
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    };
    const onHover = (e: PointerEvent) => {
      if (S.dragging) return;
      canvas.style.cursor = hitTest(e.clientX, e.clientY) ? "pointer" : "grab";
    };
    const onDown = (e: PointerEvent) => {
      S.dragging = true; S.downX = e.clientX; S.downY = e.clientY; S.lastX = e.clientX; S.lastY = e.clientY;
      canvas.style.cursor = "grabbing";
      try { canvas.setPointerCapture(e.pointerId); } catch {}
    };
    const onDrag = (e: PointerEvent) => {
      if (!S.dragging) return;
      const dx = e.clientX - S.lastX, dy = e.clientY - S.lastY;
      S.lastX = e.clientX; S.lastY = e.clientY;
      S.rot -= dx * 0.006; // drag follows the grab
      S.tilt = Math.max(-1.25, Math.min(1.25, S.tilt - dy * 0.006));
    };
    const onUp = (e: PointerEvent) => {
      if (!S.dragging) return;
      S.dragging = false;
      canvas.style.cursor = "grab";
      const moved = Math.hypot(e.clientX - S.downX, e.clientY - S.downY) > 5;
      if (moved) return;
      const hit = hitTest(S.downX, S.downY);
      if (hit && hit.id) { onSelectRef.current(hit.id); }
      else if (selRef.current) { onSelectRef.current(null); }
      else { S.spinning = !S.spinning; }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const ax = e.clientX - r.left - S.vw / 2, ay = e.clientY - r.top - S.vh / 2;
      const nz = Math.max(0.6, Math.min(6, S.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const k = nz / S.zoom;
      S.ox = ax - (ax - S.ox) * k; S.oy = ay - (ay - S.oy) * k; S.zoom = nz;
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onHover);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onDrag);
    window.addEventListener("pointerup", onUp);

    return () => {
      cancelAnimationFrame(raf); ro?.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onHover);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onDrag);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const zoomBy = (f: number) => {
    const S = stateRef.current;
    const nz = Math.max(0.6, Math.min(6, S.zoom * f));
    const k = nz / S.zoom; S.ox *= k; S.oy *= k; S.zoom = nz;
  };
  const resetView = () => { const S = stateRef.current; S.zoom = 1; S.ox = 0; S.oy = 0; S.tilt = 0.42; };
  const toggleSpin = () => { const S = stateRef.current; S.spinning = !S.spinning; };

  const ctrlBtn: CSSProperties = { width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#c9e8cf", cursor: "pointer", userSelect: "none", background: "transparent", border: "none", padding: 0 };

  return (
    <div
      data-testid="cockpit-system-map"
      style={{ position: "relative", height, borderRadius: 14, overflow: "hidden", background: "radial-gradient(circle at 50% 46%, rgba(30,70,30,.22), rgba(5,10,8,0) 62%)", border: "1px solid rgba(255,255,255,.04)" }}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", left: 16, top: 12, display: "flex", alignItems: "center", gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 1.4, color: "rgba(255,255,255,.56)", textTransform: "uppercase" }}>
        BVRB3R System Map
        <span style={{ color: "#d7ffab", fontSize: 9, letterSpacing: 0.4, textTransform: "none" }}>Live</span>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#A3FF12" }} className="animate-pulse" />
      </div>
      <div style={{ position: "absolute", right: 12, bottom: 12, display: "flex", alignItems: "center", gap: 4, background: "rgba(6,11,9,.82)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 22, padding: "5px 7px", backdropFilter: "blur(8px)" }}>
        <button type="button" style={{ ...ctrlBtn, fontSize: 16 }} title="Zoom out" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>−</button>
        <button type="button" style={{ ...ctrlBtn, fontSize: 15 }} title="Zoom in" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>+</button>
        <div style={{ width: 1, height: 16, background: "rgba(255,255,255,.12)" }} />
        <button type="button" style={{ ...ctrlBtn, fontSize: 13 }} title="Reset view" aria-label="Reset view" onClick={resetView}>⤢</button>
        <button type="button" style={{ ...ctrlBtn, fontSize: 12, color: "#7CFF00" }} title="Play / pause spin" aria-label="Play or pause spin" onClick={toggleSpin}>⏯</button>
      </div>
    </div>
  );
}

export default SystemMap3D;
