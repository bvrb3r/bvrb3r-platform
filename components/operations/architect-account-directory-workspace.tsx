"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { AlertTriangle, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useArchitectAccountDirectoryQuery } from "@/lib/platform-admin/client";
import { cn } from "@/lib/utils";
import type {
  ArchitectAccountDirectoryFilters,
  ArchitectAccountDirectoryItem,
  ArchitectAccountDirectoryPayload,
  ArchitectAccountRoleFilter,
  ArchitectAccountStatusFilter
} from "@/types/platform-admin";

const roleOptions: Array<{ value: ArchitectAccountRoleFilter; label: string }> = [
  { value: "all", label: "All accounts" },
  { value: "client", label: "Clients" },
  { value: "barber", label: "Barbers" },
  { value: "shop_owner", label: "Shop owners" },
  { value: "platform_admin", label: "Platform admins" }
];

const statusOptions: Array<{ value: ArchitectAccountStatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "profile_only", label: "Profile only" },
  { value: "pending_review", label: "Pending review" },
  { value: "approved", label: "Approved" },
  { value: "needs_update", label: "Needs update" },
  { value: "rejected", label: "Rejected" },
  { value: "deactivated", label: "Deactivated" },
  { value: "suspended", label: "Suspended" },
  { value: "banned", label: "Banned" }
];

function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
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

function AccountCard({ account }: { account: ArchitectAccountDirectoryItem }) {
  return (
    <Card className="rounded-[30px] p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-semibold text-white">{account.fullName}</p>
            <span className="status-pill text-white/72">{account.roleLabel}</span>
            <span className={cn("status-pill", badgeClasses(account.accountStatus))}>{formatLabel(account.accountStatus)}</span>
          </div>
          <p className="mt-2 text-sm text-white/58">{account.email || "No email on file"}{account.phone ? ` - ${account.phone}` : ""}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={cn("status-pill", badgeClasses(account.approvalStatus))}>Approval {formatLabel(account.approvalStatus)}</span>
            <span className={cn("status-pill", badgeClasses(account.verificationStatus))}>Verification {formatLabel(account.verificationStatus)}</span>
            {account.shopName ? <span className="status-pill text-white/72">{account.shopName}</span> : null}
            {account.username ? <span className="status-pill text-white/72">@{account.username}</span> : null}
          </div>
        </div>
        <Link href={`/architect/accounts/${account.profileId}`}>
          <Button type="button" className="w-full min-w-[11rem] xl:w-auto">Open account</Button>
        </Link>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="surface-label">Services</p>
          <p className="mt-3 text-2xl font-semibold text-white">{account.serviceCount}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="surface-label">Availability</p>
          <p className="mt-3 text-2xl font-semibold text-white">{account.availabilityCount}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="surface-label">Documents</p>
          <p className="mt-3 text-2xl font-semibold text-white">{account.documentCount}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="surface-label">Reviews</p>
          <p className="mt-3 text-2xl font-semibold text-white">{account.reviewCount}</p>
        </div>
        <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
          <p className="surface-label">Blockers</p>
          <p className="mt-3 text-2xl font-semibold text-white">{account.marketplaceBlockers.length}</p>
        </div>
      </div>

      {account.marketplaceBlockers.length ? (
        <div className="mt-4 rounded-[22px] border border-amber-300/18 bg-amber-300/8 p-4">
          <p className="surface-label text-amber-100">Marketplace blockers</p>
          <p className="mt-2 text-sm leading-7 text-white/68">{account.marketplaceBlockers.join(" - ")}</p>
        </div>
      ) : null}
    </Card>
  );
}

export function ArchitectAccountDirectoryWorkspace({
  initialData,
  initialFilters
}: {
  initialData: ArchitectAccountDirectoryPayload;
  initialFilters: ArchitectAccountDirectoryFilters;
}) {
  const [filters, setFilters] = useState<ArchitectAccountDirectoryFilters>({
    search: initialFilters.search ?? "",
    role: initialFilters.role ?? "all",
    status: initialFilters.status ?? "all"
  });
  const deferredSearch = useDeferredValue(filters.search ?? "");
  const queryFilters = useMemo(() => ({ ...filters, search: deferredSearch }), [deferredSearch, filters]);
  const query = useArchitectAccountDirectoryQuery(queryFilters, initialData);
  const data = query.data ?? initialData;

  return (
    <div className="app-screen safe-top-pad px-2 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] sm:px-3 sm:py-3 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <Card className="rounded-[34px] p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="editorial-kicker">
                <span className="accent-rule" />
                Live account directory
              </div>
              <h1 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Architect Accounts</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62">
                Search real profiles, onboarding state, approval posture, shop ownership, and marketplace readiness.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:w-[24rem]">
              <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-4">
                <p className="surface-label text-[#d7ffab]">Accounts in view</p>
                <p className="mt-3 text-3xl font-semibold text-white">{data.accounts.length}</p>
                <p className="mt-2 text-sm text-white/62">Filtered from live profiles.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Total accounts</p>
                <p className="mt-3 text-3xl font-semibold text-white">{data.counts.totalAccounts}</p>
                <p className="mt-2 text-sm text-white/58">No sample rows.</p>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/architect">
              <Button type="button" variant="secondary" className="min-w-[10rem]">Dashboard</Button>
            </Link>
            <Link href="/architect/verifications">
              <Button type="button" variant="secondary" className="min-w-[10rem]">
                <ShieldCheck className="h-4 w-4" />
                Review queue
              </Button>
            </Link>
          </div>
        </Card>

        {query.error ? <FeedbackBanner tone="error" message={query.error.message} /> : null}
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

        <Card className="rounded-[32px] p-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_220px_220px]">
            <div>
              <label className="mb-2 block surface-label">Search accounts</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/32" />
                <Input
                  value={filters.search ?? ""}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  className="pl-11"
                  placeholder="Email, name, role, shop, username, approval"
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block surface-label">Role</label>
              <Select value={filters.role ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value as ArchitectAccountRoleFilter }))}>
                {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-2 block surface-label">Status</label>
              <Select value={filters.status ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as ArchitectAccountStatusFilter }))}>
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </div>
          </div>
        </Card>

        <div className="grid gap-4">
          {data.accounts.length ? data.accounts.map((account) => (
            <AccountCard key={account.profileId} account={account} />
          )) : (
            <Card className="rounded-[30px] border-dashed p-6 text-center">
              <p className="text-xl font-semibold text-white">No real accounts in this view</p>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-white/58">
                Adjust the search or filters. Architect will not create placeholder users when live data is absent.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
