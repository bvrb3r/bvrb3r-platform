import { isUpcomingAppointmentStatus } from "@/lib/appointments/domain";
import { getBarberOverviewPayload } from "@/lib/barber/service";
import { getClientBookingsPayload, getClientHomePayload } from "@/lib/booking/platform-service";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  buildPlatformEventIdempotencyKey,
  queryPlatformEventsByEntity,
  recordPlatformEvent
} from "@/lib/core/platform-events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  AiNextLayerScaffold,
  BarberAiSummary,
  BarberGapAlertView,
  ClientAiSummary,
  ClientAvailableNowSuggestionView,
  ClientRebookingReminderView,
  TrackAiRecommendationInput
} from "@/types/ai";
import type { Service, UserAccount } from "@/types/domain";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type RebookingHistoryAppointment = NonNullable<Awaited<ReturnType<typeof getClientBookingsPayload>>["history"][number]>;
type RebookingRoutine = Awaited<ReturnType<typeof getClientBookingsPayload>>["routine"];
type HomePayload = Awaited<ReturnType<typeof getClientHomePayload>>;
type BarberOverviewPayload = Awaited<ReturnType<typeof getBarberOverviewPayload>>;
type ServiceCandidate = Pick<Service, "id" | "name" | "durationMin" | "displayOrder">;
type DerivedGapWindow = {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
};
type RecommendationActor = {
  actorId?: string | null;
  actorRole?: string | null;
};

const AVAILABLE_NOW_WINDOW_HOURS = 24;

export const AI_NEXT_LAYER_SCAFFOLD = {
  personalization: {
    status: "scaffolded",
    signalKeys: [
      "service_history",
      "completed_booking_cadence",
      "recommendation_outcomes"
    ],
    notes: [
      "Ready for preference ranking once recommendation outcomes accumulate.",
      "Keeps personalization grounded in canonical booking and service history."
    ]
  },
  pricingSuggestions: {
    status: "scaffolded",
    signalKeys: [
      "service_completion_mix",
      "gap_alert_outcomes",
      "payment_success_history"
    ],
    notes: [
      "Prepares a safe slot for future pricing guidance without exposing synthetic pricing today.",
      "Stays downstream of canonical payments and booking completion truth."
    ]
  },
  churnPrediction: {
    status: "scaffolded",
    signalKeys: [
      "rebooking_cadence",
      "booking_completion_history",
      "recommendation_suppression_history"
    ],
    notes: [
      "Leaves churn signals explainable and tied to repeatable history.",
      "Avoids model-style outputs until more live outcome data exists."
    ]
  }
} as const;

export class AiLayerServiceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "AiLayerServiceError";
  }
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

function cloneNextLayerScaffold(): AiNextLayerScaffold {
  return {
    personalization: {
      status: "scaffolded",
      signalKeys: [...AI_NEXT_LAYER_SCAFFOLD.personalization.signalKeys],
      notes: [...AI_NEXT_LAYER_SCAFFOLD.personalization.notes]
    },
    pricingSuggestions: {
      status: "scaffolded",
      signalKeys: [...AI_NEXT_LAYER_SCAFFOLD.pricingSuggestions.signalKeys],
      notes: [...AI_NEXT_LAYER_SCAFFOLD.pricingSuggestions.notes]
    },
    churnPrediction: {
      status: "scaffolded",
      signalKeys: [...AI_NEXT_LAYER_SCAFFOLD.churnPrediction.signalKeys],
      notes: [...AI_NEXT_LAYER_SCAFFOLD.churnPrediction.notes]
    }
  };
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function daysBetween(earlierIso: string, later = new Date()) {
  const earlier = new Date(earlierIso);
  if (Number.isNaN(earlier.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86_400_000));
}

function humanizeList(values: string[]) {
  if (!values.length) {
    return "";
  }

  if (values.length === 1) {
    return values[0]!;
  }

  if (values.length === 2) {
    return `${values[0]} or ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, or ${values[values.length - 1]}`;
}

function buildRecommendationId(parts: Array<string | number | null | undefined>) {
  return parts
    .filter((part) => part !== null && part !== undefined && `${part}`.trim().length > 0)
    .map((part) => `${part}`.trim().replace(/\s+/g, "-"))
    .join(":");
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function buildCadenceFromHistory(history: RebookingHistoryAppointment[]) {
  if (history.length < 3) {
    return null;
  }

  const intervals: number[] = [];
  for (let index = 0; index < Math.min(history.length - 1, 3); index += 1) {
    const current = history[index];
    const next = history[index + 1];
    if (!current || !next) {
      continue;
    }

    const gapDays = Math.round(
      (new Date(current.start).getTime() - new Date(next.start).getTime()) / 86_400_000
    );
    if (gapDays > 0) {
      intervals.push(gapDays);
    }
  }

  if (intervals.length < 2) {
    return null;
  }

  return Math.round(intervals.reduce((sum, value) => sum + value, 0) / intervals.length);
}

export function buildRebookingReminder(input: {
  clientId: string;
  nextAppointment: Awaited<ReturnType<typeof getClientBookingsPayload>>["nextAppointment"];
  history: RebookingHistoryAppointment[];
  routine: RebookingRoutine;
}): ClientRebookingReminderView | null {
  if (input.nextAppointment && isUpcomingAppointmentStatus(input.nextAppointment.status)) {
    return null;
  }

  const completedHistory = [...input.history]
    .filter((appointment) => appointment.status === "completed")
    .sort((left, right) => new Date(right.start).getTime() - new Date(left.start).getTime());

  const lastCompleted = completedHistory[0];
  if (!lastCompleted) {
    return null;
  }

  const cadenceDays = input.routine?.averageCycleDays ?? buildCadenceFromHistory(completedHistory);
  const cadenceSource = input.routine?.averageCycleDays ? "routine" as const : "history" as const;
  if (!cadenceDays || cadenceDays <= 0) {
    return null;
  }

  const daysSinceLastService = daysBetween(input.routine?.lastCompletedAt ?? lastCompleted.start);
  const leadWindow = Math.max(4, Math.min(7, Math.round(cadenceDays * 0.18)));
  const thresholdDays = Math.max(7, cadenceDays - leadWindow);
  if (daysSinceLastService < thresholdDays) {
    return null;
  }

  const serviceName = lastCompleted.view?.service?.name ?? lastCompleted.serviceSnapshot?.service_name ?? undefined;
  const barberName = lastCompleted.view?.barber?.name ?? undefined;

  return {
    recommendationId: buildRecommendationId([
      "rebooking",
      input.clientId,
      lastCompleted.id,
      cadenceDays
    ]),
    type: "rebooking_reminder",
    title: serviceName ? `Time to line up your next ${serviceName.toLowerCase()}.` : "Time to line up your next cut.",
    reason: `Last cut was ${daysSinceLastService} days ago. Your typical cadence is about ${cadenceDays} days.`,
    explanation: barberName
      ? `This reminder is based on your completed visit history with ${barberName}.`
      : "This reminder is based on your completed visit history only.",
    actionLabel: "Rebook now",
    cadenceSource,
    confidence: input.routine?.confidence ?? "measured",
    lastCompletedAt: input.routine?.lastCompletedAt ?? lastCompleted.start,
    daysSinceLastService,
    typicalCadenceDays: cadenceDays,
    barberName,
    serviceName,
    booking: {
      barberId: lastCompleted.barberId,
      locationId: lastCompleted.locationId,
      serviceId: lastCompleted.serviceId,
      sourceKind: "client_dashboard"
    }
  };
}

export function buildAvailableNowSuggestions(input: {
  home: HomePayload;
}): ClientAvailableNowSuggestionView[] {
  const match = input.home.nextAvailableChair;
  if (!match) {
    return [];
  }

  const startsAt = new Date(match.appointmentTime);
  const now = Date.now();
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= now) {
    return [];
  }

  const hoursAhead = (startsAt.getTime() - now) / 3_600_000;
  if (hoursAhead > AVAILABLE_NOW_WINDOW_HOURS) {
    return [];
  }

  const candidates = [
    ...(input.home.favoriteBarber ? [input.home.favoriteBarber] : []),
    ...input.home.trustedBarbers
  ];
  const eligible = candidates.find((candidate) => candidate.barberId === match.barberId);
  if (!eligible) {
    return [];
  }

  return [
    {
      recommendationId: buildRecommendationId([
        "available-now",
        match.barberId,
        match.locationId,
        match.appointmentTime
      ]),
      type: "available_now",
      title: `Open chair with ${match.barberName}.`,
      reason: `Next real opening is in ${Math.max(1, Math.round(hoursAhead))} hour${Math.round(hoursAhead) === 1 ? "" : "s"}.`,
      explanation: match.matchReason,
      actionLabel: "Book this chair",
      barberName: match.barberName,
      username: match.username,
      appointmentTime: match.appointmentTime,
      locationId: match.locationId,
      shopName: match.shopName ?? eligible.shopName,
      priceFrom: match.priceFrom,
      rating: match.rating,
      distanceMiles: eligible.distanceMiles,
      specialties: eligible.specialties,
      matchedFrom: match.matchedFrom,
      booking: {
        barberId: match.barberId,
        username: match.username,
        locationId: match.locationId,
        appointmentTime: match.appointmentTime,
        sourceKind: "haircut_now",
        matchedFrom: match.matchedFrom
      }
    }
  ];
}

export function deriveMeaningfulGapWindows(input: {
  businessDate: string;
  currentShopId: string | null;
  workingHours: BarberOverviewPayload["workingHours"];
  blockedTimes: BarberOverviewPayload["blockedTimes"];
  appointments: BarberOverviewPayload["todayAppointments"];
}): DerivedGapWindow[] {
  const weekday = new Date(`${input.businessDate}T12:00:00`).getDay();
  const workingRanges = input.workingHours
    .filter((entry) => entry.weekday === weekday && (!input.currentShopId || entry.locationId === input.currentShopId))
    .map((entry) => ({
      start: new Date(`${input.businessDate}T${entry.startTime}:00`).getTime(),
      end: new Date(`${input.businessDate}T${entry.endTime}:00`).getTime()
    }))
    .filter((entry) => entry.end > entry.start);

  const busyRanges = [
    ...input.appointments
      .filter((appointment) => !["cancelled", "no_show"].includes(appointment.status))
      .map((appointment) => ({
        start: new Date(appointment.start).getTime(),
        end: new Date(appointment.end).getTime()
      })),
    ...input.blockedTimes
      .filter((entry) => entry.startsAt.slice(0, 10) === input.businessDate || entry.endsAt.slice(0, 10) === input.businessDate)
      .map((entry) => ({
        start: new Date(entry.startsAt).getTime(),
        end: new Date(entry.endsAt).getTime()
      }))
  ]
    .filter((entry) => !Number.isNaN(entry.start) && !Number.isNaN(entry.end) && entry.end > entry.start)
    .sort((left, right) => left.start - right.start);

  const now = Date.now();
  const isToday = input.businessDate === new Date().toISOString().slice(0, 10);
  const gaps: DerivedGapWindow[] = [];

  for (const range of workingRanges) {
    let cursor = range.start;
    for (const busy of busyRanges) {
      if (busy.end <= range.start || busy.start >= range.end) {
        continue;
      }

      const overlapStart = Math.max(range.start, busy.start);
      if (overlapStart > cursor) {
        gaps.push({
          startsAt: new Date(cursor).toISOString(),
          endsAt: new Date(overlapStart).toISOString(),
          durationMinutes: Math.round((overlapStart - cursor) / 60_000)
        });
      }

      cursor = Math.max(cursor, Math.min(busy.end, range.end));
    }

    if (cursor < range.end) {
      gaps.push({
        startsAt: new Date(cursor).toISOString(),
        endsAt: new Date(range.end).toISOString(),
        durationMinutes: Math.round((range.end - cursor) / 60_000)
      });
    }
  }

  return gaps
    .filter((gap) => gap.durationMinutes > 0)
    .filter((gap) => !isToday || new Date(gap.endsAt).getTime() > now)
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
}

export function buildBarberGapAlerts(input: {
  barberId: string;
  businessDate: string;
  currentShopId: string | null;
  currentShopLabel: string | null;
  workingHours: BarberOverviewPayload["workingHours"];
  blockedTimes: BarberOverviewPayload["blockedTimes"];
  appointments: BarberOverviewPayload["todayAppointments"];
  services: ServiceCandidate[];
}): BarberGapAlertView[] {
  const meaningfulServices = [...input.services]
    .filter((service) => service.durationMin > 0)
    .sort((left, right) => left.durationMin - right.durationMin || (left.displayOrder ?? 0) - (right.displayOrder ?? 0));
  const minimumDuration = meaningfulServices[0]?.durationMin ?? null;
  if (!minimumDuration) {
    return [];
  }

  return deriveMeaningfulGapWindows({
    businessDate: input.businessDate,
    currentShopId: input.currentShopId,
    workingHours: input.workingHours,
    blockedTimes: input.blockedTimes,
    appointments: input.appointments
  })
    .filter((gap) => gap.durationMinutes >= Math.max(minimumDuration, 20))
    .map<BarberGapAlertView | null>((gap) => {
      const suggestedServices = meaningfulServices
        .filter((service) => service.durationMin <= gap.durationMinutes)
        .slice(0, 3);
      if (!suggestedServices.length) {
        return null;
      }

      const serviceNames = suggestedServices.map((service) => service.name);
      return {
        recommendationId: buildRecommendationId([
          "gap-alert",
          input.barberId,
          gap.startsAt,
          gap.endsAt
        ]),
        type: "barber_gap_alert" as const,
        title: `${gap.durationMinutes} open minutes on your calendar.`,
        reason: serviceNames.length === 1
          ? `This window is long enough for ${serviceNames[0]}.`
          : `This window is long enough for ${humanizeList(serviceNames)}.`,
        explanation: input.currentShopLabel
          ? `Live schedule, blocked time, and working hours show an unbooked window at ${input.currentShopLabel}.`
          : "Live schedule, blocked time, and working hours show an unbooked window large enough for a real service.",
        actionLabel: "Notify follow list",
        startsAt: gap.startsAt,
        endsAt: gap.endsAt,
        durationMinutes: gap.durationMinutes,
        locationId: input.currentShopId,
        locationLabel: input.currentShopLabel,
        suggestedServiceIds: suggestedServices.map((service) => service.id),
        suggestedServiceNames: serviceNames
      };
    })
    .filter(isDefined);
}

async function readServiceCandidates(supabase: SupabaseClient, barberId: string) {
  const result = await supabase
    .from("services")
    .select("reference_code, name, duration_min, display_order, active, is_bookable, barber_reference")
    .eq("barber_reference", barberId)
    .eq("active", true)
    .order("display_order", { ascending: true });

  if (result.error) {
    throw new AiLayerServiceError("Unable to read live services for AI signals.", 500);
  }

  return ((result.data ?? []) as Array<{
    reference_code: string | null;
    name: string;
    duration_min: number;
    display_order: number | null;
    active: boolean;
    is_bookable: boolean | null;
    barber_reference: string | null;
  }>)
    .filter((row) => row.active && row.is_bookable !== false)
    .map((row) => ({
      id: row.reference_code ?? row.name,
      name: row.name,
      durationMin: toNumber(row.duration_min),
      displayOrder: row.display_order ?? 0
    }));
}

async function readRecommendationHistory(supabase: SupabaseClient, recommendationId: string) {
  const result = await queryPlatformEventsByEntity(supabase, "ai_recommendation", recommendationId);
  if (result.error) {
    throw new AiLayerServiceError("Unable to read AI recommendation history.", 500);
  }

  return result.data ?? [];
}

async function filterSuppressedRecommendation<T extends { recommendationId: string }>(
  supabase: SupabaseClient,
  recommendation: T | null
) {
  if (!recommendation) {
    return null;
  }

  const history = await readRecommendationHistory(supabase, recommendation.recommendationId);
  const blocked = history.some((entry) =>
    entry.event_type === "ai_recommendation_converted" || entry.event_type === "ai_recommendation_suppressed"
  );
  return blocked ? null : recommendation;
}

async function filterSuppressedRecommendations<T extends { recommendationId: string }>(
  supabase: SupabaseClient,
  recommendations: T[]
) {
  const results = await Promise.all(recommendations.map((recommendation) => filterSuppressedRecommendation(supabase, recommendation)));
  return results.filter(isDefined);
}

async function recordRecommendationShownEvents(
  supabase: SupabaseClient,
  recommendations: Array<{ recommendationId: string; type: string; reason: string }>,
  surface: "client_home" | "barber_dashboard",
  actor: RecommendationActor
) {
  await Promise.all(recommendations.map((recommendation) =>
    recordPlatformEvent(supabase, {
      eventType: "ai_recommendation_shown",
      entityType: "ai_recommendation",
      entityId: recommendation.recommendationId,
      actorId: actor.actorId ?? null,
      actorRole: actor.actorRole ?? null,
      source: "api",
      relatedIds: {
        recommendationId: recommendation.recommendationId,
        surface
      },
      payload: {
        recommendationType: recommendation.type,
        reason: recommendation.reason,
        surface
      },
      idempotencyKey: buildPlatformEventIdempotencyKey([
        "ai",
        recommendation.recommendationId,
        "shown",
        surface
      ])
    })
  ));
}

export async function getClientAiSummary(input: {
  clientId?: string;
  actorId?: string | null;
  actorRole?: string | null;
}): Promise<ClientAiSummary> {
  const baseSummary: ClientAiSummary = {
    generatedAt: new Date().toISOString(),
    rebookingReminder: null,
    availableNowSuggestions: [],
    nextLayer: cloneNextLayerScaffold()
  };

  if (!input.clientId) {
    return baseSummary;
  }

  const supabase = getSupabase();
  if (!supabase) {
    return baseSummary;
  }

  const [home, bookings] = await Promise.all([
    getClientHomePayload(input.clientId),
    getClientBookingsPayload(input.clientId)
  ]);

  const rebookingReminder = await filterSuppressedRecommendation(
    supabase,
    buildRebookingReminder({
      clientId: input.clientId,
      nextAppointment: bookings.nextAppointment,
      history: bookings.history,
      routine: bookings.routine
    })
  );
  const availableNowSuggestions = await filterSuppressedRecommendations(
    supabase,
    buildAvailableNowSuggestions({ home })
  );

  const recommendations = [
    ...(rebookingReminder ? [rebookingReminder] : []),
    ...availableNowSuggestions
  ];
  void recordRecommendationShownEvents(
    supabase,
    recommendations.map((recommendation) => ({
      recommendationId: recommendation.recommendationId,
      type: recommendation.type,
      reason: recommendation.reason
    })),
    "client_home",
    input
  ).catch(() => undefined);

  return {
    generatedAt: new Date().toISOString(),
    rebookingReminder,
    availableNowSuggestions,
    nextLayer: cloneNextLayerScaffold()
  };
}

export async function getBarberAiSummary(input: {
  user: UserAccount;
}): Promise<BarberAiSummary> {
  const baseSummary: BarberAiSummary = {
    generatedAt: new Date().toISOString(),
    gapAlerts: [],
    nextLayer: cloneNextLayerScaffold()
  };

  const supabase = getSupabase();
  if (!supabase || !input.user.barberId) {
    return baseSummary;
  }

  const overview = await getBarberOverviewPayload(input.user);
  const services = await readServiceCandidates(supabase, input.user.barberId);
  const gapAlerts = await filterSuppressedRecommendations(
    supabase,
    buildBarberGapAlerts({
      barberId: input.user.barberId,
      businessDate: overview.summary.businessDate,
      currentShopId: overview.status.currentShopId,
      currentShopLabel: overview.status.currentShopLabel,
      workingHours: overview.workingHours,
      blockedTimes: overview.blockedTimes,
      appointments: overview.todayAppointments,
      services
    })
  );

  void recordRecommendationShownEvents(
    supabase,
    gapAlerts.map((recommendation) => ({
      recommendationId: recommendation.recommendationId,
      type: recommendation.type,
      reason: recommendation.reason
    })),
    "barber_dashboard",
    {
      actorId: input.user.id,
      actorRole: "barber"
    }
  ).catch(() => undefined);

  return {
    generatedAt: new Date().toISOString(),
    gapAlerts,
    nextLayer: cloneNextLayerScaffold()
  };
}

export async function trackAiRecommendation(input: TrackAiRecommendationInput & RecommendationActor) {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false };
  }

  const appointmentIdForKey = typeof input.relatedIds?.appointmentId === "string" || typeof input.relatedIds?.appointmentId === "number"
    ? input.relatedIds.appointmentId
    : null;

  return recordPlatformEvent(supabase, {
    eventType: input.action === "clicked"
      ? "ai_recommendation_clicked"
      : input.action === "converted"
        ? "ai_recommendation_converted"
        : "ai_recommendation_suppressed",
    entityType: "ai_recommendation",
    entityId: input.recommendationId,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    source: input.action === "converted" ? "api" : "ui",
    relatedIds: {
      recommendationId: input.recommendationId,
      surface: input.surface,
      ...(input.relatedIds ?? {})
    },
    payload: {
      recommendationType: input.recommendationType,
      action: input.action,
      surface: input.surface,
      ...(input.payload ?? {})
    },
    idempotencyKey: buildPlatformEventIdempotencyKey([
      "ai",
      input.recommendationId,
      input.action,
      input.surface,
      input.action === "converted" ? appointmentIdForKey : null
    ])
  });
}
