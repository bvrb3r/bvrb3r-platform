"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CalendarDays, CheckCircle2, Clock3, MapPin, Scissors } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineBookingPaymentMethod } from "@/components/booking/inline-booking-payment-method";
import { usePwa } from "@/components/pwa/pwa-provider";
import { useBookingStore } from "@/lib/data/booking-store";
import {
  useClientPointsBalanceQuery,
  useClientMembershipQuery,
  useClientHomeQuery,
  useBarberAvailabilityQuery,
  useBarberProfileQuery,
  useBarberSearchQuery,
  useCreateBookingMutation,
  type BookingApiError
} from "@/lib/booking/client";
import { applyMembershipPricingAdjustmentToQuote, buildMembershipPricingAdjustment } from "@/lib/monetization/membership";
import {
  getResolvedDefaultPaymentMethod,
  normalizeClientPaymentMethodDefaults,
  usePaymentMethodsQuery,
  type ClientPaymentMethodView
} from "@/lib/payments/client";
import { applyPointsPreviewToQuote, pointsToInAppValue, previewPointsRedemption } from "@/lib/points/redemption";
import { useMarketplaceAnalyticsMutation, useMarketplaceWaitlistMutation } from "@/lib/marketplace/client";
import { getBookingLocationLines, getClientFacingBarberName } from "@/lib/marketplace/client-facing";
import { useApplyPromotionMutation, useClientPromotionsQuery } from "@/lib/promotions/client";
import type { PromotionPreviewView } from "@/lib/promotions/service";
import { calculateBookingQuote, resolveBookableAddOn, resolveBookableBarber, resolveBookableService, resolveBookableSlot } from "@/lib/utils/booking";
import { getReadableActionError } from "@/lib/utils/feedback";
import { cn, currency, dateLabel } from "@/lib/utils";
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
type BookingStep = "service" | "time" | "review";
type BookingDraft = Pick<
  BookingValues,
  "locationId" | "barberId" | "serviceId" | "addOnId" | "appointmentTime" | "clientName" | "clientPhone"
>;

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

function getBookingPaymentMethodsErrorMessage(error: unknown) {
  if (!error) {
    return null;
  }

  return "Saved payment method could not be loaded. Refresh or manage wallet.";
}

const bookingSteps: Array<{ id: BookingStep; label: string }> = [
  { id: "service", label: "Choose service" },
  { id: "time", label: "Pick time" },
  { id: "review", label: "Review" }
];

function getStepIndex(step: BookingStep) {
  return bookingSteps.findIndex((entry) => entry.id === step);
}

function getSlotDateKey(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso.slice(0, 10);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSlotDayLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Available day";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function getSlotTimeLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function getSlotPeriod(iso: string): "Morning" | "Afternoon" | "Evening" {
  const hour = new Date(iso).getHours();
  if (hour < 12) {
    return "Morning";
  }
  if (hour < 17) {
    return "Afternoon";
  }
  return "Evening";
}

function groupSlotsByDate<T extends { startsAt: string }>(slots: T[]) {
  return slots.reduce<Record<string, T[]>>((groups, slot) => {
    const key = getSlotDateKey(slot.startsAt);
    groups[key] = [...(groups[key] ?? []), slot];
    return groups;
  }, {});
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
  const clientHomeQuery = useClientHomeQuery();
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
  const [inlineSavedPaymentMethod, setInlineSavedPaymentMethod] = useState<ClientPaymentMethodView | null>(null);
  const [paymentSetupPending, setPaymentSetupPending] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState("");

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
  const [bookingStep, setBookingStep] = useState<BookingStep>(() => (preselectedServiceId ? "time" : "service"));

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
  const clientContact = clientHomeQuery.data?.client;
  const profileClientName = clientContact?.fullName?.trim() ?? "";
  const profileClientPhone = clientContact?.phone?.trim() ?? "";
  const profileClientEmail = clientContact?.email?.trim() ?? "";
  const resolvedClientName = watchClientName.trim() || profileClientName;
  const resolvedClientPhone = watchClientPhone.trim() || profileClientPhone;
  const hasClientName = resolvedClientName.length >= 2;
  const hasClientPhone = resolvedClientPhone.length >= 10;

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
    if (profileClientName && !form.getValues("clientName")) {
      form.setValue("clientName", profileClientName);
    }

    if (profileClientPhone && !form.getValues("clientPhone")) {
      form.setValue("clientPhone", profileClientPhone);
    }
  }, [form, profileClientName, profileClientPhone]);

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
  const slotsByDate = useMemo(() => groupSlotsByDate(availableSlots), [availableSlots]);
  const slotDateKeys = useMemo(() => Object.keys(slotsByDate), [slotsByDate]);
  const selectedDateSlots = selectedDateKey ? slotsByDate[selectedDateKey] ?? [] : [];
  const timezoneLabel = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
    } catch {
      return "local time";
    }
  }, []);
  const paymentMethods = useMemo(() => {
    const queriedPaymentMethods = paymentMethodsQuery.data?.methods ?? [];
    const methodsById = new Map<string, ClientPaymentMethodView>();
    for (const method of queriedPaymentMethods) {
      methodsById.set(method.id, method);
    }

    if (inlineSavedPaymentMethod) {
      methodsById.set(inlineSavedPaymentMethod.id, inlineSavedPaymentMethod);
    }

    return normalizeClientPaymentMethodDefaults(
      Array.from(methodsById.values()),
      paymentMethodsQuery.data?.defaultPaymentMethodId
    );
  }, [inlineSavedPaymentMethod, paymentMethodsQuery.data?.defaultPaymentMethodId, paymentMethodsQuery.data?.methods]);
  const defaultPaymentMethod = useMemo(
    () => getResolvedDefaultPaymentMethod(paymentMethods, paymentMethodsQuery.data?.defaultPaymentMethodId),
    [paymentMethods, paymentMethodsQuery.data?.defaultPaymentMethodId]
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
    const activeSlot = availableSlots.find((slot) => slot.startsAt === form.getValues("appointmentTime")) ?? availableSlots[0];
    if (!activeSlot) {
      setSelectedDateKey("");
      return;
    }

    const nextDateKey = getSlotDateKey(activeSlot.startsAt);
    setSelectedDateKey((current) => current || nextDateKey);
  }, [availableSlots, form, watchAppointmentTime]);

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
  const profileLocation = barberProfileQuery.data?.shopLocations.find((location) => location.id === watchLocationId)
    ?? barberProfileQuery.data?.shopLocations[0];
  const selectedLocationLines = getBookingLocationLines(
    profileLocation ?? currentShop ?? {
      name: currentBarberResult?.locationLabel ?? currentBarberResult?.shopName,
      city: currentBarberResult?.cityLabel,
      state: ""
    }
  );
  const selectedLocationName = selectedLocationLines[0] ?? "Service location";
  const selectedLocationDetailLines = selectedLocationLines.slice(1);
  const selectedLocationDetail = selectedLocationDetailLines.join(", ");
  const showLocationDetail = selectedLocationDetailLines.length > 0;
  const clientFacingBarberName = getClientFacingBarberName({
    username: barberProfileQuery.data?.profile.username ?? currentBarberResult?.username ?? preselectedUsername,
    barberName: currentBarberResult?.barberName
  });
  const isInitialLoading = (searchQuery.isLoading && !searchQuery.data) || (barberProfileQuery.isLoading && !barberProfileQuery.data);
  const waitlistPending = waitlistMutation.isPending;
  const formError = searchQuery.error || barberProfileQuery.error || availabilityQuery.error;
  const paymentMethodsError = getBookingPaymentMethodsErrorMessage(paymentMethodsQuery.error);
  const offlineMessage = "You’re offline. Review your booking details now, then reconnect to confirm the chair or join the waitlist.";

  async function applyPromotion(selection: { promotionId?: string; promotionCode?: string }) {
    const normalizedPromotionCode = selection.promotionCode?.trim().toUpperCase() ?? "";

    if (!selection.promotionId && !normalizedPromotionCode) {
      setPromotionFeedback({ tone: "info", message: "Enter a promo code first." });
      return null;
    }

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
        promotionCode: normalizedPromotionCode || undefined
      });

      setAppliedPromotion(result);
      setPromotionCode(result.promotion.code ?? normalizedPromotionCode);
      setPromotionFeedback({
        tone: "success",
        message: `${result.promotion.name} is now applied to this booking quote.`
      });

      return result;
    } catch {
      setAppliedPromotion(null);
      setPromotionFeedback({
        tone: "error",
        message: "Promo code not valid for this booking."
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
        message: "Save a payment method before booking."
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

      console.log("[booking] payment_method_selected", {
        reference: "payment_method_selected",
        paymentMethodIdPresent: Boolean(selectedPaymentMethod.id),
        belongsToClient: null,
        providerPaymentMethodPresent: null,
        providerCustomerPresent: null
      });

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
        barberName: clientFacingBarberName,
        serviceName: currentService?.name,
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

  const selectedSlot = resolveBookableSlot(availableSlots, watchAppointmentTime) ?? undefined;
  const selectedSlotLabel = selectedSlot ? dateLabel(selectedSlot.startsAt) : "Choose a time";
  const activeStepIndex = getStepIndex(bookingStep);
  const serviceReady = Boolean(currentService);
  const timeReady = Boolean(selectedSlot);
  const reviewReady = serviceReady && timeReady && Boolean(selectedPaymentMethod) && hasClientName && hasClientPhone && isOnline && !paymentSetupPending;

  function continueToTime() {
    if (!currentService) {
      setStatusUpdate({ tone: "error", message: "Choose a service before picking a time." });
      return;
    }
    setStatusUpdate(null);
    setBookingStep("time");
  }

  function continueToReview() {
    if (!selectedSlot) {
      setStatusUpdate({ tone: "error", message: "Choose an available time before reviewing the appointment." });
      return;
    }
    setStatusUpdate(null);
    setBookingStep("review");
  }

  if (confirmationId) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="rounded-[34px] p-6 sm:p-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#7CFF00]/24 bg-[#7CFF00]/12 text-[#d7ffab]">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <p className="mt-6 surface-label text-[#d7ffab]">Appointment booked</p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">
            You are on the books.
          </h2>
          <div className="mt-6 grid gap-3 text-sm text-white/72">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
              <span>Barber</span>
              <span className="font-medium text-white">{clientFacingBarberName}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
              <span>Service</span>
              <span className="font-medium text-white">{currentService?.name ?? "Selected service"}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
              <span>Date and time</span>
              <span className="font-medium text-white">{selectedSlotLabel}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
              <span>Location</span>
              <span className="text-right font-medium text-white">
                {selectedLocationName}
                {showLocationDetail ? <span className="mt-1 block text-white/58">{selectedLocationDetail}</span> : null}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 px-4 py-3">
              <span>Total</span>
              <span className="font-semibold text-[#d7ffab]">{currency(displayedQuote.grandTotal)}</span>
            </div>
          </div>
          <p className="mt-5 text-sm leading-7 text-white/62">
            Confirmation {confirmationId}. {confirmationPaymentStatus === "captured" && confirmationPaymentLabel
              ? `${confirmationPaymentLabel} was charged for this booking.`
              : "Payment status will update in Activity."}
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Link href="/dashboard/client/activity" className="inline-flex h-12 items-center justify-center rounded-full bg-[#7CFF00] px-5 text-sm font-semibold text-black transition hover:bg-[#baff69]">
              View Appointment
            </Link>
            <Link href="/dashboard/client/messages" className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-black/25 px-5 text-sm font-semibold text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
              Message Barber
            </Link>
            <Link href="/dashboard/client" className="inline-flex h-12 items-center justify-center rounded-full border border-white/10 bg-black/25 px-5 text-sm font-semibold text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
              Back Home
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_22rem]">
      <Card className="overflow-hidden rounded-[34px] p-0">
        <div className="border-b border-white/8 px-5 py-6 sm:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{sourceKind ? getSourceLabel(sourceKind) : "Book appointment"}</Badge>
            {currentBarberResult ? <Badge>{clientFacingBarberName}</Badge> : null}
          </div>
          <h2 className="mt-4 text-balance text-3xl font-semibold sm:text-5xl" data-display="true">
            Book your appointment.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/66">
            Choose a service, pick a time, review the total, then book.
          </p>
          <div className="mt-5 grid gap-2 text-[11px] uppercase tracking-[0.18em] text-white/48 sm:grid-cols-3">
            {bookingSteps.map((step, index) => {
              const isActive = bookingStep === step.id;
              const isComplete = index < activeStepIndex;
              return (
                <button
                  key={step.id}
                  type="button"
                  className={cn(
                    "rounded-full border px-3 py-2 text-left transition",
                    isActive || isComplete
                      ? "border-[#7CFF00]/24 bg-[#7CFF00]/10 text-[#d7ffab]"
                      : "border-white/8 bg-black/25 text-white/48"
                  )}
                  onClick={() => {
                    if (step.id === "service") setBookingStep("service");
                    if (step.id === "time" && serviceReady) setBookingStep("time");
                    if (step.id === "review" && serviceReady && timeReady) setBookingStep("review");
                  }}
                >
                  {String(index + 1).padStart(2, "0")} {step.label}
                </button>
              );
            })}
          </div>
        </div>

        <form className="p-5 sm:p-8" onSubmit={form.handleSubmit(handleCreateBooking)}>
          <div className="space-y-3">
            {statusUpdate ? <FeedbackBanner tone={statusUpdate.tone} message={statusUpdate.message} /> : null}
            {!isOnline ? <FeedbackBanner tone="info" message={offlineMessage} /> : null}
            {formError ? <FeedbackBanner tone="error" message={getReadableActionError(formError as BookingApiError)} /> : null}
          </div>

          {bookingStep === "service" ? (
            <section className="mt-5 space-y-5" aria-labelledby="booking-service-step">
              <div>
                <p className="surface-label text-[#d7ffab]">Step 1</p>
                <h3 id="booking-service-step" className="mt-2 text-2xl font-semibold text-white">Choose service</h3>
                <p className="mt-2 text-sm text-white/58">Only active services from this barber are shown.</p>
              </div>

              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label text-[#d7ffab]">Booking with</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-lg font-semibold text-white">{clientFacingBarberName}</p>
                    <p className="mt-1 text-sm text-white/58">Your barber is locked for this booking.</p>
                  </div>
                  <div className="rounded-[20px] border border-white/8 bg-black/18 px-4 py-3">
                    <p className="text-sm font-semibold text-white">{selectedLocationName}</p>
                    <p className="mt-1 text-sm leading-6 text-white/58">{selectedLocationDetail}</p>
                  </div>
                </div>
              </div>

              {isInitialLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Skeleton className="h-32 rounded-[24px]" />
                  <Skeleton className="h-32 rounded-[24px]" />
                </div>
              ) : primaryServices.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {primaryServices.map((service) => {
                    const selected = service.id === watchServiceId;
                    return (
                      <button
                        key={service.id}
                        type="button"
                        className={cn(
                          "rounded-[24px] border p-4 text-left transition",
                          selected
                            ? "border-[#7CFF00]/34 bg-[#7CFF00]/10 shadow-[0_16px_30px_rgba(124,255,0,0.08)]"
                            : "border-white/8 bg-black/20 hover:border-[#7CFF00]/22"
                        )}
                        onClick={() => {
                          form.setValue("serviceId", service.id);
                          setStatusUpdate(null);
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-white">{service.name}</p>
                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/58">{service.description ?? "Book this service."}</p>
                          </div>
                          {selected ? <CheckCircle2 className="h-5 w-5 shrink-0 text-[#d7ffab]" /> : null}
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-white/68">
                          <span className="rounded-full border border-white/8 bg-black/24 px-3 py-1.5">{currency(service.price)}</span>
                          <span className="rounded-full border border-white/8 bg-black/24 px-3 py-1.5">{service.durationMin} min</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state-panel rounded-[24px] p-5 text-sm text-white/58">
                  No active services are available for this barber yet.
                </div>
              )}

              {addOns.length ? (
                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <label className="surface-label mb-3 block">Optional add-on</label>
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
              ) : null}

              <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-10 -mx-1 rounded-[24px] border border-white/10 bg-[rgba(7,7,7,0.94)] p-3 backdrop-blur sm:mx-0 md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
                <Button type="button" className="h-12 w-full px-6 sm:w-auto" disabled={!serviceReady || isInitialLoading} onClick={continueToTime}>
                  Continue
                </Button>
              </div>
            </section>
          ) : null}

          {bookingStep === "time" ? (
            <section className="mt-5 space-y-5" aria-labelledby="booking-time-step">
              <div>
                <p className="surface-label text-[#d7ffab]">Step 2</p>
                <h3 id="booking-time-step" className="mt-2 text-2xl font-semibold text-white">Pick date and time</h3>
                <p className="mt-2 text-sm text-white/58">Times shown in {timezoneLabel}.</p>
              </div>

              {availabilityQuery.isLoading && !availableSlots.length ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Skeleton className="h-16 rounded-[22px]" />
                  <Skeleton className="h-16 rounded-[22px]" />
                  <Skeleton className="h-16 rounded-[22px]" />
                </div>
              ) : availableSlots.length ? (
                <>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {slotDateKeys.map((dateKey) => (
                      <button
                        key={dateKey}
                        type="button"
                        className={cn(
                          "min-w-[8.75rem] rounded-[22px] border px-4 py-3 text-left transition",
                          selectedDateKey === dateKey
                            ? "border-[#7CFF00]/34 bg-[#7CFF00]/10 text-white"
                            : "border-white/8 bg-black/20 text-white/64 hover:border-[#7CFF00]/22"
                        )}
                        onClick={() => {
                          setSelectedDateKey(dateKey);
                          const nextSlot = slotsByDate[dateKey]?.[0];
                          if (nextSlot) {
                            form.setValue("appointmentTime", nextSlot.startsAt);
                          }
                        }}
                      >
                        <span className="surface-label block text-white/42">Date</span>
                        <span className="mt-1 block text-sm font-semibold">{getSlotDayLabel(slotsByDate[dateKey]?.[0]?.startsAt ?? dateKey)}</span>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-4">
                    {(["Morning", "Afternoon", "Evening"] as const).map((period) => {
                      const periodSlots = selectedDateSlots.filter((slot) => getSlotPeriod(slot.startsAt) === period);
                      if (!periodSlots.length) {
                        return null;
                      }

                      return (
                        <div key={period} className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                            <Clock3 className="h-4 w-4 text-[#d7ffab]" />
                            {period}
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {periodSlots.map((slot) => {
                              const selected = slot.startsAt === watchAppointmentTime;
                              return (
                                <button
                                  key={slot.startsAt}
                                  type="button"
                                  className={cn(
                                    "rounded-full border px-4 py-3 text-sm font-semibold transition",
                                    selected
                                      ? "border-[#7CFF00]/34 bg-[#7CFF00] text-black"
                                      : "border-white/8 bg-black/24 text-white hover:border-[#7CFF00]/22 hover:text-[#d7ffab]"
                                  )}
                                  onClick={() => form.setValue("appointmentTime", slot.startsAt)}
                                >
                                  {getSlotTimeLabel(slot.startsAt)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="empty-state-panel rounded-[24px] p-5">
                  <p className="text-lg font-semibold text-white">No times available for this date.</p>
                  <p className="mt-2 text-sm leading-7 text-white/58">Try another day, or join the waitlist.</p>
                  <Button type="button" variant="secondary" className="mt-4 h-11 px-5" disabled={waitlistPending || !watchServiceId || !watchLocationId || !isOnline} onClick={() => void handleJoinWaitlist()}>
                    {waitlistPending ? "Joining waitlist..." : "Join waitlist"}
                  </Button>
                </div>
              )}

              <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-10 -mx-1 flex flex-col gap-3 rounded-[24px] border border-white/10 bg-[rgba(7,7,7,0.94)] p-3 backdrop-blur sm:mx-0 sm:flex-row md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
                <Button type="button" variant="secondary" className="h-12 px-6" onClick={() => setBookingStep("service")}>
                  Back
                </Button>
                <Button type="button" className="h-12 px-6" disabled={!timeReady || availabilityQuery.isLoading} onClick={continueToReview}>
                  Continue to Review
                </Button>
              </div>
            </section>
          ) : null}

          {bookingStep === "review" ? (
            <section className="mt-5 space-y-5" aria-labelledby="booking-review-step">
              <div>
                <p className="surface-label text-[#d7ffab]">Step 3</p>
                <h3 id="booking-review-step" className="mt-2 text-2xl font-semibold text-white">Review appointment</h3>
                <p className="mt-2 text-sm text-white/58">Nothing is booked until you tap Book Appointment.</p>
              </div>

              <div className="grid gap-3 text-sm text-white/72">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
                  <span className="inline-flex items-center gap-2"><Scissors className="h-4 w-4 text-[#d7ffab]" />Service</span>
                  <span className="font-medium text-white">{currentService?.name ?? "Choose a service"}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
                  <span>Barber</span>
                  <span className="font-medium text-white">{clientFacingBarberName}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
                  <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#d7ffab]" />Date and time</span>
                  <span className="font-medium text-white">{selectedSlotLabel}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-black/20 px-4 py-3">
                  <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-[#d7ffab]" />Location</span>
                  <span className="text-right font-medium text-white">
                    {selectedLocationName}
                    {showLocationDetail ? <span className="mt-1 block text-white/58">{selectedLocationDetail}</span> : null}
                  </span>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="surface-label">Offers & promo codes</p>
                  {appliedPromotion ? <Badge>Applied</Badge> : null}
                </div>
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
                    disabled={applyPromotionMutation.isPending || !resolvedLocationId || !resolvedServiceId || !isOnline}
                    onClick={() => void applyPromotion({ promotionCode: promotionCode.trim().toUpperCase() })}
                  >
                    {applyPromotionMutation.isPending ? "Applying..." : "Apply"}
                  </Button>
                </div>
                <div className="mt-4 space-y-2">
                  {(promotionsQuery.data?.promotions ?? []).slice(0, 2).map((promotion) => (
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
                    <p className="text-sm leading-7 text-white/52">No active offers for this booking.</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="surface-label">Rewards</p>
                  <Badge>{pointsBalance ? `${pointsBalance.unlockedPoints} pts` : "BVR Points"}</Badge>
                </div>
                {pointsBalanceQuery.error ? (
                  <div className="mt-4">
                    <FeedbackBanner tone="error" message={getReadableActionError(pointsBalanceQuery.error as BookingApiError)} />
                  </div>
                ) : null}
                <p className="mt-3 text-sm leading-7 text-white/62">
                  {pointsBalanceQuery.isLoading && !pointsBalance
                    ? "Checking your BVR Points..."
                    : pointsBalance?.unlockedPoints
                      ? `${pointsBalance.unlockedPoints} points available.`
                      : "No points available yet."}
                </p>
                {pointsRedemptionPreview.maxRedeemablePoints > 0 ? (
                  <div className="mt-4 rounded-[20px] border border-white/8 bg-black/18 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="surface-label block" htmlFor="bvr-points-redeem">Redeem points</label>
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
                      <span>{pointsRedemptionPreview.approvedPoints} pts applied</span>
                      <span className="text-[#d7ffab]">-{currency(pointsRedemptionPreview.discountAmount)}</span>
                    </div>
                  </div>
                ) : null}
                {pointsBlockedCopy ? (
                  <p className="mt-3 text-sm text-white/52">{pointsBlockedCopy}</p>
                ) : null}
              </div>

              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Contact</p>
                {hasClientName && hasClientPhone ? (
                  <div className="mt-3 space-y-1 text-sm leading-6 text-white/72">
                    <p className="font-medium text-white">{resolvedClientName}</p>
                    <p>{resolvedClientPhone}</p>
                    {profileClientEmail ? <p>{profileClientEmail}</p> : null}
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="surface-label mb-3 block">Name</label>
                      <Input {...form.register("clientName")} />
                      {form.formState.errors.clientName ? <p className="mt-2 text-sm text-rose-200">{form.formState.errors.clientName.message}</p> : null}
                    </div>
                    <div>
                      <label className="surface-label mb-3 block">Phone</label>
                      <Input type="tel" inputMode="tel" {...form.register("clientPhone")} />
                      {form.formState.errors.clientPhone ? <p className="mt-2 text-sm text-rose-200">{form.formState.errors.clientPhone.message}</p> : null}
                    </div>
                  </div>
                )}
              </div>

              <InlineBookingPaymentMethod
                paymentMethods={paymentMethods}
                selectedPaymentMethodId={selectedPaymentMethodId}
                selectedPaymentMethod={selectedPaymentMethod ?? null}
                totalDue={displayedQuote.grandTotal}
                isLoading={paymentMethodsQuery.isLoading && !paymentMethods.length}
                errorMessage={paymentMethodsError}
                onSelectPaymentMethod={setSelectedPaymentMethodId}
                onSavedPaymentMethod={(method) => {
                  setInlineSavedPaymentMethod(method);
                  setSelectedPaymentMethodId(method.id);
                }}
                onPendingChange={setPaymentSetupPending}
              />

              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Price breakdown</p>
                <div className="mt-4 space-y-3 text-sm text-white/72">
                  <div className="flex items-center justify-between gap-3">
                    <span>Subtotal</span>
                    <span className="font-medium text-white">{currency(displayedQuote.subtotal)}</span>
                  </div>
                  {displayedQuote.discountTotal > 0 || appliedPromotion ? (
                    <div className="flex items-center justify-between gap-3">
                      <span>Discount</span>
                      <span className="font-medium text-[#d7ffab]">-{currency(displayedQuote.discountTotal)}</span>
                    </div>
                  ) : null}
                  {membershipPricingAdjustment ? (
                    <div className="flex items-center justify-between gap-3">
                      <span>{membershipPricingAdjustment.label}</span>
                      <span className="font-medium text-[#d7ffab]">-{currency(membershipPricingAdjustment.discountAmount)}</span>
                    </div>
                  ) : null}
                  {displayedQuote.taxTotal > 0 ? (
                    <div className="flex items-center justify-between gap-3">
                      <span>Tax</span>
                      <span className="font-medium text-white">{currency(displayedQuote.taxTotal)}</span>
                    </div>
                  ) : null}
                  {pointsRedemptionPreview.discountAmount > 0 ? (
                    <div className="flex items-center justify-between gap-3">
                      <span>BVR Points</span>
                      <span className="font-medium text-[#d7ffab]">-{currency(pointsRedemptionPreview.discountAmount)}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-3">
                    <span className="font-semibold text-white">Total due today</span>
                    <span className="text-lg font-semibold text-[#d7ffab]">{currency(displayedQuote.grandTotal)}</span>
                  </div>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-[24px] border border-white/8 bg-black/20 p-5 text-sm leading-7 text-white/72">
                <input type="checkbox" className="mt-1 accent-[#7CFF00]" defaultChecked {...form.register("acknowledgePolicy")} />
                <span>I acknowledge the cancellation policy.</span>
              </label>
              {form.formState.errors.acknowledgePolicy ? (
                <p className="text-sm text-rose-200">{form.formState.errors.acknowledgePolicy.message}</p>
              ) : null}

              <div className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-10 -mx-1 flex flex-col gap-3 rounded-[24px] border border-white/10 bg-[rgba(7,7,7,0.94)] p-3 backdrop-blur sm:mx-0 sm:flex-row md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
                <Button type="button" variant="secondary" className="h-12 px-6" onClick={() => setBookingStep("time")}>
                  Back
                </Button>
                <Button className="h-12 px-6" disabled={bookingMutation.isPending || waitlistPending || isInitialLoading || paymentSetupPending || !reviewReady}>
                  {bookingMutation.isPending ? "Booking appointment..." : "Book Appointment"}
                </Button>
              </div>
            </section>
          ) : null}
        </form>
      </Card>

      <Card className="rounded-[34px] p-5 sm:p-6 lg:sticky lg:top-4">
        <p className="surface-label">Booking Summary</p>
        {isInitialLoading ? <Skeleton className="mt-4 h-12 w-48" /> : <h3 className="mt-4 text-3xl font-semibold" data-display="true">{currentService?.name ?? "Choose a service"}</h3>}
        {isInitialLoading ? <Skeleton className="mt-4 h-16 w-full" /> : <p className="mt-3 text-sm leading-7 text-white/64">{currentBarberResult ? `With ${clientFacingBarberName}` : "Select a barber and service to continue."}</p>}
        <div className="mt-5 grid gap-2 text-sm text-white/68">
          <div className="flex items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-black/20 px-4 py-3">
            <span>Date/time</span>
            <span className="text-right text-white">{selectedSlotLabel}</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-black/20 px-4 py-3">
            <span>Location</span>
            <span className="text-right text-white">
              {selectedLocationName}
              {showLocationDetail ? <span className="mt-1 block text-white/58">{selectedLocationDetail}</span> : null}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[20px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 px-4 py-3">
            <span>Total</span>
            <span className="text-right font-semibold text-[#d7ffab]">{currency(displayedQuote.grandTotal)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

