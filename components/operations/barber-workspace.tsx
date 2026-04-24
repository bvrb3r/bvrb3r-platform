"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock3, MessageSquareText, ShieldCheck, WalletCards } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useBarberAiSummaryQuery, useTrackAiRecommendationMutation } from "@/lib/ai/client";
import { useBarberFintechReadinessQuery, useBarberPayoutsQuery } from "@/lib/fintech/client";
import { useCreateMessageThreadMutation } from "@/lib/messages/client";
import {
  useBarberCancelBookingMutation,
  useBarberLifecycleMutation,
  useNotifyBarberOpenSlotMutation,
  useBarberOverviewQuery,
  useUpdateBarberStatusMutation,
  type BarberApiError,
  type BarberOperationalAppointment,
  type BarberStatusView
} from "@/lib/operations/barber-client";
import { useBarberTrustSummary } from "@/lib/trust/client";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { BarberSubtype } from "@/types/domain";

type StatusFormState = {
  liveStatus: BarberStatusView["liveStatus"];
  isOnline: boolean;
  acceptsWalkIns: boolean;
  currentShopId: string | null;
};

type LifecycleAction = { action: "check_in" | "service_start" | "service_complete"; label: string; pendingLabel: string; successMessage: string };

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function formatLongDate(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${dateKey}T12:00:00`));
}

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function buildStatusForm(status: BarberStatusView): StatusFormState {
  return {
    liveStatus: status.liveStatus,
    isOnline: status.isOnline,
    acceptsWalkIns: status.acceptsWalkIns,
    currentShopId: status.currentShopId
  };
}

function getLiveStatusTone(status: BarberStatusView["liveStatus"]) {
  if (status === "available") {
    return "text-[#d7ffab]";
  }

  if (status === "busy") {
    return "text-amber-200";
  }

  if (status === "on_break") {
    return "text-sky-200";
  }

  if (status === "away") {
    return "text-white/72";
  }

  return "text-white/62";
}

function getLifecycleAction(appointment: BarberOperationalAppointment): LifecycleAction | null {
  if (appointment.status === "booked" || appointment.status === "confirmed") {
    return { action: "check_in", label: "Check in", pendingLabel: "Checking in...", successMessage: "Client checked in and moved into the live chair flow." };
  }
  if (appointment.status === "checked_in") {
    return { action: "service_start", label: "Start service", pendingLabel: "Starting...", successMessage: "Service is now marked in progress." };
  }
  if (appointment.status === "in_service") {
    return { action: "service_complete", label: "Complete", pendingLabel: "Completing...", successMessage: "Service completed and posted to the earnings and payout rails." };
  }
  return null;
}

function canCancelAppointment(appointment: BarberOperationalAppointment) {
  return !["completed", "cancelled", "no_show", "refunded"].includes(appointment.status);
}

function MetricSkeleton() {
  return <div className="rounded-[24px] border border-white/8 bg-black/20 p-4"><Skeleton className="h-4 w-24" /><Skeleton className="mt-4 h-8 w-20" /><Skeleton className="mt-3 h-4 w-32" /></div>;
}

export function BarberWorkspace({ barberName, barberTitle, barberSubtype }: { barberName: string; barberTitle: string; barberSubtype?: BarberSubtype }) {
  const router = useRouter();
  const overviewQuery = useBarberOverviewQuery();
  const aiSummaryQuery = useBarberAiSummaryQuery();
  const trustQuery = useBarberTrustSummary();
  const readinessQuery = useBarberFintechReadinessQuery();
  const payoutsQuery = useBarberPayoutsQuery();
  const lifecycleMutation = useBarberLifecycleMutation();
  const cancelMutation = useBarberCancelBookingMutation();
  const notifyGapMutation = useNotifyBarberOpenSlotMutation();
  const statusMutation = useUpdateBarberStatusMutation();
  const trackAiRecommendationMutation = useTrackAiRecommendationMutation();
  const threadMutation = useCreateMessageThreadMutation();
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(null);
  const [pendingGapRecommendationId, setPendingGapRecommendationId] = useState<string | null>(null);
  const [statusUpdate, setStatusUpdate] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [statusForm, setStatusForm] = useState<StatusFormState | null>(null);

  const payload = overviewQuery.data;
  const businessDate = payload?.summary.businessDate ?? new Date().toISOString().slice(0, 10);
  const todayAppointments = [...(payload?.todayAppointments ?? [])].sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
  const nextAppointment = payload?.nextAppointment ?? todayAppointments.find((row) => !["completed", "cancelled", "no_show"].includes(row.status)) ?? null;
  const relationship = nextAppointment ? payload?.quickClients.find((row) => row.clientId === nextAppointment.clientId) ?? null : null;
  const bookedToday = todayAppointments.filter((row) => !["cancelled", "no_show"].includes(row.status)).reduce((sum, row) => sum + row.totalAmount, 0);
  const gapAlerts = aiSummaryQuery.data?.gapAlerts ?? [];
  const verificationDecision = trustQuery.data?.verificationDecision;
  const bookingGate = verificationDecision?.gates.booking;
  const payoutGate = verificationDecision?.gates.payout;
  const blockerLabels = Array.from(new Set([
    ...(bookingGate && !bookingGate.allowed ? bookingGate.reasons : []),
    ...(payoutGate && !payoutGate.allowed ? payoutGate.reasons : []),
    ...(trustQuery.data?.reminders ?? []),
    ...(readinessQuery.data?.routingSummary.blockedReasons ?? [])
  ].filter(Boolean)));
  const initialLoading = overviewQuery.isLoading && !payload;
  const overviewError = overviewQuery.error ? getReadableActionError(overviewQuery.error as BarberApiError) : null;
  const latestPayout = payoutsQuery.data?.recentExecutions?.[0] ?? null;

  useEffect(() => {
    if (!payload?.status) {
      return;
    }

    setStatusForm(buildStatusForm(payload.status));
  }, [payload]);

  async function handleLifecycleAction(appointment: BarberOperationalAppointment, action: LifecycleAction) {
    setStatusUpdate(null);
    setPendingAppointmentId(appointment.id);
    try {
      await lifecycleMutation.mutateAsync({ appointmentId: appointment.id, expectedRevision: appointment.revision, action: action.action });
      setStatusUpdate({ tone: "success", message: action.successMessage });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    } finally {
      setPendingAppointmentId(null);
    }
  }

  async function handleCancel(appointment: BarberOperationalAppointment) {
    if (!canCancelAppointment(appointment)) return;
    if (typeof window !== "undefined" && !window.confirm(`Cancel ${appointment.display.clientName}'s appointment?`)) return;
    setStatusUpdate(null);
    setPendingAppointmentId(appointment.id);
    try {
      await cancelMutation.mutateAsync({ appointmentId: appointment.id, expectedRevision: appointment.revision, reason: "Cancelled by barber" });
      setStatusUpdate({ tone: "success", message: `${appointment.display.clientName}'s appointment was cancelled through the canonical booking flow.` });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    } finally {
      setPendingAppointmentId(null);
    }
  }

  async function handleMessage(appointment: BarberOperationalAppointment) {
    setStatusUpdate(null);
    try {
      const payload = await threadMutation.mutateAsync({ appointmentId: appointment.id });
      if (payload.thread?.id) router.push(`/workspace/messages/${payload.thread.id}`);
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  async function handleGapAlertAction(alert: NonNullable<typeof aiSummaryQuery.data>["gapAlerts"][number]) {
    setStatusUpdate(null);
    setPendingGapRecommendationId(alert.recommendationId);

    try {
      trackAiRecommendationMutation.mutate({
        recommendationId: alert.recommendationId,
        recommendationType: alert.type,
        action: "clicked",
        surface: "barber_dashboard",
        relatedIds: {
          barberId: payload?.barberId,
          locationId: alert.locationId ?? null
        },
        payload: {
          startsAt: alert.startsAt,
          endsAt: alert.endsAt
        }
      });

      const result = await notifyGapMutation.mutateAsync({
        startsAt: alert.startsAt,
        locationId: alert.locationId ?? null,
        locationLabel: alert.locationLabel ?? null
      });

      setStatusUpdate({
        tone: "success",
        message: result.notificationsQueued
          ? `Queued ${result.notificationsQueued} live availability alert${result.notificationsQueued === 1 ? "" : "s"} for this opening.`
          : "This opening is real, but no followed clients are currently eligible for an alert."
      });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    } finally {
      setPendingGapRecommendationId(null);
    }
  }

  async function handleSaveStatus() {
    if (!statusForm) {
      return;
    }

    setStatusUpdate(null);
    try {
      await statusMutation.mutateAsync(statusForm);
      setStatusUpdate({ tone: "success", message: "Chair status updated for discovery, walk-ins, and live barber scheduling." });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as BarberApiError) });
    }
  }

  return (
    <div className="space-y-4" data-testid="barber-workspace">
      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">Today</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">{barberName}</h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">See the chair, the next client, the money moving today, and the real gaps you can still fill.</p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-4 text-right">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">{formatLongDate(businessDate)}</p>
            <p className="mt-2 text-sm text-white/78">{payload?.status.currentShopLabel ?? "Assigned chair territory"}</p>
            <p className="mt-1 text-sm text-white/56">{payload?.status.liveStatusLabel ?? barberTitle}</p>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {statusUpdate ? <FeedbackBanner tone={statusUpdate.tone} message={statusUpdate.message} /> : null}
          {overviewError ? <FeedbackBanner tone="error" message={overviewError} /> : null}
        </div>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <Card className="rounded-[32px] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="surface-label">Chair status</p>
              <p className="mt-2 text-sm text-white/58">Keep live chair posture on Home so the next move is obvious the moment the barber opens the app.</p>
            </div>
            <span className={`status-pill ${getLiveStatusTone(payload?.status.liveStatus ?? "offline")}`}>
              {payload?.status.liveStatusLabel ?? "Offline"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Select
              value={statusForm?.liveStatus ?? payload?.status.liveStatus ?? "available"}
              onChange={(event) =>
                setStatusForm((current) =>
                  current
                    ? { ...current, liveStatus: event.target.value as BarberStatusView["liveStatus"] }
                    : current
                )
              }
            >
              <option value="offline">Offline</option>
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="on_break">On break</option>
              <option value="away">Away</option>
            </Select>

            <Select
              value={statusForm?.currentShopId ?? payload?.status.currentShopId ?? ""}
              onChange={(event) =>
                setStatusForm((current) =>
                  current
                    ? { ...current, currentShopId: event.target.value || null }
                    : current
                )
              }
            >
              <option value="">No shop selected</option>
              {(payload?.shops ?? []).map((shop) => (
                <option key={shop.id} value={shop.id}>{shop.label}</option>
              ))}
            </Select>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-[18px] border border-white/8 bg-black/18 px-4 py-3 text-sm text-white/72">
              <input
                type="checkbox"
                checked={statusForm?.isOnline ?? payload?.status.isOnline ?? false}
                onChange={(event) =>
                  setStatusForm((current) =>
                    current ? { ...current, isOnline: event.target.checked } : current
                  )
                }
                className="h-4 w-4 rounded border-white/20 bg-black"
              />
              Show barber as online
            </label>

            <label className="flex items-center gap-3 rounded-[18px] border border-white/8 bg-black/18 px-4 py-3 text-sm text-white/72">
              <input
                type="checkbox"
                checked={statusForm?.acceptsWalkIns ?? payload?.status.acceptsWalkIns ?? false}
                onChange={(event) =>
                  setStatusForm((current) =>
                    current ? { ...current, acceptsWalkIns: event.target.checked } : current
                  )
                }
                className="h-4 w-4 rounded border-white/20 bg-black"
              />
              Accept walk-ins
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-white/58">
              <p>{barberTitle}{barberSubtype ? ` | ${formatStatusLabel(barberSubtype)}` : ""}</p>
              <p className="mt-1">{payload?.status.note ?? "Chair posture is synced from the canonical barber status rail."}</p>
            </div>
            <Button type="button" className="h-11 px-4" disabled={statusMutation.isPending || !statusForm} onClick={() => void handleSaveStatus()}>
              {statusMutation.isPending ? "Saving..." : "Save chair status"}
            </Button>
          </div>
        </Card>

        <Card className="rounded-[32px] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="surface-label">Quick actions</p>
              <p className="mt-2 text-sm text-white/58">Home stays fast: jump straight into the next barber action without making any extra tab feel primary.</p>
            </div>
            <WalletCards className="h-5 w-5 text-[#baff69]" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button type="button" className="h-11 px-4" onClick={() => router.push("/dashboard/barber/calendar")}>Open calendar</Button>
            <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => router.push("/dashboard/barber/checkout")}>Checkout</Button>
            <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => router.push("/dashboard/barber/calendar")}>Block time</Button>
            <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => router.push("/dashboard/barber/profile")}>View profile</Button>
            <Button type="button" variant="ghost" className="h-11 px-4" onClick={() => router.push("/dashboard/barber/calendar")}>Update availability</Button>
            <Button type="button" variant="ghost" className="h-11 px-4" onClick={() => router.push("/dashboard/barber/settings")}>Open settings</Button>
          </div>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {initialLoading ? (
          <><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></>
        ) : (
          <>
            <Card className="rounded-[28px] border-[#7cff00]/16 bg-[linear-gradient(180deg,rgba(124,255,0,0.14),rgba(8,8,8,0.98))] p-5"><p className="surface-label text-[#d7ffab]">Today&apos;s bookings</p><p className="mt-4 text-[2.4rem] font-semibold tracking-[-0.05em]" data-display="true">{payload?.earnings.todayBookings ?? 0}</p><p className="mt-3 text-sm text-white/62">{payload?.earnings.completedServices ?? 0} completed and {payload?.earnings.upcomingBookings ?? 0} still active.</p></Card>
            <Card className="rounded-[28px] border-white/8 bg-black/20 p-5"><p className="surface-label">Earned today</p><p className="mt-4 text-[2.1rem] font-semibold tracking-[-0.05em]" data-display="true">{currency(payload?.earnings.grossSales ?? 0)}</p><p className="mt-3 text-sm text-white/62">Tips {currency(payload?.earnings.tips ?? 0)} | Avg ticket {currency(payload?.earnings.averageTicket ?? 0)}</p></Card>
            <Card className="rounded-[28px] border-white/8 bg-black/20 p-5"><p className="surface-label">Booked on calendar</p><p className="mt-4 text-[2.1rem] font-semibold tracking-[-0.05em]" data-display="true">{currency(bookedToday)}</p><p className="mt-3 text-sm text-white/62">{payload?.earnings.outstandingCheckoutCount ? `${payload.earnings.outstandingCheckoutCount} appointments still need checkout follow-up.` : "All active chair value is already reflected in the live schedule."}</p></Card>
            <Card className="rounded-[28px] border-white/8 bg-black/20 p-5"><p className="surface-label">Payout status</p><p className="mt-4 text-[2.1rem] font-semibold tracking-[-0.05em]" data-display="true">{currency(readinessQuery.data?.routingSummary.readyForPayoutAmount ?? 0)}</p><p className="mt-3 text-sm text-white/62">{latestPayout ? `Latest payout ${formatStatusLabel(latestPayout.executionStatus)}.` : `${readinessQuery.data?.routingSummary.blockedPaymentsCount ?? 0} payout blockers currently on file.`}</p></Card>
          </>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-start justify-between gap-3"><div><p className="surface-label">Next client</p><p className="mt-2 text-sm text-white/58">The next chair move should be obvious the moment the barber opens the app.</p></div><CalendarDays className="h-5 w-5 text-[#d7ffab]" /></div>
          {initialLoading ? <div className="mt-4"><MetricSkeleton /></div> : nextAppointment ? (
            <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><p className="text-2xl font-semibold text-white">{nextAppointment.display.clientName}</p><StatusBadge status={nextAppointment.status} balanceDue={nextAppointment.balanceDue} /></div>
                  <p className="mt-2 text-sm text-white/58">{nextAppointment.display.serviceName}</p>
                  <p className="mt-2 text-sm text-white/58">{formatDateTime(nextAppointment.start)} | {nextAppointment.display.locationLabel}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/18 px-4 py-3 text-right"><p className="surface-label">Ticket</p><p className="mt-2 text-xl font-semibold text-white">{currency(nextAppointment.totalAmount)}</p><p className="mt-1 text-sm text-white/52">{nextAppointment.financial.latestStatusLabel}</p></div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-4"><p className="surface-label">Client context</p><p className="mt-3 text-sm text-white/74">{relationship ? `${relationship.completedAppointments} completed visits | ${relationship.relationshipLabel}` : "This is the next scheduled appointment on the live barber calendar."}</p><p className="mt-2 text-sm text-white/58">{relationship?.lastAppointmentNote ?? relationship?.intelligence.nextBestAction ?? "No extra notes captured for this client yet."}</p></div>
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-4"><p className="surface-label">What happens next</p><p className="mt-3 text-sm text-white/74">{nextAppointment.display.lifecycleDetail}</p><p className="mt-2 text-sm text-white/58">{nextAppointment.financial.outstandingBalance > 0 ? `${currency(nextAppointment.financial.outstandingBalance)} still outstanding after service.` : "No payment balance is currently blocking this appointment."}</p></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {(() => {
                  const action = getLifecycleAction(nextAppointment);
                  return action ? <Button type="button" className="h-11 px-4" disabled={lifecycleMutation.isPending && pendingAppointmentId === nextAppointment.id} onClick={() => void handleLifecycleAction(nextAppointment, action)}>{lifecycleMutation.isPending && pendingAppointmentId === nextAppointment.id ? action.pendingLabel : action.label}</Button> : <span className="status-pill text-white/72">{nextAppointment.display.statusLabel}</span>;
                })()}
                <Button type="button" variant="secondary" className="h-11 px-4" disabled={threadMutation.isPending} onClick={() => void handleMessage(nextAppointment)}><MessageSquareText className="h-4 w-4" />{threadMutation.isPending ? "Opening..." : "Message client"}</Button>
                <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => router.push("/dashboard/barber/calendar")}>Reschedule in calendar</Button>
                {nextAppointment.status === "completed" && nextAppointment.financial.outstandingBalance > 0 ? <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => router.push("/dashboard/barber/checkout")}>Open checkout</Button> : null}
                {canCancelAppointment(nextAppointment) ? <Button type="button" variant="ghost" className="h-11 px-4" disabled={cancelMutation.isPending && pendingAppointmentId === nextAppointment.id} onClick={() => void handleCancel(nextAppointment)}>{cancelMutation.isPending && pendingAppointmentId === nextAppointment.id ? "Cancelling..." : "Cancel booking"}</Button> : null}
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-[24px] border border-dashed border-white/10 bg-black/18 p-5 text-sm leading-7 text-white/58">No appointments are on today&apos;s barber calendar yet. Use the calendar to set working hours, add blocked time, and keep the next real booking easy to take.</div>
          )}
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-start justify-between gap-3"><div><p className="surface-label">Approval and payout posture</p><p className="mt-2 text-sm text-white/58">Verification, payout readiness, and blockers stay visible without inventing separate status truth.</p></div><ShieldCheck className="h-5 w-5 text-[#baff69]" /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Verification</p><p className="mt-2 text-lg font-semibold text-white">{trustQuery.data?.canonicalOverallStatus ? formatStatusLabel(trustQuery.data.canonicalOverallStatus) : "Loading"}</p><p className="mt-2 text-sm text-white/58">{bookingGate && !bookingGate.allowed ? bookingGate.reasons[0] : trustQuery.data?.publicBadgePreview?.[0] ?? "Verification details will stay visible here."}</p></div>
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4"><p className="surface-label">Payout readiness</p><p className="mt-2 text-lg font-semibold text-white">{readinessQuery.data?.connectedAccount.operationalStatus ? formatStatusLabel(readinessQuery.data.connectedAccount.operationalStatus) : "Loading"}</p><p className="mt-2 text-sm text-white/58">{payoutGate && !payoutGate.allowed ? payoutGate.reasons[0] : readinessQuery.data?.routingSummary.blockedPaymentsCount ? `${readinessQuery.data.routingSummary.blockedPaymentsCount} payout blockers currently on file.` : "No payout blocker is currently stored for this barber."}</p></div>
          </div>
          <div className="mt-4 rounded-[20px] border border-white/8 bg-black/20 p-4">
            <p className="surface-label">Gap alerts</p>
            <div className="mt-3 space-y-3">
              {gapAlerts.length ? gapAlerts.slice(0, 3).map((alert) => {
                const isPending = pendingGapRecommendationId === alert.recommendationId;
                return (
                  <div key={alert.recommendationId} className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{formatTime(alert.startsAt)} - {formatTime(alert.endsAt)}</p>
                        <p className="mt-1 text-sm text-white/58">{alert.reason}</p>
                        <p className="mt-2 text-sm text-white/48">{alert.explanation}</p>
                      </div>
                      <Clock3 className="mt-1 h-4 w-4 shrink-0 text-[#d7ffab]" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 px-3"
                        disabled={notifyGapMutation.isPending && isPending}
                        onClick={() => void handleGapAlertAction(alert)}
                      >
                        {notifyGapMutation.isPending && isPending ? "Notifying..." : alert.actionLabel}
                      </Button>
                      <Button type="button" variant="ghost" className="h-10 px-3" onClick={() => router.push("/dashboard/barber/calendar")}>
                        Open calendar
                      </Button>
                    </div>
                  </div>
                );
              }) : <p className="text-sm leading-6 text-white/58">No meaningful revenue gap is currently derived from this barber&apos;s live schedule, blocked times, and active services.</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">{blockerLabels.length ? blockerLabels.slice(0, 4).map((label) => <span key={label} className="status-pill text-white/72">{label}</span>) : <span className="status-pill text-[#d7ffab]">No active compliance blockers</span>}</div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => router.push("/dashboard/barber/calendar")}>Open calendar</Button>
            <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => router.push("/dashboard/barber/checkout")}><WalletCards className="h-4 w-4" />Open checkout</Button>
            <Button type="button" variant="ghost" className="h-11 px-4" onClick={() => router.push("/dashboard/barber/settings")}>Review settings</Button>
          </div>
        </Card>
      </section>

      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="surface-label">Today&apos;s schedule</p><p className="mt-2 text-sm text-white/58">Canonical appointments only, with payment state and action entry points grounded in the shared lifecycle.</p></div><span className="status-pill text-[#d7ffab]">{todayAppointments.length} appointment{todayAppointments.length === 1 ? "" : "s"}</span></div>
        <div className="mt-4 space-y-3">
          {initialLoading ? (
            <><MetricSkeleton /><MetricSkeleton /><MetricSkeleton /></>
          ) : todayAppointments.length ? todayAppointments.map((appointment) => {
            const action = getLifecycleAction(appointment);
            const isPending = pendingAppointmentId === appointment.id;
            return (
              <div key={appointment.id} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><p className="text-lg font-semibold text-white">{appointment.display.clientName}</p><StatusBadge status={appointment.status} balanceDue={appointment.balanceDue} /></div>
                    <p className="mt-2 text-sm text-white/58">{formatTime(appointment.start)} | {appointment.display.serviceName} | {appointment.display.locationLabel}</p>
                    <p className="mt-2 text-sm text-white/52">{appointment.note?.trim() || appointment.display.lifecycleDetail}</p>
                  </div>
                  <div className="rounded-[18px] border border-white/8 bg-black/18 px-4 py-3 text-right"><p className="text-base font-semibold text-white">{currency(appointment.totalAmount)}</p><p className="mt-1 text-sm text-white/52">{appointment.financial.latestStatusLabel}</p></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  {action ? <Button type="button" className="h-11 px-4" disabled={lifecycleMutation.isPending && isPending} onClick={() => void handleLifecycleAction(appointment, action)}>{lifecycleMutation.isPending && isPending ? action.pendingLabel : action.label}</Button> : <span className="status-pill text-white/72">{appointment.display.statusLabel}</span>}
                  <Button type="button" variant="secondary" className="h-11 px-4" disabled={threadMutation.isPending} onClick={() => void handleMessage(appointment)}><MessageSquareText className="h-4 w-4" />{threadMutation.isPending ? "Opening..." : "Message"}</Button>
                  <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => router.push("/dashboard/barber/calendar")}>Reschedule</Button>
                  {appointment.status === "completed" && appointment.financial.outstandingBalance > 0 ? <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => router.push("/dashboard/barber/checkout")}>Checkout</Button> : null}
                  {canCancelAppointment(appointment) ? <Button type="button" variant="ghost" className="h-11 px-4" disabled={cancelMutation.isPending && isPending} onClick={() => void handleCancel(appointment)}>{cancelMutation.isPending && isPending ? "Cancelling..." : "Cancel"}</Button> : null}
                </div>
              </div>
            );
          }) : <div className="rounded-[24px] border border-dashed border-white/10 bg-black/18 p-6 text-sm leading-7 text-white/58">No appointments are on this barber&apos;s live day sheet yet. Open the calendar to set availability, block time, and stay ready for the next real booking.</div>}
        </div>
      </Card>
    </div>
  );
}
