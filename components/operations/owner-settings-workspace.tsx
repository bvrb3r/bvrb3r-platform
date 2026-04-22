"use client";

import { useMemo } from "react";
import Link from "next/link";
import { BellRing, Building2, ShieldCheck, WalletCards } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { KioskControlPanel } from "@/components/operations/kiosk-control-panel";
import { permissionMatrix } from "@/lib/config/permissions";
import { useFintechManagementQuery } from "@/lib/fintech/client";
import { useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import type { UserAccount } from "@/types/domain";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

function MetricSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-20" />
      <Skeleton className="mt-4 h-4 w-28" />
    </div>
  );
}

function formatRoutingLabel(value: string) {
  switch (value) {
    case "commission":
      return "Commission";
    case "booth_rent":
      return "Booth rent";
    case "freelance":
      return "Freelance";
    default:
      return value.replaceAll("_", " ");
  }
}

function formatApprovalStatus(status?: UserAccount["appApprovalStatus"]) {
  switch (status) {
    case "approved":
      return "Approved";
    case "under_review":
      return "Under review";
    case "pending":
      return "Pending";
    case "rejected":
      return "Needs attention";
    default:
      return "Needs attention";
  }
}

function formatScopedShopLabel(name: string, neighborhood?: string) {
  return neighborhood?.trim() ? `${name} / ${neighborhood}` : name;
}

export function OwnerSettingsWorkspace({ user }: { user: UserAccount }) {
  const profileQuery = useProfileMediaWorkspaceQuery(true);
  const fintechQuery = useFintechManagementQuery();

  const isInitialLoading =
    (profileQuery.isLoading && !profileQuery.data)
    || (fintechQuery.isLoading && !fintechQuery.data);

  const errorMessage = profileQuery.error ?? fintechQuery.error;
  const shops = profileQuery.data?.shops ?? [];
  const memberships = useMemo(() => fintechQuery.data?.memberships ?? [], [fintechQuery.data?.memberships]);
  const permissions = permissionMatrix;
  const assignedLocations = user.locationIds.map((locationId) => ({
    id: locationId,
    name: user.ownedShopId === locationId && user.ownedShopName ? user.ownedShopName : locationId,
    neighborhood: "",
    city: "",
    state: "",
    hours: ""
  }));
  const notificationPreference = profileQuery.data?.viewer.notificationPreference;
  const enabledCommunicationCount = [
    notificationPreference?.inAppEnabled,
    notificationPreference?.emailEnabled,
    notificationPreference?.smsEnabled,
    notificationPreference?.pushEnabled
  ].filter(Boolean).length;

  const compensationSummary = useMemo(() => {
    return memberships.reduce(
      (summary, membership) => {
        summary[membership.routingModel] += 1;
        return summary;
      },
      { commission: 0, booth_rent: 0, freelance: 0 }
    );
  }, [memberships]);

  const payoutReadyCount = fintechQuery.data?.summary.readyAccounts ?? 0;
  const needsAttentionCount = fintechQuery.data?.summary.needsAttentionAccounts ?? 0;
  const blockedRoutingCount = fintechQuery.data?.summary.blockedRoutingRecords ?? 0;
  const readyForPayoutAmount = fintechQuery.data?.summary.readyForPayoutAmount ?? 0;
  const approvalStatusLabel = formatApprovalStatus(user.appApprovalStatus);
  const shopApprovalStatusLabel = user.shopApprovalStatus && user.shopApprovalStatus !== "not_required"
    ? formatApprovalStatus(user.shopApprovalStatus)
    : null;
  const isApprovalClear = user.appApprovalStatus === "approved"
    && (!user.shopApprovalStatus || user.shopApprovalStatus === "approved" || user.shopApprovalStatus === "not_required");
  const approvalSummaryText = isApprovalClear
    ? "Owner approval and public business posture are clear."
    : "Approval is still gating parts of public activation, compliance, or payout posture.";
  const kioskShops = shops.length
    ? shops.map((shop) => ({ id: shop.shopId, label: shop.label }))
    : assignedLocations.map((location) => ({ id: location.id, label: formatScopedShopLabel(location.name, location.neighborhood) }));

  return (
    <div className="space-y-4" data-testid="owner-settings-workspace">
      {errorMessage ? <FeedbackBanner tone="error" message={getReadableActionError(errorMessage)} /> : null}

      <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="surface-label">Owner settings</p>
              <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Control the shop safely without touching raw rails.</h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
                Settings stays operational here: shop details, communication posture, payout readiness, permissions, and branding links all live in one clean owner-safe lane.
              </p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/66">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
                <ShieldCheck className="h-4 w-4" />
                {shops.length || assignedLocations.length} shops in scope
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-white/42">{enabledCommunicationCount} communication channels enabled</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {isInitialLoading ? (
              <>
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
                <MetricSkeleton />
              </>
            ) : (
              <>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Shop details</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{assignedLocations.length}</p>
                  <p className="mt-2 text-sm text-white/58">Locations tied to this owner scope.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Payout ready</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{payoutReadyCount}</p>
                  <p className="mt-2 text-sm text-white/58">Accounts clear to move money through canonical payout rails.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Needs attention</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{needsAttentionCount}</p>
                  <p className="mt-2 text-sm text-white/58">Accounts still missing readiness steps or review.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Blocked routing</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{blockedRoutingCount}</p>
                  <p className="mt-2 text-sm text-white/58">Payment routing rows still blocked in the canonical money layer.</p>
                </div>
              </>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Account health</p>
            <ShieldCheck className="h-5 w-5 text-[#baff69]" />
          </div>
          {isInitialLoading ? (
            <div className="mt-4 space-y-3">
              <MetricSkeleton />
              <MetricSkeleton />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-4">
                <p className="surface-label text-[#d7ffab]">Business identity</p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {isApprovalClear ? "Verified and payout-ready posture" : "Owner approval still needs attention"}
                </p>
                <p className="mt-2 text-sm text-white/62">{approvalSummaryText}</p>
                <p className="mt-2 text-sm text-white/52">
                  Current status: {approvalStatusLabel}
                  {shopApprovalStatusLabel ? ` • Shop approval ${shopApprovalStatusLabel}` : ""}
                </p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Payout readiness</p>
                <p className="mt-3 text-lg font-semibold text-white">
                  {payoutReadyCount} ready - {needsAttentionCount} need review
                </p>
                <p className="mt-2 text-sm text-white/58">{currency(readyForPayoutAmount)} is currently ready for payout in the owner scope.</p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Communications</p>
                <p className="mt-3 text-lg font-semibold text-white">{enabledCommunicationCount} live channels</p>
                <p className="mt-2 text-sm text-white/58">Broadcasts and announcements stay on the existing shop messaging rails.</p>
              </div>
            </div>
          )}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Shop details</p>
              <p className="mt-2 text-sm text-white/58">Branding, location identity, and customer-facing posture stay tied to the existing profile/media system.</p>
            </div>
            <Building2 className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 space-y-3">
            {(shops.length ? shops : assignedLocations.map((location) => ({
              shopId: location.id,
              label: formatScopedShopLabel(location.name, location.neighborhood),
              profilePhotoUrl: undefined,
              gallery: []
            }))).map((shop) => {
              const location = assignedLocations.find((entry) => entry.id === shop.shopId);
              return (
                <div key={shop.shopId} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{shop.label}</p>
                      <p className="mt-1 text-sm text-white/55">{location?.city || location?.state ? `${location.city}, ${location.state}` : "Shop location in scope"}</p>
                    </div>
                    <span className="status-pill text-[#d7ffab]">{shop.profilePhotoUrl ? "Branding live" : "Needs media"}</span>
                  </div>
                  <p className="mt-3 text-sm text-white/58">{location?.hours ?? "Hours are reflected through the active schedule and booking availability."}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/workspace/profile"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#cfff93]/40 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-black shadow-[0_14px_34px_rgba(124,255,0,0.24)] transition hover:-translate-y-0.5 sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
            >
              Manage branding
            </Link>
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Financial setup</p>
              <p className="mt-2 text-sm text-white/58">Compensation posture and payout readiness stay visible here without exposing unsafe money controls.</p>
            </div>
            <WalletCards className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Commission barbers</p>
              <p className="mt-3 text-2xl font-semibold">{compensationSummary.commission}</p>
              <p className="mt-2 text-sm text-white/58">Barbers attached to shop split revenue.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Booth rent</p>
              <p className="mt-3 text-2xl font-semibold">{compensationSummary.booth_rent}</p>
              <p className="mt-2 text-sm text-white/58">Independent chairs paying rent separately from service revenue.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Freelance</p>
              <p className="mt-3 text-2xl font-semibold">{compensationSummary.freelance}</p>
              <p className="mt-2 text-sm text-white/58">Independent routing posture in scope.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Routing blocked</p>
              <p className="mt-3 text-2xl font-semibold">{blockedRoutingCount}</p>
              <p className="mt-2 text-sm text-white/58">Rows still waiting on resolution before money can move cleanly.</p>
            </div>
          </div>
          <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4">
            <p className="surface-label">Compensation posture summary</p>
            <p className="mt-3 text-sm leading-7 text-white/62">
              Commission, booth rent, and freelance routing stay inside the canonical payout layer. Update posture from the protected money lane when a real business change is approved.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/reports?view=money"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7cff00]/20 hover:text-[#d7ffab] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
            >
              Open money tab
            </Link>
          </div>
        </Card>
      </section>

      <KioskControlPanel shops={kioskShops} />

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Permissions</p>
              <p className="mt-2 text-sm text-white/58">Make it obvious who can run the floor, who can message clients, and what stays owner-protected.</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 space-y-3">
            {permissions
              .filter((group) => ["manager", "front_desk", "owner"].includes(group.role))
              .map((group) => (
                <div key={group.role} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="font-medium uppercase tracking-[0.18em] text-[#baff69]">{group.role.replaceAll("_", " ")}</p>
                  <p className="mt-3 text-sm leading-6 text-white/65">Allowed: {group.allows.join(", ")}</p>
                  <p className="mt-2 text-sm leading-6 text-white/48">Restricted: {group.restricted.join(", ") || "None recorded"}</p>
                </div>
              ))}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="surface-label">Communications and account posture</p>
              <p className="mt-2 text-sm text-white/58">Keep shop broadcasts and owner communication posture visible without creating a second messaging stack.</p>
            </div>
            <BellRing className="h-5 w-5 text-[#baff69]" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><BellRing className="h-4 w-4 text-[#baff69]" />Owner channels</div>
              <p className="mt-3 text-2xl font-semibold">{enabledCommunicationCount}</p>
              <p className="mt-2 text-sm text-white/58">In-app, email, SMS, and push posture for the current owner account.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Protected money issues</p>
              <p className="mt-3 text-2xl font-semibold">{needsAttentionCount + blockedRoutingCount}</p>
              <p className="mt-2 text-sm text-white/58">Accounts plus routing rows that still need owner review.</p>
            </div>
          </div>
          <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4">
            <p className="surface-label">What lives where</p>
            <div className="mt-3 space-y-2 text-sm text-white/62">
              <p>- Shop announcements and direct communication live in Messages.</p>
              <p>- Team posture and staffing live in Team.</p>
              <p>- Billing, payout readiness, and compensation posture live in Money.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/workspace/messages"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7cff00]/20 hover:text-[#d7ffab] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
            >
              Open messages
            </Link>
            <Link
              href="/team"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7cff00]/20 hover:text-[#d7ffab] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
            >
              Open team lane
            </Link>
          </div>
        </Card>
      </section>

      <Card className="rounded-[32px] p-6">
        <p className="surface-label">Compensation posture by membership</p>
        <div className="mt-4 space-y-3">
          {memberships.length ? memberships.slice(0, 8).map((membership) => (
            <div key={membership.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{membership.barberName}</p>
                  <p className="mt-1 text-sm text-white/55">{membership.shopLabel}</p>
                </div>
                <span className="status-pill text-[#d7ffab]">{formatRoutingLabel(membership.routingModel)}</span>
              </div>
              <p className="mt-3 text-sm text-white/58">
                {membership.routingModel === "commission"
                  ? `Commission ${membership.commissionRate ? `${Math.round(membership.commissionRate * 100)}%` : "set on payout routing"}.`
                  : membership.routingModel === "booth_rent"
                    ? `Booth rent ${membership.boothRentAmount ? currency(membership.boothRentAmount) : "configured"} ${membership.boothRentFrequency ?? ""}`.trim()
                    : "Freelance routing stays outside shop share."}
              </p>
            </div>
          )) : (
            <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
              Compensation memberships will appear here once barbers are attached to the owner&apos;s shop scope.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
