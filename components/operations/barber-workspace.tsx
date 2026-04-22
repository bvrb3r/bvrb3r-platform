"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock3, MessageSquareText, ShieldCheck, WalletCards } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useBarberFintechReadinessQuery, useBarberPayoutsQuery } from "@/lib/fintech/client";
import { useCreateMessageThreadMutation } from "@/lib/messages/client";
import {
  useBarberCancelBookingMutation,
  useBarberLifecycleMutation,
  useBarberOverviewQuery,
  useSaveBarberSubtypeMutation,
  type BarberApiError,
  type BarberBlockedTimeView,
  type BarberOperationalAppointment,
  type BarberWorkingHoursView
} from "@/lib/operations/barber-client";
import { useBarberTrustSummary } from "@/lib/trust/client";
import { currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { BarberSubtype } from "@/types/domain";

type LifecycleAction = { action: "check_in" | "service_start" | "service_complete"; label: string; pendingLabel: string; successMessage: string };
type GapView = { startsAt: string; endsAt: string; durationMinutes: number };

const subtypeOptions: Array<{ subtype: BarberSubtype; label: string; description: string }> = [
  { subtype: "freelance", label: "Freelance", description: "Independent chair posture with self-managed availability." },
  { subtype: "commission", label: "Commission", description: "Shop commission model with shared schedule and payout rails." },
  { subtype: "blueprint", label: "Booth rent / Blueprint", description: "Booth-rent model with independent revenue posture." }
];

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

function buildOpenGaps({
  businessDate,
  currentShopId,
  workingHours,
  blockedTimes,
  appointments
}: {
  businessDate: string;
  currentShopId: string | null;
  workingHours: BarberWorkingHoursView[];
  blockedTimes: BarberBlockedTimeView[];
  appointments: BarberOperationalAppointment[];
}) {
  const weekday = new Date(`${businessDate}T12:00:00`).getDay();
  const now = new Date();
  const isToday = businessDate === now.toISOString().slice(0, 10);
  const ranges = workingHours
    .filter((row) => row.weekday === weekday && (!currentShopId || row.locationId === currentShopId))
    .map((row) => ({
      start: new Date(`${businessDate}T${row.startTime}:00`).getTime(),
      end: new Date(`${businessDate}T${row.endTime}:00`).getTime()
    }));
  const busy = [
    ...appointments.filter((row) => !["cancelled", "no_show"].includes(row.status)).map((row) => ({ start: new Date(row.start).getTime(), end: new Date(row.end).getTime() })),
    ...blockedTimes
      .filter((row) => row.startsAt.slice(0, 10) === businessDate || row.endsAt.slice(0, 10) === businessDate)
      .map((row) => ({ start: new Date(row.startsAt).getTime(), end: new Date(row.endsAt).getTime() }))
  ].sort((left, right) => left.start - right.start);

  const gaps: GapView[] = [];
  for (const range of ranges) {
    let cursor = range.start;
    for (const interval of busy) {
      if (interval.end <= range.start || interval.start >= range.end) continue;
      const start = Math.max(interval.start, range.start);
      if (start > cursor) {
        gaps.push({ startsAt: new Date(cursor).toISOString(), endsAt: new Date(start).toISOString(), durationMinutes: Math.round((start - cursor) / 60_000) });
      }
      cursor = Math.max(cursor, Math.min(interval.end, range.end));
    }
    if (cursor < range.end) {
      gaps.push({ startsAt: new Date(cursor).toISOString(), endsAt: new Date(range.end).toISOString(), durationMinutes: Math.round((range.end - cursor) / 60_000) });
    }
  }

  return gaps
    .filter((gap) => gap.durationMinutes >= 15)
    .filter((gap) => !isToday || new Date(gap.endsAt).getTime() > now.getTime())
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}

export function BarberWorkspace({ barberName, barberTitle, barberSubtype }: { barberName: string; barberTitle: string; barberSubtype?: BarberSubtype }) {
  const router = useRouter();
  const overviewQuery = useBarberOverviewQuery();
  const trustQuery = useBarberTrustSummary();
  const readinessQuery = useBarberFintechReadinessQuery();
  const payoutsQuery = useBarberPayoutsQuery();
  const lifecycleMutation = useBarberLifecycleMutation();
  const cancelMutation = useBarberCancelBookingMutation();
  const saveSubtypeMutation = useSaveBarberSubtypeMutation();
  const threadMutation = useCreateMessageThreadMutation();
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(null);
  const [statusUpdate, setStatusUpdate] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [configuredSubtype, setConfiguredSubtype] = useState<BarberSubtype | undefined>(barberSubtype);
  const [selectedSubtype, setSelectedSubtype] = useState<BarberSubtype>(barberSubtype ?? "freelance");
  const [showSubtypeEditor, setShowSubtypeEditor] = useState(!barberSubtype);

  const payload = overviewQuery.data;
  const businessDate = payload?.summary.businessDate ?? new Date().toISOString().slice(0, 10);
  const todayAppointments = useMemo(() => [...(payload?.todayAppointments ?? [])].sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime()), [payload?.todayAppointments]);
  const nextAppointment = payload?.nextAppointment ?? todayAppointments.find((row) => !["completed", "cancelled", "no_show"].includes(row.status)) ?? null;
  const relationship = nextAppointment ? payload?.quickClients.find((row) => row.clientId === nextAppointment.clientId) ?? null : null;
  const bookedToday = todayAppointments.filter((row) => !["cancelled", "no_show"].includes(row.status)).reduce((sum, row) => sum + row.totalAmount, 0);
  const openGaps = useMemo(() => buildOpenGaps({
    businessDate,
    currentShopId: payload?.status.currentShopId ?? null,
    workingHours: payload?.workingHours ?? [],
    blockedTimes: payload?.blockedTimes ?? [],
    appointments: todayAppointments
  }), [businessDate, payload?.blockedTimes, payload?.status.currentShopId, payload?.workingHours, todayAppointments]);
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

  async function handleSaveSubtype() {
    setStatusUpdate(null);
    try {
      await saveSubtypeMutation.mutateAsync(selectedSubtype);
      setConfiguredSubtype(selectedSubtype);
      setShowSubtypeEditor(false);
      setStatusUpdate({ tone: "success", message: "Business model saved. Your barber lane is ready to run on the live rails." });
      (router as { refresh?: () => void }).refresh?.();
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

      <Card className="rounded-[32px] p-5" data-testid="barber-subtype-settings">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">Business model</p>
            <p className="mt-3 text-lg font-semibold text-white">{subtypeOptions.find((entry) => entry.subtype === configuredSubtype)?.label ?? "Finish barber setup"}</p>
            <p className="mt-2 text-sm leading-7 text-white/60">{subtypeOptions.find((entry) => entry.subtype === configuredSubtype)?.description ?? "Choose the right barber operating model so earnings, payout posture, and trust messaging stay aligned."}</p>
          </div>
          {!configuredSubtype ? null : <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => setShowSubtypeEditor((current) => !current)}>{showSubtypeEditor ? "Hide setup" : "Update business model"}</Button>}
        </div>
        {showSubtypeEditor ? (
          <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4" data-testid="barber-subtype-setup">
            <p className="surface-label">Complete your barber setup</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {subtypeOptions.map((option) => (
                <button key={option.subtype} type="button" onClick={() => setSelectedSubtype(option.subtype)} className={`rounded-[22px] border p-4 text-left transition ${selectedSubtype === option.subtype ? "border-[#7cff00]/24 bg-[#7cff00]/10 text-white" : "border-white/8 bg-black/18 text-white/72 hover:border-[#7cff00]/18 hover:text-white"}`}>
                  <p className="text-base font-semibold">{option.label}</p>
                  <p className="mt-2 text-sm leading-6 text-white/58">{option.description}</p>
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-3">
              {!configuredSubtype ? null : <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => setShowSubtypeEditor(false)}>Cancel</Button>}
              <Button type="button" className="h-11 px-4" disabled={saveSubtypeMutation.isPending} onClick={() => void handleSaveSubtype()}>{saveSubtypeMutation.isPending ? "Saving..." : "Save business model"}</Button>
            </div>
          </div>
        ) : null}
      </Card>

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
                <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => router.push("/appointments")}>Reschedule in calendar</Button>
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
            <p className="surface-label">Open gaps</p>
            <div className="mt-3 space-y-3">
              {openGaps.length ? openGaps.slice(0, 3).map((gap) => (
                <div key={`${gap.startsAt}-${gap.endsAt}`} className="flex items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-black/18 px-3 py-3"><div><p className="font-medium text-white">{formatTime(gap.startsAt)} - {formatTime(gap.endsAt)}</p><p className="mt-1 text-sm text-white/58">{gap.durationMinutes} open minutes in the live chair calendar.</p></div><Clock3 className="h-4 w-4 text-[#d7ffab]" /></div>
              )) : <p className="text-sm leading-6 text-white/58">No open working-hours gap is currently derived from this barber&apos;s live availability, blocked times, and appointments.</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">{blockerLabels.length ? blockerLabels.slice(0, 4).map((label) => <span key={label} className="status-pill text-white/72">{label}</span>) : <span className="status-pill text-[#d7ffab]">No active compliance blockers</span>}</div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => router.push("/appointments")}>Open calendar</Button>
            <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => router.push("/earnings")}><WalletCards className="h-4 w-4" />Open earnings</Button>
            <Button type="button" variant="ghost" className="h-11 px-4" onClick={() => router.push("/settings")}>Review profile</Button>
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
                  <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => router.push("/appointments")}>Reschedule</Button>
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
