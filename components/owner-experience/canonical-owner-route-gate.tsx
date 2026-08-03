import type { Route } from "next";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Card } from "@/components/ui/card";
import { getAuthorizedUser } from "@/lib/auth/guards";

type CanonicalOwnerRouteGateConfig = {
  eyebrow: string;
  title: string;
  detail: string;
  recoveryHref: Route;
  recoveryLabel: string;
};

export function createCanonicalOwnerRouteGate(config: CanonicalOwnerRouteGateConfig) {
  return async function CanonicalOwnerRouteGatePage() {
    const user = await getAuthorizedUser(["shop_owner_user"]);

    return (
      <DashboardShell
        user={user}
        activeHref="/dashboard/owner/more"
        title={config.title}
        subtitle={config.detail}
        hidePageHeader
      >
        <Card className="mx-auto max-w-3xl rounded-[32px] border border-amber-300/18 bg-amber-300/[0.055] p-6 sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber-200">
            {config.eyebrow} · Needs Review
          </p>
          <h1 className="mt-4 font-serif text-4xl leading-tight text-white sm:text-5xl">
            {config.title}
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/58">
            {config.detail}
          </p>
          <p className="mt-4 text-sm leading-7 text-white/48">
            This canonical route is reserved and role-protected. It will not claim
            production readiness until its approved workflow and evidence pass.
          </p>
          <Link
            href={config.recoveryHref}
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full border border-white/12 bg-white/[0.055] px-6 text-sm font-black text-white transition hover:border-[#C4F24E]/45 hover:text-[#C4F24E]"
          >
            {config.recoveryLabel}
          </Link>
        </Card>
      </DashboardShell>
    );
  };
}
