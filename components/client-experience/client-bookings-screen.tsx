"use client";

import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, MessageSquareText, Star } from "lucide-react";
import { ClientActionLink, getClientActionClassName } from "@/components/client-experience/client-action-link";
import { ClientGetCutNowAction } from "@/components/client-experience/client-get-cut-now-action";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { CLIENT_PRIMARY_TAB_HREFS } from "@/components/client-experience/client-tab-config";
import { usePwa } from "@/components/pwa/pwa-provider";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useClientBookingsQuery,
  useClientHomeQuery,
  useCancelBookingMutation,
  useSubmitClientReviewMutation,
  type BookingApiError,
  type ClientBookingsResponse
} from "@/lib/booking/client";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import { useCreateAppointmentPaymentMutation, type PaymentApiError } from "@/lib/payments/client";
import { cn, currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type { Location } from "@/types/domain";

function formatAppointmentDate(iso?: string | null) {
  if (!iso) {
    return "Not scheduled";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatAppointmentTime(iso?: string | null) {
  if (!iso) {
    return "Not scheduled";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatDateTimeLabel(iso?: string | null) {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${formatAppointmentDate(iso)} at ${formatAppointmentTime(iso)}`;
}

function formatStatusLabel(status?: string | null) {
  if (!status) {
    return "Pending";
  }

  return status.replaceAll("_", " ");
}

function getLocationLabel(location?: Location | { name?: string | null; neighborhood?: string | null; city?: string | null; state?: string | null; address?: string | null; }) {
  if (!location) {
    return "Location pending";
  }

  if (location.address) {
    return location.address;
  }

  return [location.name, location.neighborhood, location.city, location.state].filter(Boolean).join(", ") || "Location pending";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((index) => (
        <div key={index} className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-4 h-5 w-52" />
          <Skeleton className="mt-4 h-24 w-full rounded-[22px]" />
        </div>
      ))}
    </div>
  );
}

function AppointmentAvatar({
  name,
  imageUrl
}: {
  name: string;
  imageUrl?: string | null;
}) {
  return (
    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(124,255,0,0.18),rgba(12,12,12,0.96))] text-xl font-semibold text-[#d7ffab] shadow-[0_18px_34px_rgba(0,0,0,0.22)]">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}

type ActivityAppointment =
  | ClientBookingsResponse["history"][number]
  | NonNullable<ClientBookingsResponse["nextAppointment"]>;

export function ClientBookingsScreen() {
  const searchParams = useSearchParams();
  const { isOnline } = usePwa();
  const homeQuery = useClientHomeQuery();
  const bookingsQuery = useClientBookingsQuery();
  const cancelBookingMutation = useCancelBookingMutation();
  const submitReviewMutation = useSubmitClientReviewMutation();
  const paymentMutation = useCreateAppointmentPaymentMutation();
  const payload = bookingsQuery.data;
  const favoriteBarber = payload?.favoriteBarber ?? null;
  const nextAppointment = payload?.nextAppointment ?? null;
  const upcomingAppointments = useMemo(
    () => payload?.upcoming ?? (nextAppointment ? [nextAppointment] : []),
    [nextAppointment, payload?.upcoming]
  );
  const history = payload?.history ?? [];
  const nextAppointmentPayment = payload?.nextAppointmentPayment ?? null;
  const latestBookingPayment = nextAppointmentPayment?.latestBookingPayment ?? null;
  const defaultPaymentMethod = nextAppointmentPayment?.defaultPaymentMethod ?? null;
  const errorMessage = bookingsQuery.error ? getReadableActionError(bookingsQuery.error as BookingApiError) : null;
  const homePayload = homeQuery.data;
  const hasResolvedLocation = homePayload?.hasResolvedLocation ?? false;
  const barberSearchHref = `${CLIENT_PRIMARY_TAB_HREFS.search}?type=barbers` as Route;
  const getCutNowDefaultPaymentMethod = homePayload?.defaultPaymentMethod ?? defaultPaymentMethod ?? null;

  const [paymentFeedback, setPaymentFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { rating: number; message: string }>>({});
  const [expandedReceipts, setExpandedReceipts] = useState<Record<string, boolean>>({});
  const [expandedReviews, setExpandedReviews] = useState<Record<string, boolean>>({});
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("intent") === "cancel" && upcomingAppointments[0]) {
      setCancelTargetId(upcomingAppointments[0].id);
    }
  }, [searchParams, upcomingAppointments]);

  const isInitialLoading = bookingsQuery.isLoading && !payload;
  const photoByBarberId = useMemo(() => {
    const entries = new Map<string, string | undefined>();
    if (favoriteBarber?.barber.id) {
      entries.set(favoriteBarber.barber.id, favoriteBarber.profile.profilePhotoUrl);
    }
    return entries;
  }, [favoriteBarber]);

  function getReviewDraft(appointmentId: string) {
    return reviewDrafts[appointmentId] ?? { rating: 5, message: "" };
  }

  function getBookAgainHref(appointment: ActivityAppointment) {
    return buildMarketplaceBookingHref({
      barberId: appointment.barberId,
      username: favoriteBarber?.barber.id === appointment.barberId ? favoriteBarber?.profile.username : undefined,
      locationId: appointment.locationId,
      serviceId: appointment.serviceId,
      sourceKind: "client_dashboard"
    });
  }

  async function handleCreateAppointmentPayment(appointmentId: string) {
    setPaymentFeedback(null);

    if (!isOnline) {
      setPaymentFeedback({
        tone: "error",
        message: "Reconnect before securing payment so the booking ledger stays accurate."
      });
      return;
    }

    try {
      const result = await paymentMutation.mutateAsync({
        appointmentId,
        paymentMethodId: defaultPaymentMethod?.id
      });

      setPaymentFeedback({
        tone: "success",
        message: result.payment.paymentStatus === "authorized"
          ? "Payment is authorized against your default method."
          : "Payment is captured and attached to the appointment."
      });
    } catch (error) {
      setPaymentFeedback({
        tone: "error",
        message: getReadableActionError(error as PaymentApiError)
      });
    }
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
      setExpandedReviews((current) => ({ ...current, [appointmentId]: false }));
      setReviewDrafts((current) => ({
        ...current,
        [appointmentId]: { rating: 5, message: "" }
      }));
      setReviewFeedback({
        tone: "success",
        message: "Review saved. Your feedback now lives on the barber profile."
      });
    } catch (error) {
      setReviewFeedback({
        tone: "error",
        message: getReadableActionError(error as BookingApiError)
      });
    }
  }

  async function handleConfirmCancellation(appointmentId: string, revision: number) {
    setCancelFeedback(null);

    if (!isOnline) {
      setCancelFeedback({
        tone: "error",
        message: "Reconnect before cancelling so the appointment state stays in sync."
      });
      return;
    }

    try {
      await cancelBookingMutation.mutateAsync({
        appointmentId,
        expectedRevision: revision
      });
      setCancelTargetId(null);
      setCancelFeedback({
        tone: "success",
        message: "Appointment cancelled. The current platform cancellation policy has been applied."
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
        <p className="text-[10px] uppercase tracking-[0.24em] text-[#cfff93]">Activity</p>
        <h1 className="mt-3 text-balance text-3xl font-semibold text-white sm:text-4xl" data-display="true">
          Activity
        </h1>
        <p className="mt-3 text-sm leading-7 text-white/66">
          Your appointments, receipts, and history.
        </p>
      </header>

      <ClientSectionBlock
        eyebrow="Upcoming"
        title="Upcoming Appointments"
        subtitle="Booked future appointments and the next actions that matter."
      >
        {errorMessage ? <FeedbackBanner tone="error" message={errorMessage} /> : null}
        {cancelFeedback ? <FeedbackBanner tone={cancelFeedback.tone} message={cancelFeedback.message} /> : null}
        {paymentFeedback ? <FeedbackBanner tone={paymentFeedback.tone} message={paymentFeedback.message} /> : null}

        {isInitialLoading ? (
          <SectionSkeleton />
        ) : upcomingAppointments.length ? (
          <div className="space-y-4">
            {upcomingAppointments.map((appointment) => {
              const barberName = appointment.view?.barber?.name ?? "Your barber";
              const location = appointment.view?.location;
              const isPaymentSummaryCard = appointment.id === nextAppointment?.id;
              const outstandingBalance = isPaymentSummaryCard
                ? nextAppointmentPayment?.outstandingBalance ?? appointment.balanceDue
                : appointment.balanceDue;

              return (
                <article
                  key={appointment.id}
                  className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(8,8,8,0.99))] p-5 shadow-[0_16px_32px_rgba(0,0,0,0.16)]"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                    <AppointmentAvatar
                      name={barberName}
                      imageUrl={photoByBarberId.get(appointment.barberId)}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-2xl font-semibold text-white" data-display="true">{barberName}</p>
                          <p className="mt-2 text-lg text-white/76">
                            {appointment.view?.service?.name ?? appointment.serviceSnapshot?.service_name ?? "Service pending"}
                          </p>
                          <p className="mt-2 text-sm text-[#d7ffab]">
                            {location?.name ?? "Location pending"}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-white/58">{getLocationLabel(location)}</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#d7ffab]">
                          {formatStatusLabel(appointment.status)}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                          <p className="surface-label">Date</p>
                          <p className="mt-3 text-lg font-semibold text-white">{formatAppointmentDate(appointment.start)}</p>
                        </div>
                        <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                          <p className="surface-label">Time</p>
                          <p className="mt-3 text-lg font-semibold text-white">{formatAppointmentTime(appointment.start)}</p>
                        </div>
                        <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                          <p className="surface-label">Price</p>
                          <p className="mt-3 text-lg font-semibold text-white">{currency(appointment.grandTotal ?? appointment.totalAmount)}</p>
                          <p className="mt-1 text-sm text-white/54">
                            {isPaymentSummaryCard && latestBookingPayment
                              ? formatStatusLabel(latestBookingPayment.paymentStatus)
                              : outstandingBalance > 0
                                ? `${currency(outstandingBalance)} due`
                                : "Paid"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-3">
                        <ClientActionLink href={getBookAgainHref(appointment)} size="md" variant="secondary">
                          Reschedule
                        </ClientActionLink>
                        <button
                          type="button"
                          onClick={() => setCancelTargetId(appointment.id)}
                          className={getClientActionClassName({ size: "md", variant: "outline" })}
                        >
                          Cancel
                        </button>
                        <ClientActionLink href={CLIENT_PRIMARY_TAB_HREFS.messages} size="md" variant="outline">
                          <MessageSquareText className="h-4 w-4" />
                          Message Barber
                        </ClientActionLink>
                        {isPaymentSummaryCard && !latestBookingPayment && defaultPaymentMethod ? (
                          <button
                            type="button"
                            onClick={() => void handleCreateAppointmentPayment(appointment.id)}
                            disabled={paymentMutation.isPending}
                            className={getClientActionClassName({
                              size: "md",
                              variant: "outline",
                              className: "disabled:cursor-not-allowed disabled:opacity-60"
                            })}
                          >
                            <CreditCard className="h-4 w-4" />
                            {paymentMutation.isPending ? "Securing..." : "Secure Payment"}
                          </button>
                        ) : null}
                      </div>

                      {cancelTargetId === appointment.id ? (
                        <div className="mt-5 rounded-[24px] border border-rose-300/18 bg-rose-500/10 p-4">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-rose-200">Confirm cancellation</p>
                          <p className="mt-3 text-lg font-semibold text-white">Cancel this appointment?</p>
                          <p className="mt-2 text-sm leading-7 text-white/62">
                            This uses the existing platform cancellation rules and updates the real booking record.
                          </p>
                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => void handleConfirmCancellation(appointment.id, appointment.revision)}
                              disabled={cancelBookingMutation.isPending}
                              className={getClientActionClassName({
                                size: "md",
                                variant: "outline",
                                className: "border-rose-300/30 text-rose-100 hover:border-rose-200/40 disabled:cursor-not-allowed disabled:opacity-60"
                              })}
                            >
                              {cancelBookingMutation.isPending ? "Cancelling..." : "Confirm Cancel"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setCancelTargetId(null)}
                              className={getClientActionClassName({ size: "md", variant: "secondary" })}
                            >
                              Keep Appointment
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-white/12 bg-black/18 p-5 sm:p-6">
            <p className="text-lg font-semibold text-white">No upcoming appointments</p>
            <p className="mt-3 text-sm leading-7 text-white/62">Book your next cut.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <ClientActionLink href={barberSearchHref} size="lg">
                Find a Barber
              </ClientActionLink>
              <ClientGetCutNowAction
                hasResolvedLocation={hasResolvedLocation}
                nextAvailableChair={homePayload?.nextAvailableChair ?? null}
                defaultPaymentMethod={getCutNowDefaultPaymentMethod}
                size="lg"
                variant="secondary"
              />
            </div>
          </div>
        )}
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Past visits"
        title="Past Appointments / Receipts"
        subtitle="Completed visits, payment truth, and review status stay here."
      >
        {reviewFeedback ? <FeedbackBanner tone={reviewFeedback.tone} message={reviewFeedback.message} /> : null}

        {isInitialLoading ? (
          <SectionSkeleton />
        ) : history.length ? (
          <div className="space-y-4">
            {history.map((appointment) => {
              const barberName = appointment.view?.barber?.name ?? favoriteBarber?.barber.name ?? "Your barber";
              const location = appointment.view?.location;
              const hasReceiptDetail = Boolean(appointment.receipt || appointment.breakdown || appointment.moneyTimeline);
              const isReceiptOpen = expandedReceipts[appointment.id] ?? false;
              const isReviewOpen = expandedReviews[appointment.id] ?? false;
              const reviewDraft = getReviewDraft(appointment.id);
              const paymentStatus = appointment.moneyTimeline?.paymentStatus
                ?? (appointment.balanceDue > 0 ? "pending" : "paid");
              const reviewStatusLabel = appointment.review ? "Reviewed" : appointment.canReview ? "Review ready" : "Review unavailable";

              return (
                <article
                  key={appointment.id}
                  className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.96),rgba(8,8,8,0.98))] p-5 shadow-[0_16px_32px_rgba(0,0,0,0.16)]"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                    <AppointmentAvatar
                      name={barberName}
                      imageUrl={photoByBarberId.get(appointment.barberId)}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-2xl font-semibold text-white" data-display="true">{barberName}</p>
                          <p className="mt-2 text-lg text-white/76">
                            {appointment.view?.service?.name ?? appointment.serviceSnapshot?.service_name ?? "Completed service"}
                          </p>
                          <p className="mt-2 text-sm text-[#d7ffab]">
                            {location?.name ?? "Location pending"}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-white/58">{getLocationLabel(location)}</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#d7ffab]">
                          {formatStatusLabel(appointment.status)}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                          <p className="surface-label">Date</p>
                          <p className="mt-3 text-lg font-semibold text-white">{formatAppointmentDate(appointment.start)}</p>
                        </div>
                        <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                          <p className="surface-label">Time</p>
                          <p className="mt-3 text-lg font-semibold text-white">{formatAppointmentTime(appointment.start)}</p>
                        </div>
                        <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                          <p className="surface-label">Total paid</p>
                          <p className="mt-3 text-lg font-semibold text-white">{currency(appointment.receipt?.totals.total ?? appointment.breakdown?.total ?? appointment.grandTotal ?? appointment.totalAmount)}</p>
                          <p className="mt-1 text-sm text-white/54">{formatStatusLabel(paymentStatus)}</p>
                        </div>
                        <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                          <p className="surface-label">Review</p>
                          <p className="mt-3 text-lg font-semibold text-white">{reviewStatusLabel}</p>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-3">
                        {hasReceiptDetail ? (
                          <button
                            type="button"
                            onClick={() => setExpandedReceipts((current) => ({ ...current, [appointment.id]: !isReceiptOpen }))}
                            className={getClientActionClassName({ size: "md", variant: "secondary" })}
                          >
                            View Receipt
                          </button>
                        ) : null}
                        <ClientActionLink href={getBookAgainHref(appointment)} size="md">
                          Book Again
                        </ClientActionLink>
                        {appointment.review ? (
                          <button
                            type="button"
                            onClick={() => setExpandedReviews((current) => ({ ...current, [appointment.id]: !isReviewOpen }))}
                            className={getClientActionClassName({ size: "md", variant: "outline" })}
                          >
                            View Review
                          </button>
                        ) : appointment.canReview ? (
                          <button
                            type="button"
                            onClick={() => setExpandedReviews((current) => ({ ...current, [appointment.id]: !isReviewOpen }))}
                            className={getClientActionClassName({ size: "md", variant: "outline" })}
                          >
                            Leave Review
                          </button>
                        ) : null}
                      </div>

                      {hasReceiptDetail && isReceiptOpen ? (
                        <div className="mt-5 rounded-[24px] border border-white/10 bg-black/22 p-4">
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">
                              Service {currency(appointment.receipt?.totals.gross ?? appointment.breakdown?.gross ?? appointment.totalAmount)}
                            </div>
                            <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">
                              Tip {currency(appointment.receipt?.totals.tip ?? appointment.breakdown?.tip ?? 0)}
                            </div>
                            <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">
                              Tax {currency(appointment.receipt?.totals.tax ?? appointment.breakdown?.tax ?? 0)}
                            </div>
                            <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">
                              Platform fee {currency(appointment.breakdown?.platformFee ?? 0)}
                            </div>
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">
                              Payment method: {appointment.receipt?.paymentMethodLabel ?? "Not available"}
                            </div>
                            <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">
                              Appointment ID: {appointment.id}
                            </div>
                          </div>
                          <div className="mt-4 space-y-2">
                            {appointment.receipt?.lines.length ? appointment.receipt.lines.map((line, index) => (
                              <div key={`${appointment.id}-${line.kind}-${index}`} className="flex items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/72">
                                <span>{line.label}</span>
                                <span>{currency(line.amount)}</span>
                              </div>
                            )) : (
                              <div className="rounded-[18px] border border-white/8 bg-black/18 px-3 py-3 text-sm text-white/58">
                                Receipt details will appear here as soon as the canonical payment record finishes posting.
                              </div>
                            )}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/72">
                            <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2">
                              Total paid {currency(appointment.receipt?.totals.total ?? appointment.breakdown?.total ?? appointment.totalAmount)}
                            </span>
                            <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2">
                              {appointment.moneyTimeline?.paymentStatus ? `Payment ${formatStatusLabel(appointment.moneyTimeline.paymentStatus)}` : "Payment settled"}
                            </span>
                            <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2">
                              {appointment.breakdown?.payoutStatus ? `Payout ${formatStatusLabel(appointment.breakdown.payoutStatus)}` : "Refund status not available"}
                            </span>
                          </div>
                        </div>
                      ) : null}

                      {appointment.review && isReviewOpen ? (
                        <div className="mt-5 rounded-[24px] border border-[#d7ffab]/18 bg-[#d7ffab]/8 p-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-[#d7ffab]">
                            <Star className="h-4 w-4 fill-current" />
                            {appointment.review.rating.toFixed(1)} / 5
                          </div>
                          <p className="mt-3 text-sm leading-7 text-white/74">
                            {appointment.review.message || "This visit was reviewed."}
                          </p>
                          <p className="mt-3 text-xs uppercase tracking-[0.16em] text-white/42">
                            {formatDateTimeLabel(appointment.review.createdAt) ?? "Recently"}
                          </p>
                        </div>
                      ) : null}

                      {!appointment.review && appointment.canReview && isReviewOpen ? (
                        <div className="mt-5 rounded-[24px] border border-white/10 bg-black/22 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.18em] text-[#d7ffab]">Leave a review</p>
                              <p className="mt-2 text-sm leading-7 text-white/62">
                                Share how the visit went and help the next client trust the chair.
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
                                  className={cn(
                                    "inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
                                    reviewDraft.rating === rating
                                      ? "border-[#d7ffab]/30 bg-[#d7ffab]/12 text-[#d7ffab]"
                                      : "border-white/10 bg-black/20 text-white/62 hover:border-[#d7ffab]/18 hover:text-[#d7ffab]"
                                  )}
                                  aria-label={`Rate ${rating} stars`}
                                >
                                  <Star className={reviewDraft.rating >= rating ? "h-4 w-4 fill-current" : "h-4 w-4"} />
                                </button>
                              ))}
                            </div>
                          </div>

                          <label className="mt-4 block">
                            <span className="text-[10px] uppercase tracking-[0.18em] text-white/44">Quick note</span>
                            <textarea
                              value={reviewDraft.message}
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
                              disabled={submitReviewMutation.isPending}
                              className={getClientActionClassName({
                                size: "md",
                                variant: "primary",
                                className: "disabled:cursor-not-allowed disabled:opacity-60"
                              })}
                            >
                              {submitReviewMutation.isPending ? "Saving..." : "Submit Review"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setExpandedReviews((current) => ({ ...current, [appointment.id]: false }))}
                              className={getClientActionClassName({ size: "md", variant: "outline" })}
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-white/12 bg-black/18 p-5 sm:p-6">
            <p className="text-lg font-semibold text-white">No past visits yet.</p>
          </div>
        )}
      </ClientSectionBlock>
    </div>
  );
}
