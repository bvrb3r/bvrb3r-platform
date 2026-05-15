import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { FintechWorkspace } from "@/components/operations/fintech-workspace";
import { OwnerMoneyWorkspace } from "@/components/operations/owner-money-workspace";
import { Card } from "@/components/ui/card";
import { getAuthorizedUser } from "@/lib/auth/guards";

export default async function OwnerMoneyPage({
  searchParams
}: {
  searchParams: Promise<{ view?: string; section?: string }>;
}) {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  const params = await searchParams;
  const growthRequested = params.view === "growth";
  const fintechRequested = params.view === "fintech";

  return (
    <DashboardShell
      user={user}
      activeHref="/dashboard/owner/money"
      title="Money"
      subtitle="Revenue & payouts"
      hidePageHeader
    >
      {growthRequested ? (
        <Card className="rounded-[32px] border border-white/8 p-5 sm:p-6">
          <p className="surface-label">Growth parked</p>
          <p className="mt-3 text-2xl font-semibold text-white">Growth tools are parked until the canonical growth phase is built.</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">
            Owner Tier 1 keeps money live and trustworthy here. Growth and promotions return later on top of shared canonical systems.
          </p>
        </Card>
      ) : null}
      <OwnerMoneyWorkspace />
      {fintechRequested ? (
        <section className="mt-4">
          <FintechWorkspace viewerRole="owner" locationIds={user.locationIds} />
        </section>
      ) : null}
    </DashboardShell>
  );
}
