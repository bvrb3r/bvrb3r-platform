import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ShopOwnerPlanAccessCard } from "@/components/owner-experience/shop-owner-plan-access-card";
import { OwnerOperationsWorkspace } from "@/components/operations/owner-operations-workspace";
import { Card } from "@/components/ui/card";
import { getAuthorizedUser } from "@/lib/auth/guards";
import { resolveShopOwnerPaywallSummaryForUser } from "@/lib/entitlements/shop-owner-paywall";

export default async function OwnerMoneyPage({
  searchParams
}: {
  searchParams: Promise<{ view?: string; section?: string }>;
}) {
  const user = await getAuthorizedUser(["shop_owner_user"]);
  const paywallSummary = await resolveShopOwnerPaywallSummaryForUser({ user });
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
      <ShopOwnerPlanAccessCard summary={paywallSummary} compact />
      <Card className="mb-4 rounded-[28px] border border-[#C4F24E]/18 bg-[#C4F24E]/6 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="surface-label">Shop-owned money</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Booth rent + AutoBooth rent only</h2>
            <p className="mt-2 text-sm text-white/56">Open the per-chair rent ledger without exposing barber earnings or tips.</p>
          </div>
          <Link
            href="/dashboard/owner/rent"
            className="inline-flex min-h-11 items-center rounded-full bg-[#C4F24E] px-5 text-sm font-black text-black transition hover:bg-[#d4ff6b]"
          >
            Open booth rent
          </Link>
        </div>
      </Card>
      {growthRequested ? (
        <Card className="rounded-[32px] border border-white/8 p-5 sm:p-6">
          <p className="surface-label">Growth parked</p>
          <p className="mt-3 text-2xl font-semibold text-white">Growth tools are parked until the canonical growth phase is built.</p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">
            Owner Tier 1 keeps money live and trustworthy here. Growth and promotions return later on top of shared canonical systems.
          </p>
        </Card>
      ) : null}
      <OwnerOperationsWorkspace shopIds={[user.ownedShopId ?? "", ...user.locationIds]} />
      {fintechRequested ? (
        <Card className="mt-4 rounded-[28px] border border-amber-300/18 bg-amber-300/[0.055] p-5 sm:p-6">
          <p className="surface-label">Detailed finance closed</p>
          <p className="mt-3 text-lg font-semibold text-white">
            Shop owners can see booth rent billed, paid, and outstanding. Barber earnings, tips, payouts, and external-provider money remain private.
          </p>
        </Card>
      ) : null}
    </DashboardShell>
  );
}
