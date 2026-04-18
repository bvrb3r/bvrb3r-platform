"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { AlertTriangle, ClipboardCheck, Search, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ArchitectAccountDirectoryItem, ArchitectDashboardPayload, PlatformAdminAuditLogEntry } from "@/types/platform-admin";

type LinkHref = ComponentProps<typeof Link>["href"];

function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not recorded";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function badgeClasses(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("approved") || normalized.includes("active") || normalized.includes("verified")) {
    return "border-[#7CFF00]/16 bg-[#7CFF00]/10 text-[#d7ffab]";
  }
  if (normalized.includes("pending") || normalized.includes("review") || normalized.includes("needs")) {
    return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  }
  if (normalized.includes("rejected") || normalized.includes("suspended") || normalized.includes("banned") || normalized.includes("missing")) {
    return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  }
  return "border-white/10 bg-black/20 text-white/72";
}

function Metric({
  label,
  value,
  detail,
  href,
  accent = false
}: {
  label: string;
  value: number;
  detail: string;
  href: LinkHref;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-[24px] border p-4 transition hover:border-[#7CFF00]/30 hover:bg-white/[0.04]",
        accent ? "border-[#7CFF00]/18 bg-[#7CFF00]/8" : "border-white/8 bg-black/20"
      )}
    >
      <p className={cn("surface-label", accent ? "text-[#d7ffab]" : undefined)}>{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white" data-display="true">{value}</p>
      <p className="mt-2 text-sm text-white/58">{detail}</p>
    </Link>
  );
}

function AccountMiniRow({ account }: { account: ArchitectAccountDirectoryItem }) {
  return (
    <Link
      href={`/architect/accounts/${account.profileId}`}
      className="block rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-[#7CFF00]/24 hover:bg-white/[0.04]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-white">{account.fullName}</p>
          <p className="mt-1 truncate text-sm text-white/56">{account.email || "No email on file"}</p>
        </div>
        <span className={cn("status-pill", badgeClasses(account.accountStatus))}>{formatLabel(account.accountStatus)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="status-pill text-white/72">{account.roleLabel}</span>
        <span className={cn("status-pill", badgeClasses(account.approvalStatus))}>{formatLabel(account.approvalStatus)}</span>
        <span className={cn("status-pill", badgeClasses(account.verificationStatus))}>{formatLabel(account.verificationStatus)}</span>
      </div>
      <p className="mt-3 text-xs text-white/44">{formatDateTime(account.createdAt)}</p>
    </Link>
  );
}

function AuditMiniRow({ entry }: { entry: PlatformAdminAuditLogEntry }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-white">{formatLabel(entry.actionType)}</p>
        <span className={cn("status-pill", badgeClasses(entry.actionClass))}>{formatLabel(entry.actionClass)}</span>
      </div>
      <p className="mt-2 text-sm text-white/58">Target {entry.targetId}</p>
      <p className="mt-2 text-xs text-white/44">{formatDateTime(entry.createdAt)}</p>
      {entry.note ? <p className="mt-3 text-sm leading-6 text-white/62">{entry.note}</p> : null}
    </div>
  );
}

export function ArchitectDashboard({ initialData }: { initialData: ArchitectDashboardPayload }) {
  const data = initialData;
  const hasAccounts = data.counts.totalAccounts > 0;
  const pendingTotal = data.counts.pendingBarberApprovals + data.counts.pendingShopOwnerApprovals;

  return (
    <div className="app-screen safe-top-pad px-2 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] sm:px-3 sm:py-3 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <Card className="rounded-[34px] p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="editorial-kicker">
                <span className="accent-rule" />
                Founder-only control center
              </div>
              <h1 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Architect</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62">
                Live account oversight, approval readiness, review history, and founder actions for the real platform.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:w-[26rem]">
              <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-4">
                <p className="surface-label text-[#d7ffab]">Operating as</p>
                <p className="mt-3 text-lg font-semibold text-white">{data.actorName}</p>
                <p className="mt-2 text-sm text-white/62">Platform administrator</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Pending reviews</p>
                <p className="mt-3 text-3xl font-semibold text-white">{pendingTotal}</p>
                <p className="mt-2 text-sm text-white/58">Barber and shop-owner approvals</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/architect/accounts">
              <Button type="button" className="min-w-[12rem]">
                <Search className="h-4 w-4" />
                Search accounts
              </Button>
            </Link>
            <Link href="/architect/verifications">
              <Button type="button" variant="secondary" className="min-w-[12rem]">
                <ClipboardCheck className="h-4 w-4" />
                Review queue
              </Button>
            </Link>
          </div>
        </Card>

        {data.warnings.length ? (
          <Card className="rounded-[28px] border border-amber-300/18 bg-amber-300/8 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-100" />
              <div className="space-y-1 text-sm leading-6 text-white/72">
                {data.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            </div>
          </Card>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Clients" value={data.counts.totalClients} detail="Real client accounts" href="/architect/accounts?role=client" accent />
          <Metric label="Barbers" value={data.counts.totalBarbers} detail="Real barber accounts" href="/architect/accounts?role=barber" />
          <Metric label="Shop owners" value={data.counts.totalShopOwners} detail="Real owner accounts" href="/architect/accounts?role=shop_owner" />
          <Metric label="Pending barbers" value={data.counts.pendingBarberApprovals} detail="Needs platform review" href="/architect/accounts?role=barber&status=pending_review" accent />
          <Metric label="Pending shops" value={data.counts.pendingShopOwnerApprovals} detail="Needs platform review" href="/architect/accounts?role=shop_owner&status=pending_review" />
        </section>

        {!hasAccounts ? (
          <Card className="rounded-[30px] border-dashed p-6 text-center">
            <Users className="mx-auto h-8 w-8 text-[#baff69]" />
            <p className="mt-4 text-xl font-semibold text-white">No real accounts yet</p>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/58">
              Architect is connected to live account sources. When real profiles exist, they will appear here with zero fabricated rows.
            </p>
          </Card>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <Card className="rounded-[32px] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="surface-label">Recent signups</p>
                <p className="mt-2 text-sm text-white/58">Newest real accounts in the platform.</p>
              </div>
              <Link href="/architect/accounts" className="text-sm font-semibold text-[#d7ffab] hover:text-white">Open directory</Link>
            </div>
            <div className="mt-4 grid gap-3">
              {data.recentSignups.length ? data.recentSignups.map((account) => (
                <AccountMiniRow key={account.profileId} account={account} />
              )) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
                  No real signup records are available.
                </div>
              )}
            </div>
          </Card>

          <Card className="rounded-[32px] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="surface-label">Recent approval actions</p>
                <p className="mt-2 text-sm text-white/58">Founder actions recorded in audit history.</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-[#baff69]" />
            </div>
            <div className="mt-4 grid gap-3">
              {data.recentApprovalActions.length ? data.recentApprovalActions.map((entry) => (
                <AuditMiniRow key={entry.id} entry={entry} />
              )) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
                  No approval actions have been recorded yet.
                </div>
              )}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
