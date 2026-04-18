"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { AlertTriangle, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useArchitectVerificationQueueQuery } from "@/lib/platform-admin/client";
import { cn } from "@/lib/utils";
import type { ArchitectVerificationQueueFilters, ArchitectVerificationQueuePayload } from "@/types/platform-admin";

function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function badgeClasses(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes("approved") || normalized.includes("verified")) {
    return "border-[#7CFF00]/16 bg-[#7CFF00]/10 text-[#d7ffab]";
  }

  if (normalized.includes("submitted") || normalized.includes("review") || normalized.includes("pending")) {
    return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  }

  if (normalized.includes("rejected") || normalized.includes("needs") || normalized.includes("expired") || normalized.includes("suspended")) {
    return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  }

  return "border-white/10 bg-black/20 text-white/72";
}

const statusOptions = [
  "all",
  "submitted",
  "under_review",
  "needs_update",
  "approved",
  "rejected",
  "expired",
  "suspended"
] as const;

export function ArchitectVerificationQueueWorkspace({
  initialData,
  initialFilters
}: {
  initialData: ArchitectVerificationQueuePayload;
  initialFilters: ArchitectVerificationQueueFilters;
}) {
  const [filters, setFilters] = useState<ArchitectVerificationQueueFilters>({
    role: initialFilters.role ?? "all",
    overallStatus: initialFilters.overallStatus ?? "all",
    identityStatus: initialFilters.identityStatus ?? "all",
    licenseStatus: initialFilters.licenseStatus ?? "all",
    businessStatus: initialFilters.businessStatus ?? "all",
    payoutStatus: initialFilters.payoutStatus ?? "all",
    complianceStatus: initialFilters.complianceStatus ?? "all",
    search: initialFilters.search ?? "",
    submittedOnly: initialFilters.submittedOnly ?? false
  });
  const deferredFilters = {
    ...filters,
    search: useDeferredValue(filters.search ?? "")
  };
  const query = useArchitectVerificationQueueQuery(deferredFilters, initialData);
  const data = query.data ?? initialData;

  return (
    <div className="app-screen safe-top-pad px-2 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] sm:px-3 sm:py-3 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <Card className="rounded-[34px] p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="editorial-kicker">
                <span className="accent-rule" />
                Founder-only verification lane
              </div>
              <h1 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Architect Verifications</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62">
                Review pending professional and business trust cases, inspect private verification metadata, and move cases forward without rewriting canonical booking, payout, or reward truth.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:w-[24rem]">
              <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-4">
                <p className="surface-label text-[#d7ffab]">Cases in view</p>
                <p className="mt-3 text-3xl font-semibold text-white">{data.items.length}</p>
                <p className="mt-2 text-sm text-white/62">Filtered queue rows ready for review.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Current lane</p>
                <div className="mt-3 flex items-center gap-2 text-white">
                  <ShieldCheck className="h-4 w-4 text-[#baff69]" />
                  <span className="font-medium">Verification control</span>
                </div>
                <p className="mt-2 text-sm text-white/58">Actions here always write review history and founder audit entries.</p>
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/architect">
              <Button type="button" variant="secondary" className="min-w-[10rem]">Dashboard</Button>
            </Link>
            <Link href="/architect/accounts">
              <Button type="button" variant="secondary" className="min-w-[10rem]">Account search</Button>
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
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_200px_200px_200px]">
            <div>
              <label className="mb-2 block surface-label">Search verification queue</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/32" />
                <Input
                  value={filters.search ?? ""}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  className="pl-11"
                  placeholder="Name, email, barber, shop, license, business"
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block surface-label">Role</label>
              <Select value={filters.role ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value as ArchitectVerificationQueueFilters["role"] }))}>
                <option value="all">All roles</option>
                <option value="barber">Barber</option>
                <option value="shop_owner">Shop owner</option>
              </Select>
            </div>
            <div>
              <label className="mb-2 block surface-label">Overall status</label>
              <Select value={filters.overallStatus ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, overallStatus: event.target.value as ArchitectVerificationQueueFilters["overallStatus"] }))}>
                {statusOptions.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-2 block surface-label">Queue focus</label>
              <Button
                type="button"
                variant={filters.submittedOnly ? "primary" : "secondary"}
                className="w-full"
                onClick={() => setFilters((current) => ({ ...current, submittedOnly: !current.submittedOnly }))}
              >
                {filters.submittedOnly ? "Submitted only" : "All cases"}
              </Button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <label className="mb-2 block surface-label">Identity</label>
              <Select value={filters.identityStatus ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, identityStatus: event.target.value as ArchitectVerificationQueueFilters["identityStatus"] }))}>
                {statusOptions.map((status) => <option key={`identity-${status}`} value={status}>{formatLabel(status)}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-2 block surface-label">License</label>
              <Select value={filters.licenseStatus ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, licenseStatus: event.target.value as ArchitectVerificationQueueFilters["licenseStatus"] }))}>
                {statusOptions.map((status) => <option key={`license-${status}`} value={status}>{formatLabel(status)}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-2 block surface-label">Business</label>
              <Select value={filters.businessStatus ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, businessStatus: event.target.value as ArchitectVerificationQueueFilters["businessStatus"] }))}>
                {statusOptions.map((status) => <option key={`business-${status}`} value={status}>{formatLabel(status)}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-2 block surface-label">Payout</label>
              <Select value={filters.payoutStatus ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, payoutStatus: event.target.value as ArchitectVerificationQueueFilters["payoutStatus"] }))}>
                {statusOptions.map((status) => <option key={`payout-${status}`} value={status}>{formatLabel(status)}</option>)}
              </Select>
            </div>
            <div>
              <label className="mb-2 block surface-label">Compliance</label>
              <Select value={filters.complianceStatus ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, complianceStatus: event.target.value as ArchitectVerificationQueueFilters["complianceStatus"] }))}>
                {statusOptions.map((status) => <option key={`compliance-${status}`} value={status}>{formatLabel(status)}</option>)}
              </Select>
            </div>
          </div>
        </Card>

        <div className="grid gap-4">
          {data.items.length ? data.items.map((item) => (
            <Card key={item.profileId} className="rounded-[30px] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xl font-semibold text-white">{item.subjectName}</p>
                    <span className="status-pill text-white/72">{formatLabel(item.role)}</span>
                    <span className={cn("status-pill", badgeClasses(item.canonicalOverallStatus))}>{formatLabel(item.canonicalOverallStatus)}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/58">
                    {item.subjectEmail ?? "No email on file"}
                    {item.barberId ? ` - ${item.barberId}` : ""}
                    {item.shopId ? ` - ${item.shopId}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.userId ? (
                    <Link href={`/architect/accounts/${item.userId}`}>
                      <Button type="button" variant="secondary" className="min-w-[10rem]">Open account</Button>
                    </Link>
                  ) : null}
                  <Link href={`/architect/verifications/${item.profileId}`}>
                    <Button type="button" className="min-w-[10rem]">View details</Button>
                  </Link>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Eligibility</p>
                  <p className="mt-3 text-sm text-white/62">
                    Public {item.publicVerified ? "enabled" : "locked"} / Bookings {item.canAcceptBookings ? "enabled" : "locked"} / Payouts {item.canReceivePayouts ? "enabled" : "locked"}
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Requirements</p>
                  <p className="mt-3 text-sm text-white/62">{item.currentRequirementsCount ? item.currentRequirements.join(", ") : "No outstanding requirements."}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Submitted</p>
                  <p className="mt-3 text-sm text-white/62">{formatDateTime(item.submittedAt)}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Last reviewed</p>
                  <p className="mt-3 text-sm text-white/62">{formatDateTime(item.lastReviewedAt)}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Updated</p>
                  <p className="mt-3 text-sm text-white/62">{formatDateTime(item.updatedAt)}</p>
                </div>
              </div>
            </Card>
          )) : (
            <Card className="rounded-[30px] p-6">
              <p className="surface-label">Everything is caught up</p>
              <p className="mt-3 text-sm leading-7 text-white/58">
                No real barber or shop-owner reviews are pending in this view. When a real submission reaches platform review, it will appear here with its canonical account and business records.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
