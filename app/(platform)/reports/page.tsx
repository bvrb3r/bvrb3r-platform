import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { FintechWorkspace } from "@/components/operations/fintech-workspace";
import { OwnerMoneyWorkspace } from "@/components/operations/owner-money-workspace";
import { Card } from "@/components/ui/card";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function ReportsPage({
  searchParams
}: {
  searchParams: Promise<{
    view?: string;
  }>;
}) {
  const user = await getAuthorizedUser(["owner", "manager"]);
  const params = await searchParams;
  const growthRequested = params.view === "growth";
  const activeHref = "/reports?view=money";
  const title = "Money command";
  const subtitle = "Revenue, payouts, breakdowns, and financial exceptions stay clean, trustworthy, and tied to the locked money system.";

  return (
    <DashboardShell user={user} activeHref={activeHref} title={title} subtitle={subtitle}>
      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[32px] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="surface-label">Owner navigation map</p>
              <p className="mt-2 text-sm text-white/58">Money stays live here because it runs on canonical payment, routing, payout, and anomaly systems.</p>
            </div>
            <span className="status-pill text-[#d7ffab]">Canonical owner lane</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/reports?view=money"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#cfff93]/40 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-black shadow-[0_14px_34px_rgba(124,255,0,0.24)] transition sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
            >
              Money
            </Link>
          </div>
        </Card>
      </section>

      {growthRequested ? (
        <Card className="rounded-[32px] border border-white/8 p-5 sm:p-6">
          <p className="surface-label">Growth parked</p>
          <p className="mt-3 text-2xl font-semibold text-white">Growth tools are parked until the canonical growth phase is built.</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">
            This owner lane stays honest for Phase 6. Money, team, schedule, and shop posture are live now. Growth and promotions will return when they are rebuilt on canonical shared systems.
          </p>
        </Card>
      ) : null}

      <OwnerMoneyWorkspace />
      <section className="mt-4">
        <FintechWorkspace viewerRole={user.role as "owner" | "manager"} locationIds={user.locationIds} />
      </section>
    </DashboardShell>
  );
}
