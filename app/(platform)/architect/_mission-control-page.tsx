import Link from "next/link";
import { ArchitectMissionControl } from "@/components/architect/mission-control/mission-control";
import { ARCHITECT_PRIMARY_NAV_ITEMS } from "@/components/architect-experience/architect-tab-config";
import { GlassCard } from "@/design/components";
import { getPlatformAdminUser } from "@/lib/auth/guards";
import type { MissionLaneId } from "@/lib/architect/mission-control/types";

const MISSION_CONTROL_REVIEW_ITEMS = [
  {
    label: "Evidence connection",
    summary: "Live Mission Control evidence sources stay Needs Review until connected proof is available."
  },
  {
    label: "Production health",
    summary: "Production health is not marked Pass from the PR-A shell."
  },
  {
    label: "Action boundaries",
    summary: "Money, RLS, approval, and deployment actions remain outside PR-A scope."
  }
] as const;

export async function renderArchitectMissionControlHome() {
  await getPlatformAdminUser();

  return (
    <main className="px-2 py-4 sm:px-3 lg:px-5" data-testid="architect-mission-control-home">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <section className="rounded-[28px] border border-white/10 bg-black/30 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#d7ffab]">Architect Operating System</p>
          <h1 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">BVRB3R Mission Control</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/64">
            Evidence-backed system truth. Missing proof stays Needs Review.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/architect/ceo"
              className="inline-flex min-h-11 items-center justify-center rounded-[8px] border border-[#A3FF12]/28 bg-[#A3FF12]/12 px-4 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#A3FF12]/16"
            >
              Open CEO Lane
            </Link>
            <Link
              href="/architect/technology"
              className="inline-flex min-h-11 items-center justify-center rounded-[8px] border border-white/12 bg-white/[0.04] px-4 text-xs font-black uppercase tracking-[0.14em] text-white/72 transition hover:border-[#A3FF12]/24 hover:text-white"
            >
              Open Technology Lane
            </Link>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-3" aria-label="Mission Control evidence posture">
          {MISSION_CONTROL_REVIEW_ITEMS.map((item) => (
            <GlassCard key={item.label} className="rounded-[16px] p-4" data-testid="mission-control-review-item">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-black text-white">{item.label}</h2>
                <span className="rounded-[8px] border border-amber-300/24 bg-amber-300/8 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-100">
                  Needs Review
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/58">{item.summary}</p>
            </GlassCard>
          ))}
        </section>

        <section className="rounded-[20px] border border-white/10 bg-white/[0.035] p-4" aria-label="Officer lanes">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-white">Officer Lanes</h2>
              <p className="mt-1 text-sm text-white/56">Officer detail remains in each protected lane.</p>
            </div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-white/46">PR-A shell</span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ARCHITECT_PRIMARY_NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[8px] border border-white/10 bg-black/20 px-3 py-3 text-sm font-bold text-white/76 transition hover:border-[#A3FF12]/24 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export async function renderArchitectMissionControlLane(laneId: MissionLaneId) {
  await getPlatformAdminUser();

  return <ArchitectMissionControl laneId={laneId} />;
}
