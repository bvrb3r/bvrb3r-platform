import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { FintechWorkspace } from "@/components/operations/fintech-workspace";
import { OwnerGrowthWorkspace } from "@/components/operations/owner-growth-workspace";
import { OwnerMoneyWorkspace } from "@/components/operations/owner-money-workspace";
import { PromotionsWorkspace } from "@/components/operations/promotions-workspace";
import { Card } from "@/components/ui/card";
import { getAuthorizedUser } from "@/lib/auth/guards";

type ReportsView = "money" | "growth";

export default async function ReportsPage({
  searchParams
}: {
  searchParams: Promise<{
    view?: string;
  }>;
}) {
  const user = await getAuthorizedUser(["owner", "manager"]);
  const params = await searchParams;
  const view: ReportsView = params.view === "growth" ? "growth" : "money";
  const activeHref = view === "growth" ? "/reports?view=growth" : "/reports?view=money";
  const title = view === "growth" ? "Growth command" : "Money command";
  const subtitle = view === "growth"
    ? "Referrals, campaigns, points ROI, and retention opportunity all stay action-oriented and grounded in canonical growth signals."
    : "Revenue, payouts, breakdowns, and financial exceptions stay clean, trustworthy, and tied to the locked money system.";

  return (
    <DashboardShell user={user} activeHref={activeHref} title={title} subtitle={subtitle}>
      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[32px] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="surface-label">Owner navigation map</p>
              <p className="mt-2 text-sm text-white/58">Money is for trust and movement. Growth is for demand and repeat behavior.</p>
            </div>
            <span className="status-pill text-[#d7ffab]">Owner-safe split</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/reports?view=money"
              className={`inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-[10px] font-semibold uppercase tracking-[0.2em] transition sm:px-5 sm:text-[11px] sm:tracking-[0.22em] ${
                view === "money"
                  ? "border-[#cfff93]/40 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] text-black shadow-[0_14px_34px_rgba(124,255,0,0.24)]"
                  : "border-white/10 bg-black/20 text-white hover:border-[#7cff00]/20 hover:text-[#d7ffab]"
              }`}
            >
              Money
            </Link>
            <Link
              href="/reports?view=growth"
              className={`inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-[10px] font-semibold uppercase tracking-[0.2em] transition sm:px-5 sm:text-[11px] sm:tracking-[0.22em] ${
                view === "growth"
                  ? "border-[#cfff93]/40 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] text-black shadow-[0_14px_34px_rgba(124,255,0,0.24)]"
                  : "border-white/10 bg-black/20 text-white hover:border-[#7cff00]/20 hover:text-[#d7ffab]"
              }`}
            >
              Growth
            </Link>
          </div>
        </Card>
      </section>

      {view === "money" ? (
        <>
          <OwnerMoneyWorkspace />
          <section className="mt-4">
            <FintechWorkspace viewerRole={user.role as "owner" | "manager"} locationIds={user.locationIds} />
          </section>
        </>
      ) : (
        <>
          <OwnerGrowthWorkspace />
          <section className="mt-4">
            <PromotionsWorkspace viewerRole={user.role as "owner" | "manager"} locationIds={user.locationIds} />
          </section>
        </>
      )}
    </DashboardShell>
  );
}
