import type { Route } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { FintechWorkspace } from "@/components/operations/fintech-workspace";
import { OwnerMoneyWorkspace } from "@/components/operations/owner-money-workspace";
import { FeatureGateTease } from "@/components/ui/feature-gate-tease";
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
  if (user.role === "owner") {
    redirect(`/dashboard/owner/money${growthRequested ? "?view=growth" : ""}` as Route);
  }

  const activeHref = "/reports?view=money";
  const title = "Money";
  const subtitle = "Booth rent, shop-owned payments, operational service volume, and financial exceptions stay visible without treating barber money as shop revenue.";

  return (
    <DashboardShell user={user} activeHref={activeHref} title={title} subtitle={subtitle}>
      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[32px] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="surface-label">Money visibility</p>
              <p className="mt-2 text-sm text-white/58">Booth rent and shop-owned money stay distinct from operational service volume. Barber service proceeds and tips are not shop revenue.</p>
            </div>
            <span className="status-pill text-[#e4f9b8]">Canonical money tab</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/reports?view=money"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#e0f6a0]/40 bg-[linear-gradient(135deg,#c4f24e_0%,#d4f97a_100%)] px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-black shadow-[0_14px_34px_rgba(196, 242, 78,0.24)] transition sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
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

      <FeatureGateTease
        gateKey="reports.custom_builder"
        label="Custom report builder"
        eyebrow="Reports"
        detail="Build reusable Pro exports from canonical operational and BVRB3R-owned money fields."
      />

      <OwnerMoneyWorkspace />
      <section className="mt-4">
        <FintechWorkspace viewerRole={user.role as "owner" | "manager"} locationIds={user.locationIds} />
      </section>
    </DashboardShell>
  );
}
