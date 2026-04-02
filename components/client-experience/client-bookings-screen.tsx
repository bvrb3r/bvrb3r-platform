"use client";

import type { Route } from "next";
import { useEffect, useState } from "react";
import { Clock3, CreditCard, MapPin, Repeat2, Star } from "lucide-react";
import { ClientActionLink, getClientActionClassName } from "@/components/client-experience/client-action-link";
import { ClientFavoriteBarberCard } from "@/components/client-experience/client-favorite-barber-card";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { usePwa } from "@/components/pwa/pwa-provider";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useClientBookingsQuery,
  useCancelBookingMutation,
  useClientPointsBalanceQuery,
  useSaveClientRoutineMutation,
  useSubmitClientReviewMutation,
  type BookingApiError,
  type RoutineCadenceId
} from "@/lib/booking/client";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import { useCreateAppointmentPaymentMutation, type PaymentApiError } from "@/lib/payments/client";
import { usePointsHistoryQuery } from "@/lib/points/client";
import { getReadableActionError } from "@/lib/utils/feedback";
import { currency } from "@/lib/utils";
import type { PointsEventType, PointsTransactionRecord } from "@/types/points";
import type { Location } from "@/types/domain";

const cadenceOptions = [
  { id: "weekly", label: "Weekly", days: 7, summary: "Keep a fresh chair reserved every week." },
  { id: "biweekly", label: "Every 2 weeks", days: 14, summary: "The most natural rhythm for staying sharp without thinking about it." },
  { id: "monthly", label: "Monthly", days: 30, summary: "Set a dependable maintenance visit once a month." }
] as const;

type CadenceId = RoutineCadenceId;

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatAppointmentSummary(iso: string) {
  const date = new Date(iso);
  const dayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);

  return `${dayLabel} | ${timeLabel}`;
}

function formatTimeOnly(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(iso));
}

function formatRecurringPreview(date: Date, timeLabel: string) {
  return `${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(date)} at ${timeLabel}`;
}

function formatDateTimeLabel(iso?: string | null) {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(date)} at ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date)}`;
}

function getTimelineStatusClass(status: "posted" | "pending" | "blocked") {
  if (status === "posted") {
    return "text-[#d7ffab]";
  }

  if (status === "blocked") {
    return "text-rose-200";
  }

  return "text-white/72";
}

function getLocationLabel(location?: Location) {
  if (!location) {
    return "Your regular shop";
  }

  return `${location.name} - ${location.neighborhood}`;
}

function getPointsEventLabel(eventType: PointsEventType) {
  switch (eventType) {
    case "booking":
      return "Booking";
    case "retention":
      return "Retention";
    case "tip":
      return "Tip";
    case "referral":
      return "Referral";
    case "campaign":
      return "Campaign";
    case "cashout":
    default:
      return "Points";
  }
}

function getAppointmentPointsTransactions(transactions: PointsTransactionRecord[], appointmentId?: string | null) {
  if (!appointmentId) {
    return [];
  }

  return transactions.filter((transaction) =>
    transaction.pointsDelta > 0
    && transaction.status !== "reversed"
    && (transaction.sourceId === appointmentId || transaction.metadata.appointmentId === appointmentId)
  );
}

function getMapsHref(location?: Location) {
  if (!location) {
    return undefined;
  }

  if (typeof location.latitude === "number" && typeof location.longitude === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
  }

  const query = location.address ?? `${location.name}, ${location.neighborhood}, ${location.city}, ${location.state}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-24 w-full rounded-[24px]" />
    </div>
  );
}

function OptionButton({
  label,
  detail,
  isActive,
  onClick
}: {
  label: string;
  detail?: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "min-h-14 rounded-[22px] border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b7ff58] focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        isActive
          ? "border-[#9bff2f]/48 bg-[linear-gradient(180deg,rgba(142,214,44,0.2),rgba(16,16,16,0.96))] shadow-[0_14px_28px_rgba(111,182,27,0.18)]"
          : "border-white/10 bg-black/20 hover:border-[#9bff2f]/28 hover:bg-black/28"
      ].join(" ")}
    >
      <span className="block text-sm font-semibold text-white">{label}</span>
      {detail ? <span className="mt-1 block text-xs text-white/58">{detail}</span> : null}
    </button>
  );
}
export function ClientBookingsScreen() {
  const { isOnline } = usePwa();
  const bookingsQuery = useClientBookingsQuery();
  const pointsBalanceQuery = useClientPointsBalanceQuery();
  const pointsHistoryQuery = usePointsHistoryQuery();
  const saveRoutineMutation = useSaveClientRoutineMutation();
  const cancelBookingMutation = useCancelBookingMutation();
  const submitReviewMutation = useSubmitClientReviewMutation();
  const payload = bookingsQuery.data;
  const favoriteBarber = payload?.favoriteBarber ?? null;
  const nextAppointment = payload?.nextAppointment ?? null;
  const history = payload?.history ?? [];
  const savedRoutine = payload?.routine ?? null;
  const favoriteLocation = nextAppointment?.view.location ?? favoriteBarber?.shopLocations[0];
  const profileHref = favoriteBarber ? (`/barber/${favoriteBarber.profile.username}` as Route) : ("/search" as Route);
  const bookingHref = favoriteBarber?.bookingCtaHref
    ? (favoriteBarber.bookingCtaHref as Route)
    : favoriteBarber
      ? buildMarketplaceBookingHref({
          barberId: favoriteBarber.barber.id,
          username: favoriteBarber.profile.username,
          locationId: favoriteBarber.shopLocations[0]?.id,
          sourceKind: "client_dashboard"
        })
      : ("/search" as Route);
  const mapsHref = getMapsHref(favoriteLocation);
  const errorMessage = bookingsQuery.error ? getReadableActionError(bookingsQuery.error as BookingApiError) : null;
  const paymentMutation = useCreateAppointmentPaymentMutation();

  const [selectedCadenceId, setSelectedCadenceId] = useState<CadenceId>("biweekly");
  const [routineFeedback, setRoutineFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [paymentFeedback, setPaymentFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { rating: number; message: string }>>({});
  const [cancelStep, setCancelStep] = useState<"offer_reschedule" | "confirm_cancel" | null>(null);

  useEffect(() => {
    if (savedRoutine?.cadenceId) {
      setSelectedCadenceId(savedRoutine.cadenceId);
    }
  }, [savedRoutine?.cadenceId]);

  const selectedCadence = cadenceOptions.find((option) => option.id === selectedCadenceId) ?? cadenceOptions[1];
  const cadenceBaseDate = nextAppointment
    ? new Date(Math.max(new Date(nextAppointment.start).getTime(), Date.now()))
    : new Date();
  const recurringTimeLabel = nextAppointment ? formatTimeOnly(nextAppointment.start) : "1:30 PM";
  const recurringPreviewDate = addDays(cadenceBaseDate, selectedCadence.days);
  const isInitialLoading = bookingsQuery.isLoading && !payload;
  const favoriteBarberName = favoriteBarber?.barber.name ?? "your barber";
  const canSaveRoutine = Boolean(favoriteBarber || payload?.client?.favoriteBarberReference);
  const savedRoutineLabel = formatDateTimeLabel(savedRoutine?.nextSuggestedAt);
  const latestCompletedAppointment = history[0] ?? null;
  const latestRewardTransactions = getAppointmentPointsTransactions(
    pointsHistoryQuery.data?.transactions ?? [],
    latestCompletedAppointment?.id
  );
  const latestRewardTotal = latestRewardTransactions.reduce((sum, transaction) => sum + transaction.pointsDelta, 0);
  const nextAppointmentPayment = payload?.nextAppointmentPayment ?? null;
  const latestBookingPayment = nextAppointmentPayment?.latestBookingPayment ?? null;
  const defaultPaymentMethod = nextAppointmentPayment?.defaultPaymentMethod ?? null;
  const rescheduleHref = nextAppointment
    ? buildMarketplaceBookingHref({
        barberId: nextAppointment.barberId,
        username: favoriteBarber?.barber.id === nextAppointment.barberId ? favoriteBarber.profile.username : undefined,
        locationId: nextAppointment.locationId,
        serviceId: nextAppointment.serviceId,
        sourceKind: "client_dashboard"
      })
    : ("/booking/new" as Route);

  async function handleSaveRoutine() {
    if (!canSaveRoutine) {
      setRoutineFeedback({
        tone: "error",
        message: "Choose a favorite barber first so your auto-book routine has a chair to follow."
      });
      return;
    }

    try {
      const result = await saveRoutineMutation.mutateAsync({
        cadenceId: selectedCadence.id,
        barberReference: favoriteBarber?.barber.id ?? payload?.client?.favoriteBarberReference,
        serviceReference:
          nextAppointment?.serviceId
          ?? latestCompletedAppointment?.serviceId
          ?? favoriteBarber?.mostBookedService?.service.id,
        anchorStartAt: nextAppointment?.start,
        lastCompletedAt: latestCompletedAppointment?.start
      });

      setRoutineFeedback({
        tone: "success",
        message: `${result.routine.label} auto-book is saved with ${favoriteBarberName}.`
      });
    } catch (error) {
      setRoutineFeedback({
        tone: "error",
        message: getReadableActionError(error as BookingApiError)
      });
    }
  }

  async function handleCreateAppointmentPayment() {
    if (!nextAppointment) {
      return;
    }

    setPaymentFeedback(null);
    if (!isOnline) {
      setPaymentFeedback({
        tone: "error",
        message: "You’re offline. Reconnect before securing booking payment so the ledger only posts once."
      });
      return;
    }

    try {
      const result = await paymentMutation.mutateAsync({
        appointmentId: nextAppointment.id,
        paymentMethodId: defaultPaymentMethod?.id
      });

      setPaymentFeedback({
        tone: "success",
        message:
          result.payment.paymentStatus === "authorized"
            ? "Your booking payment is now authorized against the default method on file."
            : "Your appointment payment is now captured and attached to the booking ledger."
      });
    } catch (error) {
      setPaymentFeedback({
        tone: "error",
        message: getReadableActionError(error as PaymentApiError)
      });
    }
  }

  function getReviewDraft(appointmentId: string) {
    return reviewDrafts[appointmentId] ?? { rating: 5, message: "" };
  }

  async function handleSubmitReview(appointmentId: string) {
    const draft = getReviewDraft(appointmentId);
    setReviewFeedback(null);

    try {
      await submitReviewMutation.mutateAsync({
        appointmentId,
        rating: draft.rating,
        message: draft.message
      });
      setReviewFeedback({
        tone: "success",
        message: "Review saved. Your feedback now strengthens this barber's marketplace profile."
      });
      setReviewDrafts((current) => ({
        ...current,
        [appointmentId]: { rating: 5, message: "" }
      }));
    } catch (error) {
      setReviewFeedback({
        tone: "error",
        message: getReadableActionError(error as BookingApiError)
      });
    }
  }

  async function handleConfirmCancellation() {
    if (!nextAppointment) {
      return;
    }

    setCancelFeedback(null);
    if (!isOnline) {
      setCancelFeedback({
        tone: "error",
        message: "Reconnect before cancelling so the appointment and payment state stay in sync."
      });
      return;
    }

    try {
      await cancelBookingMutation.mutateAsync({
        appointmentId: nextAppointment.id,
        expectedRevision: nextAppointment.revision
      });
      setCancelStep(null);
      setCancelFeedback({
        tone: "success",
        message: "Appointment cancelled. The booking now follows the current cancellation policy already enforced in the platform."
      });
    } catch (error) {
      setCancelFeedback({
        tone: "error",
        message: getReadableActionError(error as BookingApiError)
      });
    }
  }

  return (
    <div className="space-y-5" data-testid="client-bookings-screen">
      <header className="overflow-hidden rounded-[34px] border border-[#d8ff9d]/16 bg-[linear-gradient(180deg,rgba(18,22,14,0.96),rgba(8,8,8,0.98))] p-5 shadow-[0_24px_48px_rgba(0,0,0,0.22)] sm:p-6">
        <p className="text-[10px] uppercase tracking-[0.24em] text-[#cfff93]">Bookings</p>
        <h1 className="mt-3 text-balance text-3xl font-semibold text-white sm:text-4xl" data-display="true">
          Your next appointment.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/66">
          Keep your next visit, your barber, and your standing routine in one calm place.
        </p>
      </header>

      <ClientSectionBlock
        eyebrow="Next appointment"
        title="See the essentials first."
        subtitle="Date, time, barber, and where to go. Nothing extra."
      >
        {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
        {isInitialLoading ? (
          <SectionSkeleton />
        ) : nextAppointment ? (
          <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(8,8,8,0.99))] p-5 shadow-[0_16px_32px_rgba(0,0,0,0.16)] sm:p-6">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Your next appointment</p>
            <p className="mt-3 text-xl font-semibold text-white sm:text-2xl" data-display="true">
              {formatAppointmentSummary(nextAppointment.start)}
            </p>
            <div className="mt-4 space-y-2 text-sm leading-7 text-white/68">
              <p>{favoriteBarber?.barber.name ?? nextAppointment.view.barber?.name ?? "Your barber"}</p>
              <p>{getLocationLabel(favoriteLocation)}</p>
              {favoriteLocation?.address ? <p>{favoriteLocation.address}</p> : null}
            </div>
            {mapsHref ? (
              <div className="mt-5">
                <a href={mapsHref} rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-white/70 transition hover:text-[#d7ffab]">
                  <MapPin className="h-4 w-4 text-[#baff69]" />
                  Open in Maps
                </a>
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3">
              <ClientActionLink href={rescheduleHref} size="md">
                Reschedule
              </ClientActionLink>
              <button
                type="button"
                onClick={() => {
                  setCancelFeedback(null);
                  setCancelStep("offer_reschedule");
                }}
                className={getClientActionClassName({
                  size: "md",
                  variant: "outline"
                })}
              >
                Cancel appointment
              </button>
            </div>
            {cancelFeedback ? <div className="mt-4"><FeedbackBanner tone={cancelFeedback.tone} message={cancelFeedback.message} /></div> : null}
            {cancelStep === "offer_reschedule" ? (
              <div className="mt-5 rounded-[24px] border border-[#d7ffab]/18 bg-[#d7ffab]/8 p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Before you cancel</p>
                <p className="mt-3 text-lg font-semibold text-white">Would you like to reschedule instead?</p>
                <p className="mt-2 text-sm leading-7 text-white/62">
                  Jump back into booking with the same barber, service, and shop already prefilled so you can lock a new slot before giving this appointment up.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <ClientActionLink href={rescheduleHref} size="md">
                    Find a new slot
                  </ClientActionLink>
                  <button
                    type="button"
                    onClick={() => setCancelStep("confirm_cancel")}
                    className={getClientActionClassName({
                      size: "md",
                      variant: "outline"
                    })}
                  >
                    Continue cancellation
                  </button>
                </div>
              </div>
            ) : null}
            {cancelStep === "confirm_cancel" ? (
              <div className="mt-5 rounded-[24px] border border-rose-300/18 bg-rose-500/10 p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-rose-200">Confirm cancellation</p>
                <p className="mt-3 text-lg font-semibold text-white">Do not cancel silently.</p>
                <p className="mt-2 text-sm leading-7 text-white/62">
                  If you continue, the platform will cancel this booking and apply the current cancellation policy already enforced on the appointment record.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleConfirmCancellation()}
                    disabled={cancelBookingMutation.isPending}
                    className={getClientActionClassName({
                      size: "md",
                      variant: "outline",
                      className: "border-rose-300/30 text-rose-100 hover:border-rose-200/40"
                    })}
                  >
                    {cancelBookingMutation.isPending ? "Cancelling..." : "Confirm cancellation"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelStep(null)}
                    className={getClientActionClassName({
                      size: "md",
                      variant: "secondary"
                    })}
                  >
                    Keep appointment
                  </button>
                </div>
              </div>
            ) : null}
            <div className="mt-5 rounded-[24px] border border-white/10 bg-black/22 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Payment status</p>
                  <p className="mt-3 text-lg font-semibold text-white">
                    {latestBookingPayment
                      ? latestBookingPayment.paymentStatus.replaceAll("_", " ")
                      : "No booking payment on file yet"}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-white/60">
                    {latestBookingPayment
                      ? `${currency(latestBookingPayment.amount)} ${latestBookingPayment.paymentType} payment via ${latestBookingPayment.provider ?? "manual"}`
                      : defaultPaymentMethod
                        ? `Default method ready: ${defaultPaymentMethod.label}.`
                        : "Save a default payment method in Profile before attaching one to this appointment."}
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white/62">
                  Balance due {currency(nextAppointmentPayment?.outstandingBalance ?? nextAppointment.balanceDue)}
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-[18px] border border-white/10 bg-black/18 px-3 py-3 text-sm text-white/72">
                  Authorized {currency(nextAppointmentPayment?.authorizedAmount ?? 0)}
                </div>
                <div className="rounded-[18px] border border-white/10 bg-black/18 px-3 py-3 text-sm text-white/72">
                  Captured {currency(nextAppointmentPayment?.capturedAmount ?? 0)}
                </div>
                <div className="rounded-[18px] border border-white/10 bg-black/18 px-3 py-3 text-sm text-white/72">
                  Refunds {currency(nextAppointmentPayment?.refundedAmount ?? 0)}
                </div>
              </div>
              {paymentFeedback ? <div className="mt-4"><FeedbackBanner tone={paymentFeedback.tone} message={paymentFeedback.message} /></div> : null}
              {!latestBookingPayment && defaultPaymentMethod ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => void handleCreateAppointmentPayment()}
                    disabled={paymentMutation.isPending || !isOnline}
                    className={getClientActionClassName({
                      size: "md",
                      variant: "outline",
                      className: "disabled:cursor-not-allowed disabled:opacity-60"
                    })}
                  >
                    {paymentMutation.isPending ? "Securing..." : "Secure booking payment"}
                    <CreditCard className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
            {nextAppointment.receipt || nextAppointment.breakdown || nextAppointment.moneyTimeline ? (
              <div className="mt-5 grid gap-4 lg:grid-cols-[0.96fr_1.04fr]">
                <div className="rounded-[24px] border border-white/10 bg-black/22 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Receipt preview</p>
                      <p className="mt-3 text-lg font-semibold text-white">
                        {nextAppointment.receipt?.paymentMethodLabel ?? "Booking receipt ready"}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-white/10 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white/62">
                      Total {currency(nextAppointment.receipt?.totals.total ?? nextAppointment.breakdown?.total ?? nextAppointment.totalAmount)}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {nextAppointment.receipt?.lines.length ? nextAppointment.receipt.lines.map((line, index) => (
                      <div key={`${line.kind}-${index}`} className="flex items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">
                        <span>{line.label}</span>
                        <span>{currency(line.amount)}</span>
                      </div>
                    )) : (
                      <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/58">
                        Line items will appear here once the booking receipt is generated from the canonical payment and quote trail.
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="status-pill text-white/72">Discounts {currency(nextAppointment.receipt?.totals.discounts ?? nextAppointment.breakdown?.discounts ?? 0)}</span>
                    <span className="status-pill text-white/72">Tax {currency(nextAppointment.receipt?.totals.tax ?? nextAppointment.breakdown?.tax ?? 0)}</span>
                    <span className="status-pill text-white/72">Tip {currency(nextAppointment.receipt?.totals.tip ?? nextAppointment.breakdown?.tip ?? 0)}</span>
                    <span className="status-pill text-[#d7ffab]">Points used {nextAppointment.receipt?.pointsUsed ?? nextAppointment.breakdown?.pointsUsed ?? 0}</span>
                    <span className="status-pill text-[#d7ffab]">Points earned {nextAppointment.receipt?.pointsEarned ?? nextAppointment.breakdown?.pointsEarned ?? 0}</span>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-black/22 p-4">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Money timeline</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">Platform fee {currency(nextAppointment.breakdown?.platformFee ?? 0)}</div>
                    <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">Barber earnings {currency(nextAppointment.breakdown?.barberEarnings ?? 0)}</div>
                    <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">Shop earnings {currency(nextAppointment.breakdown?.shopEarnings ?? 0)}</div>
                    <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">Payout {nextAppointment.breakdown?.payoutStatus.replaceAll("_", " ") ?? "pending"}</div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {nextAppointment.moneyTimeline?.events.length ? nextAppointment.moneyTimeline.events.map((event) => (
                      <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">
                        <div>
                          <p className="font-medium text-white">{event.label}</p>
                          <p className="mt-1 text-xs text-white/48">{event.note ?? formatDateTimeLabel(event.occurredAt) ?? "Waiting on the next posted step."}</p>
                        </div>
                        <span className={`status-pill ${getTimelineStatusClass(event.status)}`}>
                          {event.status}
                        </span>
                      </div>
                    )) : (
                      <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/58">
                        Timeline milestones will appear here as payment, payout, refund, and points events post.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-white/12 bg-black/18 p-5 sm:p-6">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Nothing booked yet</p>
            <p className="mt-3 text-lg font-semibold text-white">
              You do not have a next appointment on the calendar.
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62">
              Your favorite barber is right below, and auto-book is ready when you want your routine to stay locked in.
            </p>
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="BVR Points"
        title="Keep the reward side of the visit clear."
        subtitle="Rewards never post early. When a completed paid service creates points, the breakdown and your current balance show up here."
      >
        <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(8,8,8,0.99))] p-5 shadow-[0_16px_32px_rgba(0,0,0,0.16)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Latest reward update</p>
              <p className="mt-3 text-xl font-semibold text-white" data-display="true">
                {latestRewardTotal > 0
                  ? `+${latestRewardTotal} pts from your latest completed visit`
                  : "Points post after the paid service closes"}
              </p>
              <p className="mt-3 text-sm leading-7 text-white/62">
                {latestRewardTransactions.length
                  ? `Your current rewards balance is ${pointsBalanceQuery.data?.unlockedPoints ?? 0} pts (${currency(pointsBalanceQuery.data?.inAppValue ?? 0)} in booking value).`
                  : "Booking, tip, and referral rewards only appear here after the appointment is completed, validated, and written to the ledger."}
              </p>
            </div>
            <span className="status-pill text-[#d7ffab]">
              {pointsBalanceQuery.data ? `${pointsBalanceQuery.data.unlockedPoints} pts ready` : "Rewards ready"}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {latestRewardTransactions.length ? latestRewardTransactions.map((transaction) => (
              <span key={transaction.id} className="status-pill text-[#d7ffab]">
                {getPointsEventLabel(transaction.eventType)} +{transaction.pointsDelta} {transaction.status}
              </span>
            )) : (
              <span className="status-pill text-white/72">
                Current value {currency(pointsBalanceQuery.data?.inAppValue ?? 0)}
              </span>
            )}
          </div>
        </div>
      </ClientSectionBlock>

      {favoriteBarber ? (
        <ClientFavoriteBarberCard
          barberId={favoriteBarber.barber.id}
          name={favoriteBarber.barber.name}
          rating={favoriteBarber.proof?.reviewScore ?? favoriteBarber.barber.rating}
          locationLabel={favoriteBarber.shopLocations.map((location) => `${location.name} | ${location.neighborhood}`).join(" | ") || "Your regular chair"}
          headline={favoriteBarber.profile.headline}
          specialties={favoriteBarber.profile.specialties}
          profileHref={profileHref}
          bookHref={bookingHref}
          username={favoriteBarber.profile.username}
        />
      ) : isInitialLoading ? (
        <div className="rounded-[32px] border border-white/8 bg-black/20 p-5 sm:p-6">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="mt-4 h-10 w-64" />
          <Skeleton className="mt-5 h-28 w-full rounded-[24px]" />
        </div>
      ) : (
        <div className="rounded-[32px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(19,19,19,0.96),rgba(8,8,8,0.98))] p-5 sm:p-6">
          <h3 className="text-2xl font-semibold text-white" data-display="true">Choose your go-to barber</h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/64">Save a favorite barber so Bookings becomes your personal routine screen instead of a marketplace browse.</p>
          <div className="mt-5">
            <ClientActionLink href="/search" size="lg">
              Find a barber
            </ClientActionLink>
          </div>
        </div>
      )}

      <ClientSectionBlock
        eyebrow="Auto-book"
        title={`Stay booked with ${favoriteBarberName}.`}
        subtitle="Choose a simple cadence and keep your cuts on schedule. This is the retention layer of the screen, so it stays easy and honest."
      >
        <div className="space-y-5">
          {routineFeedback ? <FeedbackBanner tone={routineFeedback.tone} message={routineFeedback.message} /> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            {cadenceOptions.map((option) => (
              <OptionButton
                key={option.id}
                label={option.label}
                detail={option.summary}
                isActive={selectedCadence.id === option.id}
                onClick={() => {
                  setSelectedCadenceId(option.id);
                  if (routineFeedback?.tone === "success") {
                    setRoutineFeedback(null);
                  }
                }}
              />
            ))}
          </div>

          <div className="rounded-[28px] border border-[#a8ff47]/16 bg-[linear-gradient(180deg,rgba(124,255,0,0.1),rgba(8,8,8,0.98))] p-5 shadow-[0_18px_36px_rgba(0,0,0,0.16)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Your standing routine</p>
                <h3 className="mt-3 text-2xl font-semibold text-white" data-display="true">
                  {selectedCadence.label} with {favoriteBarberName}
                </h3>
                <p className="mt-3 max-w-xl text-sm leading-7 text-white/66">
                  {savedRoutine?.cadenceId === selectedCadence.id && savedRoutineLabel
                    ? "Saved and tracking your next comeback window for " + savedRoutineLabel + "."
                    : "Your next recurring appointment would start " + formatRecurringPreview(recurringPreviewDate, recurringTimeLabel) + "."}
                </p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-black/20 px-4 py-3 text-white/78 shadow-[0_12px_24px_rgba(0,0,0,0.16)]">
                <div className="inline-flex items-center gap-2 text-sm">
                  <Repeat2 className="h-4 w-4 text-[#baff69]" />
                  Stay locked in
                </div>
                <p className="mt-2 text-sm leading-6 text-white/62">{selectedCadence.summary}</p>
              </div>
            </div>
            <div className="mt-5 rounded-[22px] border border-white/10 bg-black/22 p-4 text-sm leading-7 text-white/62">
              Book on Auto saves this cadence to your client routine so comeback timing stays visible across Bookings and Profile. You still confirm each actual appointment inside the current booking flow.
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleSaveRoutine()}
                disabled={!canSaveRoutine || saveRoutineMutation.isPending}
                className={getClientActionClassName({
                  size: "lg",
                  variant: "primary",
                  className: "disabled:cursor-not-allowed disabled:opacity-60"
                })}
              >
                {saveRoutineMutation.isPending ? "Saving..." : "Book on Auto"}
                <Clock3 className="h-4 w-4" />
              </button>
              <ClientActionLink href={profileHref} variant="outline" size="lg">
                Open profile
              </ClientActionLink>
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="History"
        title="Your completed visits and reviews."
        subtitle="Keep a clean record of what you booked, what you spent, and which visits still need feedback."
      >
        {reviewFeedback ? <FeedbackBanner tone={reviewFeedback.tone} message={reviewFeedback.message} /> : null}
        {isInitialLoading ? (
          <>
            <SectionSkeleton />
            <SectionSkeleton />
          </>
        ) : history.length ? (
          <div className="space-y-4">
            {history.map((appointment) => {
              const draft = getReviewDraft(appointment.id);
              const isSubmittingThisReview = submitReviewMutation.isPending && submitReviewMutation.variables?.appointmentId === appointment.id;

              return (
                <article
                  key={appointment.id}
                  className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(8,8,8,0.98))] p-5 shadow-[0_16px_32px_rgba(0,0,0,0.16)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Completed visit</p>
                      <h3 className="mt-3 text-xl font-semibold text-white">
                        {appointment.view?.service?.name ?? appointment.serviceSnapshot?.service_name ?? "Service completed"}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-white/64">
                        {formatAppointmentSummary(appointment.start)} with {appointment.view?.barber?.name ?? favoriteBarberName}
                      </p>
                      <p className="text-sm leading-7 text-white/54">
                        {appointment.view?.location?.name ?? getLocationLabel(favoriteLocation)} | Total {currency(appointment.grandTotal ?? appointment.totalAmount)}
                      </p>
                    </div>
                    <div className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-right text-sm text-white/72">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-white/46">Balance</p>
                      <p className="mt-2 font-semibold text-white">{currency(appointment.balanceDue)}</p>
                    </div>
                  </div>

                  {appointment.review ? (
                    <div className="mt-5 rounded-[22px] border border-[#d7ffab]/18 bg-[#d7ffab]/8 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#d7ffab]">
                          <Star className="h-4 w-4 fill-current" />
                          {appointment.review.rating.toFixed(1)} / 5
                        </div>
                        <span className="text-[11px] uppercase tracking-[0.18em] text-white/46">
                          {formatDateTimeLabel(appointment.review.createdAt) ?? "Recently"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-white/74">
                        {appointment.review.message || "Thanks for leaving a rating on this completed appointment."}
                      </p>
                    </div>
                  ) : appointment.canReview ? (
                    <div className="mt-5 rounded-[22px] border border-white/10 bg-black/22 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#d7ffab]">Leave a review</p>
                          <p className="mt-2 text-sm leading-7 text-white/62">
                            Rate this visit to strengthen discovery rankings and help future clients trust the chair.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[1, 2, 3, 4, 5].map((rating) => (
                            <button
                              key={rating}
                              type="button"
                              onClick={() => {
                                setReviewDrafts((current) => ({
                                  ...current,
                                  [appointment.id]: {
                                    ...getReviewDraft(appointment.id),
                                    rating
                                  }
                                }));
                              }}
                              className={[
                                "inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
                                draft.rating === rating
                                  ? "border-[#d7ffab]/30 bg-[#d7ffab]/12 text-[#d7ffab]"
                                  : "border-white/10 bg-black/20 text-white/62 hover:border-[#d7ffab]/18 hover:text-[#d7ffab]"
                              ].join(" ")}
                              aria-label={`Rate ${rating} star${rating === 1 ? "" : "s"}`}
                            >
                              <Star className={draft.rating >= rating ? "h-4 w-4 fill-current" : "h-4 w-4"} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="mt-4 block">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-white/44">Quick note</span>
                        <textarea
                          value={draft.message}
                          onChange={(event) => {
                            const message = event.target.value;
                            setReviewDrafts((current) => ({
                              ...current,
                              [appointment.id]: {
                                ...getReviewDraft(appointment.id),
                                message
                              }
                            }));
                          }}
                          rows={3}
                          maxLength={500}
                          placeholder="What stood out about this visit?"
                          className="mt-2 w-full rounded-[18px] border border-white/10 bg-black/24 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#b7ff58]/40"
                        />
                      </label>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => void handleSubmitReview(appointment.id)}
                          disabled={isSubmittingThisReview}
                          className={getClientActionClassName({
                            size: "md",
                            variant: "primary",
                            className: "disabled:cursor-not-allowed disabled:opacity-60"
                          })}
                        >
                          {isSubmittingThisReview ? "Saving..." : "Submit review"}
                          <Star className="h-4 w-4" />
                        </button>
                        <span className="inline-flex items-center text-sm text-white/46">
                          Rating {draft.rating} / 5
                        </span>
                      </div>
                    </div>
                  ) : null}
                  {appointment.receipt || appointment.breakdown || appointment.moneyTimeline ? (
                    <div className="mt-5 rounded-[22px] border border-white/10 bg-black/22 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.18em] text-[#d7ffab]">Receipt and money trail</p>
                          <p className="mt-2 text-sm leading-7 text-white/62">
                            {appointment.receipt?.paymentMethodLabel ?? "Canonical receipt generated from booking, payment, points, and payout truth."}
                          </p>
                        </div>
                        <span className="status-pill text-white/72">
                          {appointment.breakdown?.payoutStatus.replaceAll("_", " ") ?? "pending"}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">Gross {currency(appointment.breakdown?.gross ?? appointment.totalAmount)}</div>
                        <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">Discounts {currency(appointment.breakdown?.discounts ?? 0)}</div>
                        <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">Points used {appointment.breakdown?.pointsUsed ?? 0}</div>
                        <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">Points earned {appointment.breakdown?.pointsEarned ?? 0}</div>
                      </div>
                      {appointment.receipt?.lines.length ? (
                        <div className="mt-4 space-y-2">
                          {appointment.receipt.lines.map((line, index) => (
                            <div key={`${appointment.id}-${line.kind}-${index}`} className="flex items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">
                              <span>{line.label}</span>
                              <span>{currency(line.amount)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {appointment.moneyTimeline?.events.slice(0, 4).map((event) => (
                          <span key={event.id} className={`status-pill ${getTimelineStatusClass(event.status)}`}>
                            {event.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-white/12 bg-black/18 p-5 sm:p-6">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">No completed visits yet</p>
            <p className="mt-3 text-lg font-semibold text-white">
              Your review history will show up after completed appointments.
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62">
              Once a visit is completed, you will be able to rate the service here and reinforce the barber&apos;s marketplace profile.
            </p>
          </div>
        )}
      </ClientSectionBlock>
    </div>
  );
}

