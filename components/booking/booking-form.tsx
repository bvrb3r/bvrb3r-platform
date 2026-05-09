"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { usePwa } from "@/components/pwa/pwa-provider";
import { useBookingStore } from "@/lib/data/booking-store";
import {
  useClientPointsBalanceQuery,
  useClientMembershipQuery,
  useBarberAvailabilityQuery,
  useBarberProfileQuery,
  useBarberSearchQuery,
  useCreateBookingMutation,
  type BookingApiError
} from "@/lib/booking/client";
import { applyMembershipPricingAdjustmentToQuote, buildMembershipPricingAdjustment } from "@/lib/monetization/membership";
import {
  usePaymentMethodsQuery
} from "@/lib/payments/client";
import { applyPointsPreviewToQuote, pointsToInAppValue, previewPointsRedemption } from "@/lib/points/redemption";
import { useMarketplaceAnalyticsMutation, useMarketplaceWaitlistMutation } from "@/lib/marketplace/client";
import { useApplyPromotionMutation, useClientPromotionsQuery } from "@/lib/promotions/client";
import type { PromotionPreviewView } from "@/lib/promotions/service";
import { calculateBookingQuote, resolveBookableAddOn, resolveBookableBarber, resolveBookableService, resolveBookableSlot } from "@/lib/utils/booking";
import { getReadableActionError } from "@/lib/utils/feedback";
import { currency, dateLabel } from "@/lib/utils";
import type { AiRecommendationType } from "@/types/ai";
import type { HaircutNowMatch, MarketplaceSourceKind, Service } from "@/types/domain";

const BOOKING_DRAFT_STORAGE_KEY = "bvrb3r-booking-draft:v1";

const bookingSchema = z.object({
  locationId: z.string().min(1),
  barberId: z.string().min(1),
  serviceId: z.string().min(1),
  addOnId: z.string().optional(),
  appointmentTime: z.string().min(1),
  clientName: z.string().min(2),
  clientPhone: z.string().min(10),
  acknowledgePolicy: z.boolean().refine((value) => value, "Please accept the cancellation policy.")
});

type BookingValues = z.infer<typeof bookingSchema>;
type BookingDraft = Pick<
  BookingValues,
  "locationId" | "barberId" | "serviceId" | "addOnId" | "appointmentTime" | "clientName" | "clientPhone"
>;

function QuoteRowSkeleton() {
  return (
    <div className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  );
}

function toMarketplaceSource(value: string | null): MarketplaceSourceKind | undefined {
  if (value === "direct" || value === "discovery" || value === "public_profile" || value === "haircut_now" || value === "client_dashboard") {
    return value;
  }

  return undefined;
}

function toMatchedFrom(value: string | null): HaircutNowMatch["matchedFrom"] | undefined {
  if (value === "favorite_barber" || value === "favorite_shop" || value === "nearby" || value === "available_now") {
    return value;
  }

  return undefined;
}

function toAiRecommendationType(value: string | null): AiRecommendationType | undefined {
  if (value === "rebooking_reminder" || value === "available_now" || value === "barber_gap_alert") {
    return value;
  }

  return undefined;
}

function getSourceLabel(sourceKind?: MarketplaceSourceKind) {
  switch (sourceKind) {
    case "public_profile":
      return "Barber profile booking";
    case "discovery":
      return "Discovery booking";
    case "haircut_now":
      return "Instant match booking";
    case "client_dashboard":
      return "From Home";
    default:
      return "Direct booking";
  }
}

function splitServices(services: Service[]) {
  return {
    primary: services.filter((service) => service.category !== "Add-ons" && service.category !== "Treatments"),
    addOns: services.filter((service) => service.category === "Add-ons" || service.category === "Treatments")
  };
}

function getPointsBlockedReasonCopy(input: {
  hasService: boolean;
  orderTotal: number;
  unlockedPoints: number;
  maxRedeemablePoints: number;
  blockedReason?: string;
}) {
  if (!input.hasService || input.orderTotal <= 0) {
    return "Choose the service first so we can show how many BVR Points this booking can use.";
  }

  if (input.unlockedPoints <= 0) {
    return "You do not have unlocked BVR Points ready for this booking yet.";
  }

  if (!input.maxRedeemablePoints) {
    return "This booking is already at the live redemption cap.";
  }

  if (input.blockedReason) {
    return `This booking can use up to ${input.maxRedeemablePoints} pts (${currency(pointsToInAppValue(input.maxRedeemablePoints))}).`;
  }

  return null;
}

function buildQuickRedeemOptions(maxRedeemablePoints: number) {
  const options = [
    { label: "$5", points: 50 },
    { label: "$10", points: 100 },
    { label: "Max", points: maxRedeemablePoints }
  ];

  return options
    .filter((option) => option.points > 0)
    .map((option) => ({
      ...option,
      points: Math.min(option.points, maxRedeemablePoints)
    }))
    .filter((option, index, array) => array.findIndex((entry) => entry.points === option.points) === index);
}

function readBookingDraft(): Partial<BookingDraft> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(BOOKING_DRAFT_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const value = JSON.parse(rawValue) as Partial<BookingDraft>;
    return typeof value === "object" && value !== null ? value : null;
  } catch {
    return null;
  }
}

function writeBookingDraft(draft: BookingDraft) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

function clearBookingDraft() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
}

export function BookingForm() {
  const searchParams = useSearchParams();
  const { isOnline } = usePwa();
  const { selectedLocationId, selectedBarberId, setLocation, setBarber } = useBookingStore();
  const bookingMutation = useCreateBookingMutation();
  const paymentMethodsQuery = usePaymentMethodsQuery();
  const analyticsMutation = useMarketplaceAnalyticsMutation();
  const waitlistMutation = useMarketplaceWaitlistMutation();
  const membershipQuery = useClientMembershipQuery();
  const pointsBalanceQuery = useClientPointsBalanceQuery();
  const ctaTrackedRef = useRef<string | null>(null);
  const [confirmationId, setConfirmationId] = useState("");
  const [confirmationPaymentStatus, setConfirmationPaymentStatus] = useState<string | null>(null);
  const [confirmationPaymentLabel, setConfirmationPaymentLabel] = useState<string | null>(null);
  const [statusUpdate, setStatusUpdate] = useState<{ tone: "success" | "info" | "error"; message: string } | null>(null);
  const [promotionCode, setPromotionCode] = useState("");
  const [promotionFeedback, setPromotionFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [appliedPromotion, setAppliedPromotion] = useState<PromotionPreviewView | null>(null);
  const [requestedPointsToRedeem, setRequestedPointsToRedeem] = useState(0);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");

  const sourceKind = toMarketplaceSource(searchParams.get("source"));
  const matchedFrom = toMatchedFrom(searchParams.get("matchedFrom"));
  const aiRecommendationId = searchParams.get("aiRecommendationId") ?? undefined;
  const aiRecommendationType = toAiRecommendationType(searchParams.get("aiRecommendationType"));
  const query = searchParams.get("query") ?? undefined;
  const preselectedLocationId = searchParams.get("locationId") ?? selectedLocationId;
  const preselectedBarberId = searchParams.get("barberId") ?? selectedBarberId;
  const preselectedServiceId = searchParams.get("serviceId") ?? "";
  const preselectedAppointmentTime = searchParams.get("appointmentTime") ?? "";
  const preselectedUsername = searchParams.get("barber") ?? undefined;

  const searchQuery = useBarberSearchQuery({});
  const shops = useMemo(() => searchQuery.data?.shops ?? [], [searchQuery.data?.shops]);
  const barbers = useMemo(() => searchQuery.data?.barbers ?? [], [searchQuery.data?.barbers]);

  const form = useForm<BookingValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      locationId: preselectedLocationId,
      barberId: preselectedBarberId,
      serviceId: preselectedServiceId,
      addOnId: "",
      appointmentTime: preselectedAppointmentTime,
      clientName: "",
      clientPhone: "",
      acknowledgePolicy: true
    }
  });

  const watchLocationId = form.watch("locationId");
  const watchBarberId = form.watch("barberId");
  const watchServiceId = form.watch("serviceId");
  const watchAddOnId = form.watch("addOnId");
  const watchAppointmentTime = form.watch("appointmentTime");
  const watchClientName = form.watch("clientName");
  const watchClientPhone = form.watch("clientPhone");

  useEffect(() => {
    const draft = readBookingDraft();
    if (!draft) {
      return;
    }

    const nextLocationId = preselectedLocationId || draft.locationId || "";
    const nextBarberId = preselectedBarberId || draft.barberId || "";
    const nextServiceId = preselectedServiceId || draft.serviceId || "";
    const nextAppointmentTime = preselectedAppointmentTime || draft.appointmentTime || "";

    form.reset({
      locationId: nextLocationId,
      barberId: nextBarberId,
      serviceId: nextServiceId,
      addOnId: draft.addOnId || "",
      appointmentTime: nextAppointmentTime,
      clientName: draft.clientName || form.getValues("clientName"),
      clientPhone: draft.clientPhone || form.getValues("clientPhone"),
      acknowledgePolicy: true
    });

    if (nextLocationId) {
      setLocation(nextLocationId);
    }

    if (nextBarberId) {
      setBarber(nextBarberId);
    }
  }, [form, preselectedAppointmentTime, preselectedBarberId, preselectedLocationId, preselectedServiceId, setBarber, setLocation]);

  useEffect(() => {
    const nextLocationId = preselectedLocationId || shops[0]?.id;
    if (nextLocationId && form.getValues("locationId") !== nextLocationId) {
      form.setValue("locationId", nextLocationId);
      setLocation(nextLocationId);
    }
  }, [form, preselectedLocationId, setLocation, shops]);

  useEffect(() => {
    const nextBarber = resolveBookableBarber(barbers, preselectedBarberId || form.getValues("barberId"));
    const nextBarberId = nextBarber?.barberId ?? "";
    if (form.getValues("barberId") !== nextBarberId) {
      form.setValue("barberId", nextBarberId);
      if (nextBarberId) {
        setBarber(nextBarberId);
      }
    }
  }, [barbers, form, preselectedBarberId, setBarber, watchBarberId]);

  const currentBarberResult = useMemo(
    () => resolveBookableBarber(barbers, watchBarberId) ?? undefined,
    [barbers, watchBarberId]
  );
  const barberProfileQuery = useBarberProfileQuery(currentBarberResult?.barberId);
  const serviceCatalog = barberProfileQuery.data?.services.map((entry) => entry.service) ?? [];
  const { primary: primaryServices, addOns } = splitServices(serviceCatalog);

  useEffect(() => {
    const nextService = resolveBookableService(primaryServices, preselectedServiceId || form.getValues("serviceId"));
    const nextServiceId = nextService?.id ?? "";
    if (form.getValues("serviceId") !== nextServiceId) {
      form.setValue("serviceId", nextServiceId);
    }
  }, [form, preselectedServiceId, primaryServices, watchServiceId]);

  useEffect(() => {
    const nextAddOn = resolveBookableAddOn(addOns, form.getValues("addOnId"));
    const nextAddOnId = nextAddOn?.id ?? "";
    if ((form.getValues("addOnId") ?? "") !== nextAddOnId) {
      form.setValue("addOnId", nextAddOnId);
    }
  }, [addOns, form, watchAddOnId]);

  const resolvedLocationId = watchLocationId || shops[0]?.id || "";
  const resolvedBarberId = currentBarberResult?.barberId ?? "";
  const currentService = resolveBookableService(primaryServices, watchServiceId) ?? undefined;
  const resolvedServiceId = currentService?.id ?? "";
  const currentAddOn = resolveBookableAddOn(addOns, watchAddOnId) ?? undefined;
  const bookingAddOnIds = currentAddOn ? [currentAddOn.id] : [];
  const baseQuote = currentService ? calculateBookingQuote(currentService, currentAddOn ? [currentAddOn] : []) : {
    subtotal: 0,
    depositDue: 0,
    totalDuration: 0
  };
  const promotionsQuery = useClientPromotionsQuery({
    shopId: resolvedLocationId || undefined,
    serviceId: resolvedServiceId || undefined,
    addOnIds: bookingAddOnIds,
    barberId: resolvedBarberId || undefined
  });
  const applyPromotionMutation = useApplyPromotionMutation();
  const quoteBeforeMembership = appliedPromotion?.quote ?? promotionsQuery.data?.quote ?? {
    serviceTotal: currentService?.price ?? 0,
    addOnTotal: currentAddOn?.price ?? 0,
    subtotal: baseQuote.subtotal,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal: baseQuote.subtotal,
    depositDue: baseQuote.depositDue,
    balanceDue: Math.max(baseQuote.subtotal - baseQuote.depositDue, 0),
    totalDurationMinutes: baseQuote.totalDuration
  };
  const membershipPricingAdjustment = buildMembershipPricingAdjustment(
    membershipQuery.data?.subscription ?? null,
    quoteBeforeMembership.subtotal
  );
  const quoteAfterMembership = applyMembershipPricingAdjustmentToQuote({
    ...quoteBeforeMembership,
    tipTotal: 0
  }, membershipPricingAdjustment);
  const pointsBalance = pointsBalanceQuery.data;
  const pointsRedemptionPreview = previewPointsRedemption({
    requestedPoints: requestedPointsToRedeem,
    promoUnlockedPoints: pointsBalance?.promoUnlockedPoints ?? 0,
    earnedUnlockedPoints: pointsBalance?.earnedUnlockedPoints ?? 0,
    orderTotal: quoteAfterMembership.grandTotal
  });
  const quickRedeemOptions = buildQuickRedeemOptions(pointsRedemptionPreview.maxRedeemablePoints);
  const pointsBlockedCopy = getPointsBlockedReasonCopy({
    hasService: Boolean(currentService),
    orderTotal: quoteAfterMembership.grandTotal,
    unlockedPoints: pointsBalance?.unlockedPoints ?? 0,
    maxRedeemablePoints: pointsRedemptionPreview.maxRedeemablePoints,
    blockedReason: pointsRedemptionPreview.blockedReason
  });
  const displayedQuote = applyPointsPreviewToQuote(quoteAfterMembership, pointsRedemptionPreview);

  const availabilityQuery = useBarberAvailabilityQuery({
    barberId: resolvedBarberId || undefined,
    serviceId: resolvedServiceId || undefined,
    locationId: resolvedLocationId || undefined
  });
  const availableSlots = useMemo(() => availabilityQuery.data?.slots ?? [], [availabilityQuery.data?.slots]);
  const paymentMethods = useMemo(() => paymentMethodsQuery.data?.methods ?? [], [paymentMethodsQuery.data?.methods]);
  const defaultPaymentMethod = useMemo(
    () => paymentMethods.find((method) => method.isDefault) ?? paymentMethods[0] ?? null,
    [paymentMethods]
  );
  const selectedPaymentMethod = useMemo(
    () => paymentMethods.find((method) => method.id === selectedPaymentMethodId) ?? defaultPaymentMethod,
    [defaultPaymentMethod, paymentMethods, selectedPaymentMethodId]
  );

  useEffect(() => {
    const nextSlot = resolveBookableSlot(
      availableSlots,
      preselectedAppointmentTime || form.getValues("appointmentTime")
    )?.startsAt ?? availableSlots[0]?.startsAt;
    if (!nextSlot) {
      if (form.getValues("appointmentTime")) {
        form.setValue("appointmentTime", "");
      }
      return;
    }

    if (!form.getValues("appointmentTime") || !availableSlots.some((slot) => slot.startsAt === form.getValues("appointmentTime"))) {
      form.setValue("appointmentTime", nextSlot);
    }
  }, [availableSlots, form, preselectedAppointmentTime]);

  useEffect(() => {
    if (!sourceKind || !resolvedBarberId) {
      return;
    }

    const trackedBarberId = resolvedBarberId;
    const trackedLocationId = resolvedLocationId || preselectedLocationId;
    const trackingKey = `${sourceKind}:${trackedBarberId}:${trackedLocationId ?? "none"}:${query ?? "none"}`;
    if (ctaTrackedRef.current === trackingKey) {
      return;
    }

    ctaTrackedRef.current = trackingKey;
    if (typeof window !== "undefined") {
      const sessionKey = `bvrb3r-marketplace-cta:${trackingKey}`;
      if (window.sessionStorage.getItem(sessionKey)) {
        return;
      }
      window.sessionStorage.setItem(sessionKey, "1");
    }

    analyticsMutation.mutate({
      eventType: "booking_cta_clicked",
      barberId: trackedBarberId,
      username: barberProfileQuery.data?.profile.username ?? preselectedUsername,
      locationId: trackedLocationId,
      sourceKind,
      sourceReference: barberProfileQuery.data?.profile.username ?? preselectedUsername,
      metadata: {
        matchedFrom: matchedFrom ?? null,
        query: query ?? null
      }
    });
  }, [analyticsMutation, barberProfileQuery.data?.profile.username, matchedFrom, preselectedLocationId, preselectedUsername, query, resolvedBarberId, resolvedLocationId, sourceKind]);

  useEffect(() => {
    setAppliedPromotion(null);
    setPromotionFeedback(null);
  }, [watchLocationId, watchBarberId, watchServiceId, watchAddOnId, watchAppointmentTime]);

  useEffect(() => {
    setRequestedPointsToRedeem((current) => {
      if (!pointsRedemptionPreview.maxRedeemablePoints) {
        return 0;
      }

      return Math.min(current, pointsRedemptionPreview.maxRedeemablePoints);
    });
  }, [pointsRedemptionPreview.maxRedeemablePoints]);

  useEffect(() => {
    const nextMethodId = defaultPaymentMethod?.id ?? "";
    if (!selectedPaymentMethodId || !paymentMethods.some((method) => method.id === selectedPaymentMethodId)) {
      setSelectedPaymentMethodId(nextMethodId);
    }
  }, [defaultPaymentMethod?.id, paymentMethods, selectedPaymentMethodId]);

  useEffect(() => {
    writeBookingDraft({
      locationId: watchLocationId,
      barberId: watchBarberId,
      serviceId: watchServiceId,
      addOnId: watchAddOnId,
      appointmentTime: watchAppointmentTime,
      clientName: watchClientName,
      clientPhone: watchClientPhone
    });
  }, [watchAddOnId, watchAppointmentTime, watchBarberId, watchClientName, watchClientPhone, watchLocationId, watchServiceId]);

  const currentShop = shops.find((shop) => shop.id === watchLocationId) ?? shops[0];
  const runtimeLabel = searchQuery.isLoading || barberProfileQuery.isLoading ? "Loading booking options" : "Ready to book";
  const isInitialLoading = (searchQuery.isLoading && !searchQuery.data) || (barberProfileQuery.isLoading && !barberProfileQuery.data);
  const waitlistPending = waitlistMutation.isPending;
  const formError = searchQuery.error || barberProfileQuery.error || availabilityQuery.error;
  const paymentMethodsError = paymentMethodsQuery.error ? getReadableActionError(paymentMethodsQuery.error as Error) : null;
  const offlineMessage = "You’re offline. Review your booking details now, then reconnect to confirm the chair or join the waitlist.";

  async function applyPromotion(selection: { promotionId?: string; promotionCode?: string }) {
    if (!isOnline) {
      setPromotionFeedback({ tone: "info", message: offlineMessage });
      return null;
    }

    if (!resolvedLocationId || !resolvedServiceId) {
      setPromotionFeedback({ tone: "error", message: "Choose the shop and service first so we can validate the offer." });
      return null;
    }

    try {
      const result = await applyPromotionMutation.mutateAsync({
        shopId: resolvedLocationId,
        serviceId: resolvedServiceId,
        addOnIds: bookingAddOnIds,
        barberId: resolvedBarberId || undefined,
        appointmentTime: resolveBookableSlot(availableSlots, form.getValues("appointmentTime"))?.startsAt ?? undefined,
        promotionId: selection.promotionId,
        promotionCode: selection.promotionCode
      });

      setAppliedPromotion(result);
      setPromotionCode(result.promotion.code ?? selection.promotionCode ?? "");
      setPromotionFeedback({
        tone: "success",
        message: `${result.promotion.name} is now applied to this booking quote.`
      });

      return result;
    } catch (error) {
      setAppliedPromotion(null);
      setPromotionFeedback({
        tone: "error",
        message: getReadableActionError(error as BookingApiError)
      });
      return null;
    }
  }

  async function handleCreateBooking(values: BookingValues) {
    setStatusUpdate(null);
    setConfirmationId("");
    setConfirmationPaymentStatus(null);
    setConfirmationPaymentLabel(null);

    if (!isOnline) {
      setStatusUpdate({
        tone: "info",
        message: offlineMessage
      });
      return;
    }

    const resolvedSlot = resolveBookableSlot(availableSlots, values.appointmentTime);
    if (!resolvedLocationId || !resolvedBarberId || !resolvedServiceId || !resolvedSlot) {
      setStatusUpdate({
        tone: "error",
        message: "Review the barber, service, and time before confirming. We refreshed the booking details to keep the chair selection valid."
      });
      return;
    }

    if (!selectedPaymentMethod) {
      setStatusUpdate({
        tone: "error",
        message: "Add a saved payment method in Profile before confirming this booking so we can secure the appointment payment."
      });
      return;
    }

    try {
      let promotionSelection = appliedPromotion;
      const normalizedPromotionCode = promotionCode.trim().toUpperCase();

      if (!promotionSelection && normalizedPromotionCode) {
        promotionSelection = await applyPromotion({ promotionCode: normalizedPromotionCode });
        if (!promotionSelection) {
          return;
        }
      }

      const result = await bookingMutation.mutateAsync({
        locationId: resolvedLocationId,
        barberId: resolvedBarberId,
        serviceId: resolvedServiceId,
        addOnIds: bookingAddOnIds,
        appointmentTime: resolvedSlot.startsAt,
        clientName: values.clientName,
        clientPhone: values.clientPhone,
        paymentMethodId: selectedPaymentMethod.id,
        pointsToRedeem: pointsRedemptionPreview.approvedPoints || undefined,
        sourceKind,
        matchedFrom,
        discoveryQuery: query,
        barberUsername: barberProfileQuery.data?.profile.username ?? preselectedUsername,
        aiRecommendationId,
        aiRecommendationType,
        promotionId: promotionSelection?.promotion.id,
        promotionCode: promotionSelection?.promotion.code ?? (normalizedPromotionCode || undefined)
      });

      setConfirmationId(result.appointment.id);
      setConfirmationPaymentStatus("captured");
      setConfirmationPaymentLabel(selectedPaymentMethod.label);
      clearBookingDraft();
      setStatusUpdate({
        tone: "success",
        message: sourceKind
          ? "Booking confirmed and payment secured."
          : "Appointment confirmed and payment secured. The booking is now live across client, barber, and shop operations."
      });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as BookingApiError) });
    }
  }

  async function handleJoinWaitlist() {
    setStatusUpdate(null);

    if (!isOnline) {
      setStatusUpdate({
        tone: "info",
        message: offlineMessage
      });
      return;
    }

    if (!resolvedLocationId || !resolvedServiceId) {
      setStatusUpdate({
        tone: "error",
        message: "Choose a valid shop and service before joining the waitlist."
      });
      return;
    }

    try {
      const result = await waitlistMutation.mutateAsync({
        barberId: resolvedBarberId || undefined,
        serviceId: resolvedServiceId,
        locationId: resolvedLocationId,
        query
      });
      setStatusUpdate({
        tone: "info",
        message: `Waitlist joined. Request ${result.waitlist.id} is now persisted for follow-up and availability matching.`
      });
    } catch (error) {
      setStatusUpdate({ tone: "error", message: getReadableActionError(error as BookingApiError) });
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
      <Card className="overflow-hidden rounded-[38px] p-0">
        <div className="border-b border-white/8 px-6 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Book with BVRB3R</Badge>
            {sourceKind ? <Badge>{getSourceLabel(sourceKind)}</Badge> : null}
          </div>
          <h2 className="mt-5 text-balance text-3xl font-semibold sm:text-5xl" data-display="true">Book your appointment.</h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/68">
            Choose a service, choose a time, confirm the details, then pay or reserve.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2 text-[11px] uppercase tracking-[0.18em] text-white/48 sm:flex sm:flex-wrap sm:tracking-[0.22em]">
            <span className="rounded-full border border-[#7CFF00]/20 bg-[#7CFF00]/10 px-3 py-2 text-[#d7ffab]">01 Choose service</span>
            <span className="rounded-full border border-white/8 bg-black/25 px-3 py-2">02 Choose time</span>
            <span className="rounded-full border border-white/8 bg-black/25 px-3 py-2">03 Confirm details</span>
            <span className="rounded-full border border-white/8 bg-black/25 px-3 py-2">04 Pay or confirm</span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="rounded-[24px] border border-white/8 bg-black/20 px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-[#cfff93]">
              {runtimeLabel}
            </div>
            {currentBarberResult ? (
              <div className="rounded-[24px] border border-[#7CFF00]/16 bg-[#7CFF00]/8 px-4 py-3 text-sm text-white/78">
                Booking with <span className="text-[#d7ffab]">{currentBarberResult.barberName}</span>{matchedFrom ? ` from ${matchedFrom.replaceAll("_", " ")}` : ""}
              </div>
            ) : null}
          </div>
        </div>
        <form className="grid gap-4 p-5 sm:p-8 md:grid-cols-2" onSubmit={form.handleSubmit(handleCreateBooking)}>
          <div className="md:col-span-2">
            {statusUpdate ? <FeedbackBanner tone={statusUpdate.tone} message={statusUpdate.message} /> : null}
            {!isOnline ? <FeedbackBanner tone="info" message={offlineMessage} /> : null}
            {formError ? <FeedbackBanner tone="error" message={getReadableActionError(formError as BookingApiError)} /> : null}
          </div>
          <div className="rounded-[28px] border border-white/8 bg-black/20 p-4 md:col-span-2">
            <label className="surface-label mb-3 block">Location</label>
            <Select
              {...form.register("locationId")}
              onChange={(event) => {
                form.setValue("locationId", event.target.value);
                setLocation(event.target.value);
              }}
            >
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>{shop.name}</option>
              ))}
            </Select>
          </div>
          <div className="rounded-[28px] border border-white/8 bg-black/20 p-4">
            <label className="surface-label mb-3 block">Barber</label>
            <Select
              {...form.register("barberId")}
              onChange={(event) => {
                form.setValue("barberId", event.target.value);
                setBarber(event.target.value);
              }}
            >
              {barbers.map((barber) => (
                <option key={barber.barberId} value={barber.barberId}>{barber.barberName}</option>
              ))}
            </Select>
          </div>
          <div className="rounded-[28px] border border-white/8 bg-black/20 p-4">
            <label className="surface-label mb-3 block">Service</label>
            <Select
              value={watchServiceId}
              onChange={(event) => form.setValue("serviceId", event.target.value)}
            >
              {primaryServices.map((service) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </Select>
          </div>
          <div className="rounded-[28px] border border-white/8 bg-black/20 p-4">
            <label className="surface-label mb-3 block">Add-on</label>
            <Select
              value={watchAddOnId}
              onChange={(event) => form.setValue("addOnId", event.target.value)}
            >
              <option value="">No add-on</option>
              {addOns.map((service) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </Select>
          </div>
          <div className="rounded-[28px] border border-white/8 bg-black/20 p-4">
            <label className="surface-label mb-3 block">Time</label>
            <Select
              value={form.watch("appointmentTime")}
              onChange={(event) => form.setValue("appointmentTime", event.target.value)}
            >
              {availableSlots.map((slot) => (
                <option key={slot.startsAt} value={slot.startsAt}>{slot.label}</option>
              ))}
            </Select>
          </div>
          <div className="rounded-[28px] border border-white/8 bg-black/20 p-4">
            <label className="surface-label mb-3 block">Client name</label>
            <Input {...form.register("clientName")} />
          </div>
          <div className="rounded-[28px] border border-white/8 bg-black/20 p-4">
            <label className="surface-label mb-3 block">Phone</label>
            <Input type="tel" inputMode="tel" {...form.register("clientPhone")} />
          </div>
          <div className="rounded-[28px] border border-white/8 bg-black/20 p-4 md:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <label className="surface-label mb-3 block" htmlFor="booking-payment-method">Saved payment method</label>
                <p className="text-sm leading-7 text-white/62">
                  Choose the saved card for this booking.
                </p>
              </div>
              {selectedPaymentMethod ? <Badge>{selectedPaymentMethod.isDefault ? "Default card" : "Saved card"}</Badge> : null}
            </div>
            {paymentMethodsError ? <div className="mt-4"><FeedbackBanner tone="error" message={paymentMethodsError} /></div> : null}
            {paymentMethodsQuery.isLoading && !paymentMethods.length ? (
              <div className="mt-4 rounded-[22px] border border-white/8 bg-black/18 p-4">
                <Skeleton className="h-11 w-full rounded-[16px]" />
              </div>
            ) : paymentMethods.length ? (
              <div className="mt-4 space-y-3">
                <Select
                  id="booking-payment-method"
                  value={selectedPaymentMethodId}
                  onChange={(event) => setSelectedPaymentMethodId(event.target.value)}
                >
                  {paymentMethods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.label}{method.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </Select>
                <p className="text-sm text-white/52">
                  {selectedPaymentMethod
                    ? `${selectedPaymentMethod.label} will be charged ${currency(displayedQuote.grandTotal)} when you confirm this booking.`
                    : "Choose a saved card to continue."}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-black/18 p-4">
                <p className="text-sm leading-7 text-white/62">
                  No saved payment method is ready for this account yet. Add one in Wallet before confirming the booking.
                </p>
                <div className="mt-4">
                  <Link
                    href="/profile"
                    className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-black/25 px-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]"
                  >
                    Open wallet
                  </Link>
                </div>
              </div>
            )}
          </div>
          <label className="md:col-span-2 flex items-start gap-3 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(21,21,21,0.95),rgba(10,10,10,0.98))] p-5 text-sm leading-7 text-white/72">
            <input type="checkbox" className="mt-1 accent-[#7CFF00]" defaultChecked {...form.register("acknowledgePolicy")} />
            <span>
              I acknowledge the cancellation policy.
            </span>
          </label>
          {form.formState.errors.acknowledgePolicy ? (
            <p className="md:col-span-2 text-sm text-rose-200">{form.formState.errors.acknowledgePolicy.message}</p>
          ) : null}
          {confirmationId ? (
            <div className="md:col-span-2 rounded-[28px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-5 text-sm leading-7 text-white/78">
              <p>
                Booking confirmed. Appointment <span className="text-[#d3ffa0]">{confirmationId}</span> is ready.
              </p>
              <p className="mt-3 text-white/68">
                {confirmationPaymentStatus
                  ? confirmationPaymentStatus === "captured"
                    ? `${confirmationPaymentLabel ?? "Saved card"} was charged for this booking.`
                    : confirmationPaymentStatus === "authorized"
                      ? `${confirmationPaymentLabel ?? "Saved card"} is now authorized for this booking.`
                      : `${confirmationPaymentLabel ?? "Saved card"} needs attention before this booking is fully paid.`
                  : "Payment status will update here as soon as the booking payment is secured."}
              </p>
              <p className="mt-3 text-white/68">
                {pointsRedemptionPreview.approvedPoints
                  ? `${pointsRedemptionPreview.approvedPoints} pts applied for ${currency(pointsRedemptionPreview.discountAmount)} off this booking.`
                  : "BVR Points are ready for future bookings."}
              </p>
              <p className="mt-2 text-white/60">
                {pointsBalance
                  ? `Current balance ${pointsBalance.unlockedPoints} pts (${currency(pointsBalance.inAppValue)} in-app value). New points post after the paid service closes.`
                  : "New points post after service closes."}
              </p>
            </div>
          ) : null}
          <div className="md:col-span-2 sticky bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-10 -mx-1 flex flex-col gap-3 rounded-[28px] border border-white/10 bg-[rgba(7,7,7,0.94)] p-3 backdrop-blur sm:mx-0 sm:flex-row md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            <Button className="h-12 px-6" disabled={bookingMutation.isPending || waitlistPending || isInitialLoading || !availableSlots.length || !isOnline || !selectedPaymentMethod}>
              {bookingMutation.isPending ? "Securing booking..." : "Confirm and pay"}
            </Button>
            <Button type="button" variant="secondary" className="h-12 px-6" disabled={bookingMutation.isPending || waitlistPending || !watchServiceId || !watchLocationId || !isOnline} onClick={() => void handleJoinWaitlist()}>
              {waitlistPending ? "Joining waitlist..." : "Join waitlist"}
            </Button>
          </div>
        </form>
      </Card>
      <Card className="rounded-[38px] p-5 sm:p-8 lg:sticky lg:top-4">
        <p className="surface-label">Reservation quote</p>
        {isInitialLoading ? <Skeleton className="mt-4 h-12 w-48" /> : <h3 className="mt-4 text-4xl font-semibold" data-display="true">{currentService?.name ?? "Choose a service"}</h3>}
        {isInitialLoading ? <Skeleton className="mt-4 h-16 w-full" /> : <p className="mt-4 text-sm leading-7 text-white/64">{currentService?.description ?? "Pick a barber and service to see booking details."}</p>}
        <div className="mt-6 rounded-[24px] border border-white/8 bg-black/20 p-4 text-sm text-white/68">
          <p className="surface-label">Booking context</p>
          <p className="mt-3">{sourceKind ? `${getSourceLabel(sourceKind)} with ${currentBarberResult?.barberName ?? "selected barber"}.` : "Choose your barber, service, and time."}</p>
          {query ? <p className="mt-2 text-white/52">Search context: {query}</p> : null}
        </div>
        <div className="mt-6 rounded-[24px] border border-white/8 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">Offers and promo codes</p>
            {appliedPromotion ? <Badge>Applied</Badge> : null}
          </div>
          {promotionsQuery.error ? <div className="mt-4"><FeedbackBanner tone="error" message={getReadableActionError(promotionsQuery.error as BookingApiError)} /></div> : null}
          {promotionFeedback ? <div className="mt-4"><FeedbackBanner tone={promotionFeedback.tone} message={promotionFeedback.message} /></div> : null}
          <div className="mt-4 flex gap-2">
            <Input
              value={promotionCode}
              onChange={(event) => setPromotionCode(event.target.value.toUpperCase())}
              placeholder="Enter promo code"
            />
            <Button
              type="button"
              variant="secondary"
              className="h-11 shrink-0 px-4"
              disabled={applyPromotionMutation.isPending || !promotionCode.trim() || !resolvedLocationId || !resolvedServiceId || !isOnline}
              onClick={() => void applyPromotion({ promotionCode: promotionCode.trim().toUpperCase() })}
            >
              {applyPromotionMutation.isPending ? "Applying..." : "Apply"}
            </Button>
          </div>
          <div className="mt-4 space-y-2">
            {(promotionsQuery.data?.promotions ?? []).slice(0, 3).map((promotion) => (
              <button
                key={promotion.id}
                type="button"
                className="w-full rounded-[20px] border border-white/8 bg-black/18 px-4 py-3 text-left transition hover:border-[#7CFF00]/24 hover:bg-black/25"
                onClick={() => void applyPromotion({ promotionId: promotion.id })}
                disabled={applyPromotionMutation.isPending || !isOnline}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-white">{promotion.name}</span>
                  <span className="text-sm text-[#d7ffab]">Save {currency(promotion.estimatedDiscount)}</span>
                </div>
                <p className="mt-1 text-xs leading-6 text-white/58">
                  {promotion.code ? `${promotion.code} • ` : ""}
                  {promotion.description ?? `${promotion.discountType === "percent" ? `${promotion.discountValue}%` : currency(promotion.discountValue)} off this booking.`}
                </p>
              </button>
            ))}
            {!promotionsQuery.isLoading && !(promotionsQuery.data?.promotions?.length) ? (
              <p className="text-sm leading-7 text-white/52">No active offers match this chair selection right now, but you can still book at the live total below.</p>
            ) : null}
          </div>
        </div>
        <div className="mt-6 rounded-[24px] border border-white/8 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="surface-label">BVR Points</p>
            <Badge>{pointsBalance ? `${pointsBalance.unlockedPoints} unlocked` : "Reward-ready"}</Badge>
          </div>
          {pointsBalanceQuery.error ? (
            <div className="mt-4">
              <FeedbackBanner tone="error" message={getReadableActionError(pointsBalanceQuery.error as BookingApiError)} />
            </div>
          ) : null}
          <p className="mt-3 text-sm leading-7 text-white/62">
            Redeem unlocked points at confirmation. The quote updates before you book.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] border border-white/8 bg-black/18 px-4 py-4">
              <p className="surface-label">Available balance</p>
              <p className="mt-3 text-2xl font-semibold text-white">{pointsBalanceQuery.isLoading && !pointsBalance ? "..." : pointsBalance?.unlockedPoints ?? 0} pts</p>
              <p className="mt-2 text-sm text-white/56">{currency(pointsBalance?.inAppValue ?? 0)} in booking value</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/18 px-4 py-4">
              <p className="surface-label">Max usable</p>
              <p className="mt-3 text-2xl font-semibold text-white">{pointsRedemptionPreview.maxRedeemablePoints} pts</p>
              <p className="mt-2 text-sm text-white/56">{currency(pointsToInAppValue(pointsRedemptionPreview.maxRedeemablePoints))} on this booking</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/18 px-4 py-4">
              <p className="surface-label">Pending</p>
              <p className="mt-3 text-2xl font-semibold text-white">{pointsBalance?.pendingPoints ?? 0} pts</p>
              <p className="mt-2 text-sm text-white/56">Unlocks after validation windows close</p>
            </div>
          </div>
          <div className="mt-4 rounded-[20px] border border-white/8 bg-black/18 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="surface-label block" htmlFor="bvr-points-redeem">Redeem on this booking</label>
              {quickRedeemOptions.length ? (
                <div className="flex flex-wrap gap-2">
                  {quickRedeemOptions.map((option) => (
                    <Button
                      key={option.label}
                      type="button"
                      variant={requestedPointsToRedeem === option.points ? "primary" : "secondary"}
                      className="h-9 px-3"
                      disabled={!isOnline}
                      onClick={() => setRequestedPointsToRedeem(option.points)}
                    >
                      {option.label}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 px-3"
                    disabled={!isOnline || !pointsRedemptionPreview.maxRedeemablePoints}
                    onClick={() => setRequestedPointsToRedeem(pointsRedemptionPreview.maxRedeemablePoints)}
                  >
                    Auto-apply max
                  </Button>
                </div>
              ) : null}
            </div>
            <Input
              id="bvr-points-redeem"
              className="mt-3"
              type="number"
              min={0}
              max={pointsRedemptionPreview.maxRedeemablePoints}
              step={1}
              value={requestedPointsToRedeem}
              disabled={!isOnline}
              onChange={(event) => {
                const nextValue = Number.parseInt(event.target.value || "0", 10);
                if (Number.isNaN(nextValue)) {
                  setRequestedPointsToRedeem(0);
                  return;
                }

                setRequestedPointsToRedeem(Math.max(0, Math.min(nextValue, pointsRedemptionPreview.maxRedeemablePoints)));
              }}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-white/56">
              <span>Discount {currency(pointsRedemptionPreview.discountAmount)}</span>
              <span>{pointsRedemptionPreview.approvedPoints} pts applied</span>
            </div>
          </div>
          {pointsBlockedCopy ? (
            <p className="mt-3 text-sm text-white/52">{pointsBlockedCopy}</p>
          ) : null}
        </div>
        <div className="mt-8 space-y-3 text-sm text-white/72">
          {isInitialLoading ? (
            <>
              <QuoteRowSkeleton />
              <QuoteRowSkeleton />
              <QuoteRowSkeleton />
              <QuoteRowSkeleton />
              <QuoteRowSkeleton />
              <QuoteRowSkeleton />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3"><span>Location</span><span>{currentShop?.name}</span></div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3"><span>Duration</span><span>{displayedQuote.totalDurationMinutes} min including buffer</span></div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3"><span>Subtotal</span><span>{currency(displayedQuote.subtotal)}</span></div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3"><span>Discount</span><span className={displayedQuote.discountTotal > 0 ? "text-[#d7ffab]" : ""}>{displayedQuote.discountTotal > 0 ? `-${currency(displayedQuote.discountTotal)}` : currency(0)}</span></div>
              {membershipPricingAdjustment ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-[#7CFF00]/14 bg-[#7CFF00]/8 px-4 py-3">
                  <span>{membershipPricingAdjustment.label}</span>
                  <span className="text-[#d7ffab]">-{currency(membershipPricingAdjustment.discountAmount)}</span>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3"><span>Estimated tax</span><span>{currency(displayedQuote.taxTotal)}</span></div>
              <div className="flex items-center justify-between rounded-[22px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 px-4 py-3"><span>Deposit reserved</span><span className="text-[#d3ffa0]">{currency(displayedQuote.depositDue)}</span></div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3"><span>Remaining at checkout</span><span>{currency(displayedQuote.balanceDue)}</span></div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3"><span>Final total</span><span>{currency(displayedQuote.grandTotal)}</span></div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3"><span>Live availability</span><span>{`${availableSlots.length} available slot${availableSlots.length === 1 ? "" : "s"}`}</span></div>
              {form.watch("appointmentTime") ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3"><span>Selected time</span><span>{dateLabel(watchAppointmentTime)}</span></div>
              ) : null}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

