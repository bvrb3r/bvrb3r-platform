"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useFintechManagementQuery } from "@/lib/fintech/client";
import { useShopDashboardQuery, type ShopDashboardBarberSummary } from "@/lib/operations/barber-client";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

type TeamBarberView = {
  id: string;
  name: string;
  roleLabel: string;
  statusLabel: string;
  statusDetail: string;
  todayBookings: number;
  completedServices: number;
  liveServices: number;
  todayPostedAmount: number;
  utilization: number;
  nextAppointmentStart: string | null;
  payoutStatus: string;
  payoutReadinessStatus: string;
  payoutBlockReason: string | null;
  currentShopLabel: string | null;
  accountNeedsAttention: boolean;
};

function formatTime(iso: string | null) {
  if (!iso) {
    return "Open now";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatRoutingLabel(value: string) {
  switch (value) {
    case "booth_rent":
      return "Booth rent";
    case "commission":
      return "Commission";
    case "freelance":
      return "Freelance";
    default:
      return value.replaceAll("_", " ");
  }
}

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function getBarberStatus(barber: ShopDashboardBarberSummary) {
  if (barber.liveAppointmentCount > 0) {
    return {
      label: "Cutting now",
      detail: `${barber.liveAppointmentCount} live service${barber.liveAppointmentCount === 1 ? "" : "s"} in motion`
    };
  }

  if (barber.activeAppointmentCount > 0) {
    return {
      label: "With guest",
      detail: `${barber.activeAppointmentCount} checked-in or upcoming appointment${barber.activeAppointmentCount === 1 ? "" : "s"}`
    };
  }

  if (barber.nextAppointmentStart) {
    return {
      label: "Booked later",
      detail: `Next guest at ${formatTime(barber.nextAppointmentStart)}`
    };
  }

  return {
    label: "Open chair",
    detail: "No active service pressure right now"
  };
}

function MetricSkeleton() {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-20" />
      <Skeleton className="mt-4 h-4 w-28" />
    </div>
  );
}

export function OwnerTeamWorkspace() {
  const shopQuery = useShopDashboardQuery();
  const fintechQuery = useFintechManagementQuery();
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);

  const isInitialLoading =
    (shopQuery.isLoading && !shopQuery.data)
    || (fintechQuery.isLoading && !fintechQuery.data);

  const errorMessage = shopQuery.error ?? fintechQuery.error;

  const barbers = useMemo(() => shopQuery.data?.barbers ?? [], [shopQuery.data?.barbers]);
  const appointments = useMemo(() => shopQuery.data?.appointments ?? [], [shopQuery.data?.appointments]);
  const memberships = useMemo(() => fintechQuery.data?.memberships ?? [], [fintechQuery.data?.memberships]);
  const barberAccounts = useMemo(() => fintechQuery.data?.barbers ?? [], [fintechQuery.data?.barbers]);

  const team = useMemo(() => {
    return barbers
      .map((barber): TeamBarberView => {
        const membership = memberships.find((entry) => entry.barberId === barber.id);
        const account = barberAccounts.find((entry) => entry.barberId === barber.id);
        const status = getBarberStatus(barber);
        const todayPostedAmount = appointments
          .filter((appointment) => appointment.barberId === barber.id && appointment.status === "completed")
          .reduce((sum, appointment) => sum + appointment.totalAmount + appointment.tipAmount, 0);
        const payoutReadinessStatus = account?.payoutReadinessStatus ?? "not_ready";
        const accountNeedsAttention =
          Boolean(membership?.payoutBlockReason)
          || payoutReadinessStatus === "blocked"
          || payoutReadinessStatus === "needs_attention";

        return {
          id: barber.id,
          name: barber.name,
          roleLabel: formatRoutingLabel(membership?.routingModel ?? barber.compensationModel),
          statusLabel: status.label,
          statusDetail: status.detail,
          todayBookings: barber.bookedCount + barber.activeAppointmentCount + barber.liveAppointmentCount + barber.completedCount,
          completedServices: barber.completedCount,
          liveServices: barber.liveAppointmentCount,
          todayPostedAmount,
          utilization: barber.utilization,
          nextAppointmentStart: barber.nextAppointmentStart,
          payoutStatus: formatStatusLabel(account?.operationalStatus ?? "not_ready"),
          payoutReadinessStatus: formatStatusLabel(payoutReadinessStatus),
          payoutBlockReason: membership?.payoutBlockReason ?? account?.missingSteps?.[0] ?? account?.disabledReason ?? null,
          currentShopLabel: membership?.shopLabel ?? account?.shopLabel ?? null,
          accountNeedsAttention
        };
      })
      .sort((left, right) =>
        right.todayPostedAmount - left.todayPostedAmount
        || right.todayBookings - left.todayBookings
        || left.name.localeCompare(right.name)
      );
  }, [appointments, barberAccounts, barbers, memberships]);

  const selectedBarber = team.find((barber) => barber.id === selectedBarberId) ?? team[0] ?? null;
  const cuttingNowCount = team.filter((barber) => barber.statusLabel === "Cutting now").length;
  const openChairCount = team.filter((barber) => barber.statusLabel === "Open chair").length;
  const attentionCount = team.filter((barber) => barber.accountNeedsAttention).length;

  return (
    <div className="space-y-4" data-testid="owner-team-workspace">
      {errorMessage ? <FeedbackBanner tone="error" message={getReadableActionError(errorMessage)} /> : null}

      <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="surface-label">Team</p>
              <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">Know who is producing and who needs help right now.</h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62">
                Team keeps roster visibility, same-day production, payout readiness, and the next staffing action in one owner-safe tab.
              </p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-white/66">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/10 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">
                <Users className="h-4 w-4" />
                {team.length} barbers in scope
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[0.22em] text-white/42">
                {attentionCount} account{attentionCount === 1 ? "" : "s"} need attention
              </p>
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
                  <p className="surface-label">Active barbers</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{team.length}</p>
                  <p className="mt-2 text-sm text-white/58">Current team members attached to this owner scope.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Cutting now</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{cuttingNowCount}</p>
                  <p className="mt-2 text-sm text-white/58">Barbers currently in live service.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Open chairs</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{openChairCount}</p>
                  <p className="mt-2 text-sm text-white/58">Barbers without active chair pressure right now.</p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Payout blockers</p>
                  <p className="mt-3 text-3xl font-semibold" data-display="true">{attentionCount}</p>
                  <p className="mt-2 text-sm text-white/58">Accounts needing owner attention before money moves.</p>
                </div>
              </>
            )}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Selected barber</p>
            <ShieldCheck className="h-5 w-5 text-[#baff69]" />
          </div>

          {isInitialLoading ? (
            <div className="mt-4 space-y-3">
              <MetricSkeleton />
              <MetricSkeleton />
            </div>
          ) : selectedBarber ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-[24px] border border-[#7CFF00]/16 bg-[#7CFF00]/8 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-white">{selectedBarber.name}</p>
                    <p className="mt-1 text-sm text-white/60">{selectedBarber.roleLabel} - {selectedBarber.currentShopLabel ?? "No shop label yet"}</p>
                  </div>
                  <span className="status-pill text-[#d7ffab]">{selectedBarber.statusLabel}</span>
                </div>
                <p className="mt-3 text-sm text-white/62">{selectedBarber.statusDetail}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Performance summary</p>
                  <p className="mt-3 text-2xl font-semibold">{currency(selectedBarber.todayPostedAmount)}</p>
                  <p className="mt-2 text-sm text-white/58">{selectedBarber.todayBookings} bookings in today&apos;s lane</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Completed services</p>
                  <p className="mt-3 text-2xl font-semibold">{selectedBarber.completedServices}</p>
                  <p className="mt-2 text-sm text-white/58">{selectedBarber.liveServices} live services still in motion</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Schedule summary</p>
                  <p className="mt-3 text-2xl font-semibold">{selectedBarber.nextAppointmentStart ? formatTime(selectedBarber.nextAppointmentStart) : "Open now"}</p>
                  <p className="mt-2 text-sm text-white/58">{selectedBarber.utilization}% utilization today</p>
                </div>
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Account health</p>
                  <p className="mt-3 text-2xl font-semibold capitalize">{selectedBarber.payoutStatus}</p>
                  <p className="mt-2 text-sm text-white/58">{selectedBarber.payoutBlockReason ?? `Payout readiness ${selectedBarber.payoutReadinessStatus}.`}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/dashboard/owner/schedule"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#cfff93]/40 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-black shadow-[0_14px_34px_rgba(124,255,0,0.24)] transition hover:-translate-y-0.5 sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
                >
                  Open schedule
                </Link>
                <Link
                  href="/dashboard/owner/settings"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7cff00]/20 hover:text-[#d7ffab] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
                >
                  Open settings
                </Link>
                <Link
                  href="/dashboard/owner/money"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7cff00]/20 hover:text-[#d7ffab] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
                >
                  Open money
                </Link>
              </div>
            </div>
          ) : (
            <div className="empty-state-panel mt-4 rounded-[24px] p-5 text-sm leading-7 text-white/58">
              Team detail will appear here when a barber is in scope for this owner.
            </div>
          )}
        </Card>
      </section>

      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="surface-label">Barber roster</p>
            <p className="mt-2 text-sm text-white/58">Tap a barber to inspect same-day production, schedule posture, and payout readiness without leaving the team lane.</p>
          </div>
          <span className="status-pill text-[#d7ffab]">Owner-safe visibility</span>
        </div>

        <div className="mt-4 space-y-3">
          {isInitialLoading ? (
            <>
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
            </>
          ) : team.length ? (
            team.map((barber) => (
              <button
                key={barber.id}
                type="button"
                onClick={() => setSelectedBarberId(barber.id)}
                className={`w-full rounded-[26px] border p-4 text-left transition ${
                  barber.id === selectedBarber?.id
                    ? "border-[#7CFF00]/22 bg-[#7CFF00]/8"
                    : "border-white/8 bg-black/20 hover:border-[#7CFF00]/16 hover:bg-black/30"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-white">{barber.name}</p>
                    <p className="mt-1 text-sm text-white/55">{barber.roleLabel} - {barber.currentShopLabel ?? "No active shop label"}</p>
                  </div>
                  <span className="status-pill text-[#d7ffab]">{barber.statusLabel}</span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-5">
                  <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                    <p className="surface-label">Today bookings</p>
                    <p className="mt-2 text-base font-semibold">{barber.todayBookings}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                    <p className="surface-label">Posted today</p>
                    <p className="mt-2 text-base font-semibold">{currency(barber.todayPostedAmount)}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                    <p className="surface-label">Completed</p>
                    <p className="mt-2 text-base font-semibold">{barber.completedServices}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                    <p className="surface-label">Next up</p>
                    <p className="mt-2 text-base font-semibold">{barber.nextAppointmentStart ? formatTime(barber.nextAppointmentStart) : "Open"}</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/18 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="surface-label">Account</p>
                      <ArrowUpRight className="h-4 w-4 text-[#baff69]" />
                    </div>
                    <p className="mt-2 text-base font-semibold capitalize">{barber.payoutStatus}</p>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="empty-state-panel rounded-[24px] p-6 text-sm leading-7 text-white/58">
              No barber roster is attached to this owner scope yet.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
