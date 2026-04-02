import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { demoAppointments, demoBarbers, demoClients, demoLocations, demoServices } from "@/lib/data/demo";
import { demoBarberProfiles } from "@/lib/data/marketplace";
import type { LiveOperationsSnapshot } from "@/lib/operations/live-state";
import type {
  BarberRetentionInsight,
  ClientBarberRecommendationView,
  ClientIntelligenceSnapshotRecord,
  EngagementState,
  IntelligenceRebookingWindow,
  IntelligenceRiskLevel,
  LocationIntelligenceSnapshotRecord,
  LoyaltySegment,
  ReturningClientInsight
} from "@/types/engagement";
import type { Appointment, Client } from "@/types/domain";

const DEFAULT_REFERENCE_TIME = "2026-03-09T12:00:00-05:00";
const ACTIVE_STATUSES = new Set<Appointment["status"]>(["booked", "checked_in", "in_service"]);

type ClientHistoryIntelligence = ClientIntelligenceSnapshotRecord & {
  lifetimeValue: number;
  daysSinceLastVisit?: number;
  daysUntilDue?: number;
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toDateValue(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function completedAt(appointment: Appointment) {
  return appointment.completedAt ?? appointment.end ?? appointment.start;
}

function addDays(iso: string, days: number) {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function daysBetween(leftIso: string, rightIso: string) {
  const left = new Date(leftIso).getTime();
  const right = new Date(rightIso).getTime();
  return Math.max(1, Math.round(Math.abs(right - left) / (24 * 60 * 60 * 1000)));
}

function diffInDays(fromIso: string, toIso: string) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function getReferenceTime(candidates: string[]) {
  return [...candidates, DEFAULT_REFERENCE_TIME].sort((left, right) => right.localeCompare(left))[0] ?? DEFAULT_REFERENCE_TIME;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function toRiskLabel(score: number): IntelligenceRiskLevel {
  if (score >= 70) {
    return "high";
  }

  if (score >= 45) {
    return "medium";
  }

  return "low";
}

function defaultCycleDaysForService(serviceId?: string) {
  if (serviceId === "srv-color") {
    return 28;
  }

  if (serviceId === "srv-razor") {
    return 21;
  }

  if (serviceId === "srv-membership") {
    return 30;
  }

  return 14;
}

function getClient(clientId: string, snapshot?: LiveOperationsSnapshot) {
  return snapshot?.clients.find((client) => client.id === clientId) ?? demoClients.find((client) => client.id === clientId);
}

function getClientAppointments(snapshot: LiveOperationsSnapshot | undefined, clientId: string) {
  return (snapshot?.appointments ?? demoAppointments).filter((appointment) => appointment.clientId === clientId);
}

function getBarberName(barberId?: string) {
  return barberId ? demoBarbers.find((barber) => barber.id === barberId)?.name : undefined;
}

function getLocationLabel(locationId?: string) {
  const location = locationId ? demoLocations.find((entry) => entry.id === locationId) : null;
  return location ? `${location.name} - ${location.neighborhood}` : undefined;
}

function getServiceName(serviceId?: string) {
  return serviceId ? demoServices.find((service) => service.id === serviceId)?.name : undefined;
}

function computeAverageCycleDays(completedAppointments: Appointment[], storedAverage?: number, serviceId?: string) {
  if (typeof storedAverage === "number" && storedAverage > 0) {
    return storedAverage;
  }

  if (completedAppointments.length >= 2) {
    const ascending = [...completedAppointments].sort((left, right) => new Date(completedAt(left)).getTime() - new Date(completedAt(right)).getTime());
    const gaps: number[] = [];

    for (let index = 1; index < ascending.length; index += 1) {
      gaps.push(daysBetween(completedAt(ascending[index - 1]), completedAt(ascending[index])));
    }

    if (gaps.length) {
      return Math.max(7, Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length));
    }
  }

  return defaultCycleDaysForService(serviceId ?? completedAppointments[completedAppointments.length - 1]?.serviceId);
}

function computeRebookingWindow(
  activeAppointmentCount: number,
  nextDueAt: string | undefined,
  referenceTime: string
): { window: IntelligenceRebookingWindow; daysUntilDue?: number } {
  if (activeAppointmentCount > 0) {
    return { window: "scheduled" };
  }

  if (!nextDueAt) {
    return { window: "building" };
  }

  const daysUntilDue = diffInDays(referenceTime, nextDueAt);
  if (daysUntilDue > 5) {
    return { window: "on_track", daysUntilDue };
  }

  if (daysUntilDue > 0) {
    return { window: "due_soon", daysUntilDue };
  }

  if (daysUntilDue >= -4) {
    return { window: "due_now", daysUntilDue };
  }

  return { window: "overdue", daysUntilDue };
}

function computeLoyaltySegment(client: Client, completedVisitCount: number, churnRisk: IntelligenceRiskLevel) {
  if (client.retentionTag === "vip" || client.loyaltyPoints >= 180 || completedVisitCount >= 6) {
    return "vip" satisfies LoyaltySegment;
  }

  if (completedVisitCount >= 4 || client.loyaltyPoints >= 90) {
    return "loyal" satisfies LoyaltySegment;
  }

  if (completedVisitCount >= 2 || client.retentionTag === "repeat") {
    return "repeat" satisfies LoyaltySegment;
  }

  if (churnRisk !== "low" && completedVisitCount > 0) {
    return "at_risk" satisfies LoyaltySegment;
  }

  return "new" satisfies LoyaltySegment;
}

function buildNextBestAction(params: {
  activeAppointmentCount: number;
  rebookingWindow: IntelligenceRebookingWindow;
  favoriteBarberId?: string;
  nextDueAt?: string;
  daysUntilDue?: number;
  completedVisitCount: number;
}) {
  const barberName = getBarberName(params.favoriteBarberId) ?? "your usual barber";

  if (params.activeAppointmentCount > 0) {
    return `You already have ${params.activeAppointmentCount} active appointment${params.activeAppointmentCount === 1 ? "" : "s"} keeping your chair rhythm intact.`;
  }

  if (params.rebookingWindow === "overdue") {
    return `You are past your usual refresh window. Rebook with ${barberName} this week to keep the same cadence.`;
  }

  if (params.rebookingWindow === "due_now") {
    return `Your next haircut window is open now. Reserve a chair with ${barberName} before the best slots disappear.`;
  }

  if (params.rebookingWindow === "due_soon") {
    const days = Math.max(1, params.daysUntilDue ?? 1);
    return `Book within the next ${days} day${days === 1 ? "" : "s"} to stay on your normal grooming rhythm.`;
  }

  if (params.completedVisitCount === 0) {
    return "Complete one visit and BVRB3R will tighten your next rebooking window automatically.";
  }

  if (params.nextDueAt) {
    return `Your cadence is healthy. Keep ${barberName} close for the next window around ${params.nextDueAt.slice(0, 10)}.`;
  }

  return `Keep ${barberName} close and the platform will keep sharpening your next-booking timing.`;
}

function buildExplanation(params: {
  completedVisitCount: number;
  averageCycleDays?: number;
  lastCompletedAt?: string;
  favoriteBarberId?: string;
  primaryServiceId?: string;
  rebookingWindow: IntelligenceRebookingWindow;
}) {
  const barberName = getBarberName(params.favoriteBarberId);
  const serviceName = getServiceName(params.primaryServiceId);

  if (!params.completedVisitCount || !params.lastCompletedAt || !params.averageCycleDays) {
    return "The intelligence lane is still learning this booking rhythm from completed visits, preferred barbers, and service patterns.";
  }

  const pieces = [
    `Based on ${params.completedVisitCount} completed visit${params.completedVisitCount === 1 ? "" : "s"}`,
    `and a ${params.averageCycleDays}-day cadence`
  ];

  if (barberName) {
    pieces.push(`with ${barberName}`);
  }

  if (serviceName) {
    pieces.push(`for ${serviceName}`);
  }

  pieces.push(`the current window is ${params.rebookingWindow.replaceAll("_", " ")}.`);
  return `${pieces.join(" ")} Last completed visit: ${params.lastCompletedAt.slice(0, 10)}.`;
}

function buildRecommendationReasons(params: {
  favoriteBarberId?: string;
  favoriteLocationId?: string;
  primaryServiceId?: string;
  rebookingWindow: IntelligenceRebookingWindow;
  averageCycleDays?: number;
}) {
  const reasons: string[] = [];

  if (params.averageCycleDays) {
    reasons.push(`Cadence signal: roughly every ${params.averageCycleDays} days.`);
  }

  if (params.favoriteBarberId) {
    reasons.push(`Preferred barber: ${getBarberName(params.favoriteBarberId) ?? params.favoriteBarberId}.`);
  }

  if (params.primaryServiceId) {
    reasons.push(`Service pattern: ${getServiceName(params.primaryServiceId) ?? params.primaryServiceId}.`);
  }

  if (params.favoriteLocationId) {
    reasons.push(`Preferred shop: ${getLocationLabel(params.favoriteLocationId) ?? params.favoriteLocationId}.`);
  }

  reasons.push(`Current rebooking window: ${params.rebookingWindow.replaceAll("_", " ")}.`);

  return reasons;
}

export function buildClientHistoryIntelligence(params: {
  client: Client;
  appointments: Appointment[];
  storedAverageCycleDays?: number;
  favoriteBarberId?: string;
  favoriteLocationId?: string;
  primaryServiceId?: string;
  updatedAt?: string;
}): ClientHistoryIntelligence {
  const referenceTime = getReferenceTime(params.appointments.map((appointment) => completedAt(appointment)));
  const completedAppointments = params.appointments
    .filter((appointment) => appointment.status === "completed")
    .sort((left, right) => new Date(completedAt(right)).getTime() - new Date(completedAt(left)).getTime());
  const activeAppointments = params.appointments.filter((appointment) => ACTIVE_STATUSES.has(appointment.status));
  const lastCompletedAt = completedAppointments[0] ? completedAt(completedAppointments[0]) : undefined;
  const frequencyByBarber = new Map<string, number>();
  const frequencyByLocation = new Map<string, number>();
  const frequencyByService = new Map<string, number>();
  let lifetimeValue = 0;

  completedAppointments.forEach((appointment) => {
    frequencyByBarber.set(appointment.barberId, (frequencyByBarber.get(appointment.barberId) ?? 0) + 1);
    frequencyByLocation.set(appointment.locationId, (frequencyByLocation.get(appointment.locationId) ?? 0) + 1);
    frequencyByService.set(appointment.serviceId, (frequencyByService.get(appointment.serviceId) ?? 0) + 1);
    lifetimeValue += appointment.totalAmount;
  });

  const rankedBarber = [...frequencyByBarber.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  const rankedLocation = [...frequencyByLocation.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  const rankedService = [...frequencyByService.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  const favoriteBarberId = params.favoriteBarberId ?? params.client.favoriteBarberId ?? rankedBarber;
  const favoriteLocationId = params.favoriteLocationId ?? rankedLocation;
  const primaryServiceId = params.primaryServiceId ?? rankedService;
  const averageCycleDays = lastCompletedAt
    ? computeAverageCycleDays(completedAppointments, params.storedAverageCycleDays, primaryServiceId)
    : undefined;
  const nextDueAt = lastCompletedAt && averageCycleDays ? addDays(lastCompletedAt, averageCycleDays) : undefined;
  const rebookingState = computeRebookingWindow(activeAppointments.length, nextDueAt, referenceTime);
  const daysSinceLastVisit = lastCompletedAt ? daysBetween(lastCompletedAt, referenceTime) : undefined;

  let churnScore = 12;
  if (lastCompletedAt && averageCycleDays) {
    const cadenceRatio = daysSinceLastVisit ? daysSinceLastVisit / averageCycleDays : 0;
    churnScore += cadenceRatio >= 2 ? 58 : cadenceRatio >= 1.45 ? 42 : cadenceRatio >= 1.1 ? 28 : 12;
  } else if (completedAppointments.length) {
    churnScore += 24;
  }

  if (params.client.retentionTag === "lapsed") {
    churnScore += 24;
  }

  if (params.client.retentionTag === "vip") {
    churnScore -= 12;
  }

  if (params.client.loyaltyPoints >= 120) {
    churnScore -= 8;
  }

  churnScore -= activeAppointments.length ? 26 : 0;
  churnScore = clamp(Math.round(churnScore), 0, 100);
  const churnRisk = toRiskLabel(churnScore);
  const loyaltySegment = computeLoyaltySegment(params.client, completedAppointments.length, churnRisk);
  const reengagementEligible = activeAppointments.length === 0 && ["due_soon", "due_now", "overdue"].includes(rebookingState.window);
  const nextBestAction = buildNextBestAction({
    activeAppointmentCount: activeAppointments.length,
    rebookingWindow: rebookingState.window,
    favoriteBarberId,
    nextDueAt,
    daysUntilDue: rebookingState.daysUntilDue,
    completedVisitCount: completedAppointments.length
  });
  const explanation = buildExplanation({
    completedVisitCount: completedAppointments.length,
    averageCycleDays,
    lastCompletedAt,
    favoriteBarberId,
    primaryServiceId,
    rebookingWindow: rebookingState.window
  });

  return {
    clientId: params.client.id,
    favoriteBarberId,
    favoriteLocationId,
    primaryServiceId,
    lastCompletedAt,
    nextDueAt,
    averageCycleDays,
    completedVisitCount: completedAppointments.length,
    repeatVisitCount: Math.max(0, completedAppointments.length - 1),
    activeAppointmentCount: activeAppointments.length,
    rebookingWindow: rebookingState.window,
    churnRisk,
    churnScore,
    reengagementEligible,
    loyaltySegment,
    nextBestAction,
    explanation,
    recommendationReasons: buildRecommendationReasons({
      favoriteBarberId,
      favoriteLocationId,
      primaryServiceId,
      rebookingWindow: rebookingState.window,
      averageCycleDays
    }),
    recommendedBarberId: favoriteBarberId,
    recommendedLocationId: favoriteLocationId,
    recommendedServiceId: primaryServiceId,
    updatedAt: params.updatedAt ?? referenceTime,
    lifetimeValue: round(lifetimeValue),
    daysSinceLastVisit,
    daysUntilDue: rebookingState.daysUntilDue
  };
}

export function buildClientBarberRecommendations(
  state: EngagementState,
  snapshot: LiveOperationsSnapshot | undefined,
  clientId: string,
  intelligence?: Pick<
    ClientIntelligenceSnapshotRecord,
    "favoriteBarberId" | "favoriteLocationId" | "updatedAt"
  >
) {
  const client = getClient(clientId, snapshot);
  if (!client) {
    return [] satisfies ClientBarberRecommendationView[];
  }

  const clientAppointments = getClientAppointments(snapshot, clientId);
  const signals = intelligence ?? buildClientHistoryIntelligence({
    client,
    appointments: clientAppointments,
    storedAverageCycleDays: state.rebookingCycles.find((cycle) => cycle.clientId === clientId)?.averageCycleDays
  });
  const followedBarberIds = new Set(state.barberFollows.filter((follow) => follow.clientId === clientId).map((follow) => follow.barberId));
  const visitCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();

  clientAppointments.filter((appointment) => appointment.status === "completed").forEach((appointment) => {
    visitCounts.set(appointment.barberId, (visitCounts.get(appointment.barberId) ?? 0) + 1);
    locationCounts.set(appointment.locationId, (locationCounts.get(appointment.locationId) ?? 0) + 1);
  });

  const referenceTime = signals.updatedAt;
  const candidates = unique([
    ...clientAppointments.map((appointment) => appointment.barberId),
    ...Array.from(followedBarberIds),
    signals.favoriteBarberId ?? "",
    ...demoBarbers.map((barber) => barber.id)
  ]);

  return candidates.map((barberId) => {
    const barber = demoBarbers.find((entry) => entry.id === barberId);
    const reputation = state.reputationScores.find((entry) => entry.barberId === barberId);
    const profile = demoBarberProfiles.find((entry) => entry.barberId === barberId);
    const visitCount = visitCounts.get(barberId) ?? 0;
    const sharesFavoriteShop = signals.favoriteLocationId
      ? barber?.locationIds.includes(signals.favoriteLocationId) ?? false
      : false;
    const nextAvailableAt = profile?.nextAvailableAt ?? undefined;
    const availabilityDate = toDateValue(nextAvailableAt);
    const availabilityBoost = availabilityDate
      ? (() => {
          const hoursUntil = (availabilityDate.getTime() - new Date(referenceTime).getTime()) / (60 * 60 * 1000);
          if (hoursUntil <= 24) {
            return 18;
          }

          if (hoursUntil <= 72) {
            return 12;
          }

          return 6;
        })()
      : 0;
    const score = round(
      (signals.favoriteBarberId === barberId ? 44 : 0)
      + (followedBarberIds.has(barberId) ? 22 : 0)
      + Math.min(visitCount * 12, 36)
      + (sharesFavoriteShop ? 12 : 0)
      + availabilityBoost
      + ((barber?.rating ?? 4.6) * 6)
      + Math.min((barber?.reviewCount ?? 0) / 12, 10)
      + ((reputation?.overallScore ?? 0) * 3)
    );
    let reason = "High marketplace trust with a viable next opening.";
    if (signals.favoriteBarberId === barberId) {
      reason = `${barber?.name ?? "This barber"} matches the strongest repeat-booking pattern in your history.`;
    } else if (followedBarberIds.has(barberId)) {
      reason = `${barber?.name ?? "This barber"} is already in your follow lane, so availability and portfolio updates stay close.`;
    } else if (visitCount > 0) {
      reason = `You already have ${visitCount} completed visit${visitCount === 1 ? "" : "s"} with ${barber?.name ?? "this barber"}.`;
    } else if (sharesFavoriteShop) {
      reason = `${barber?.name ?? "This barber"} is active at the shop you use most often.`;
    }

    return {
      barberId,
      barberName: barber?.name ?? barberId,
      username: profile?.username,
      nextAvailableAt,
      score,
      reason
    } satisfies ClientBarberRecommendationView;
  }).sort((left, right) => right.score - left.score || left.barberName.localeCompare(right.barberName)).slice(0, 3);
}

export function buildClientIntelligenceSnapshot(
  state: EngagementState,
  snapshot: LiveOperationsSnapshot | undefined,
  clientId: string
): ClientIntelligenceSnapshotRecord | null {
  const client = getClient(clientId, snapshot);
  if (!client) {
    return null;
  }

  const appointments = getClientAppointments(snapshot, clientId);
  const cycle = state.rebookingCycles.find((entry) => entry.clientId === clientId);
  const intelligence = buildClientHistoryIntelligence({
    client,
    appointments,
    storedAverageCycleDays: cycle?.averageCycleDays,
    favoriteBarberId: cycle?.barberId,
    primaryServiceId: cycle?.serviceId
  });
  const recommendedBarbers = buildClientBarberRecommendations(state, snapshot, clientId, intelligence);

  return {
    ...intelligence,
    recommendedBarberId: recommendedBarbers[0]?.barberId ?? intelligence.recommendedBarberId,
    recommendedLocationId: intelligence.favoriteLocationId,
    recommendedServiceId: intelligence.primaryServiceId
  };
}

function buildReturningClientInsight(client: Client, intelligence: ClientHistoryIntelligence): ReturningClientInsight {
  return {
    clientId: client.id,
    clientName: client.name,
    completedVisits: intelligence.completedVisitCount,
    lastVisitAt: intelligence.lastCompletedAt,
    lifetimeValue: intelligence.lifetimeValue,
    churnRisk: intelligence.churnRisk,
    loyaltySegment: intelligence.loyaltySegment
  };
}

export function buildLocationIntelligenceSnapshot(
  snapshot: LiveOperationsSnapshot | undefined,
  locationId: string
) {
  const scopedAppointments = (snapshot?.appointments ?? demoAppointments).filter((appointment) => appointment.locationId === locationId);
  const clientIds = unique(scopedAppointments.map((appointment) => appointment.clientId));
  const clientSignals = clientIds.map((clientId) => {
    const client = getClient(clientId, snapshot);
    if (!client) {
      return null;
    }

    const clientAppointments = scopedAppointments.filter((appointment) => appointment.clientId === clientId);
    return {
      client,
      intelligence: buildClientHistoryIntelligence({
        client,
        appointments: clientAppointments,
        updatedAt: getReferenceTime(scopedAppointments.map((appointment) => completedAt(appointment)))
      })
    };
  }).filter((entry): entry is { client: Client; intelligence: ClientHistoryIntelligence } => Boolean(entry));

  const repeatClientCount = clientSignals.filter((entry) => entry.intelligence.completedVisitCount >= 2).length;
  const loyalClientCount = clientSignals.filter((entry) => ["loyal", "vip"].includes(entry.intelligence.loyaltySegment)).length;
  const churnRiskClientCount = clientSignals.filter((entry) => entry.intelligence.churnRisk === "high").length;
  const reengagementEligibleCount = clientSignals.filter((entry) => entry.intelligence.reengagementEligible).length;
  const rebookingOpportunityCount = clientSignals.filter((entry) => ["due_soon", "due_now", "overdue"].includes(entry.intelligence.rebookingWindow) && entry.intelligence.activeAppointmentCount === 0).length;
  const completedServiceCount = scopedAppointments.filter((appointment) => appointment.status === "completed").length;
  const topReturningClients = clientSignals
    .map((entry) => buildReturningClientInsight(entry.client, entry.intelligence))
    .sort((left, right) => right.completedVisits - left.completedVisits || right.lifetimeValue - left.lifetimeValue)
    .slice(0, 5);

  const barberRetention = unique(scopedAppointments.map((appointment) => appointment.barberId)).map((barberId) => {
    const barberAppointments = scopedAppointments.filter((appointment) => appointment.barberId === barberId);
    const barberClientIds = unique(barberAppointments.map((appointment) => appointment.clientId));
    const clientEntries = clientSignals.filter((entry) => barberClientIds.includes(entry.client.id));

    return {
      barberId,
      barberName: getBarberName(barberId) ?? barberId,
      repeatClients: clientEntries.filter((entry) => entry.intelligence.completedVisitCount >= 2).length,
      atRiskClients: clientEntries.filter((entry) => entry.intelligence.churnRisk === "high").length,
      rebookingOpportunities: clientEntries.filter((entry) => ["due_soon", "due_now", "overdue"].includes(entry.intelligence.rebookingWindow) && entry.intelligence.activeAppointmentCount === 0).length,
      completedServices: barberAppointments.filter((appointment) => appointment.status === "completed").length
    } satisfies BarberRetentionInsight;
  }).sort((left, right) => right.rebookingOpportunities - left.rebookingOpportunities || right.repeatClients - left.repeatClients);

  return {
    locationId,
    repeatClientCount,
    loyalClientCount,
    churnRiskClientCount,
    reengagementEligibleCount,
    rebookingOpportunityCount,
    completedServiceCount,
    topReturningClients,
    barberRetention,
    updatedAt: getReferenceTime(scopedAppointments.map((appointment) => completedAt(appointment)))
  } satisfies LocationIntelligenceSnapshotRecord;
}

function getSupabase() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  return createSupabaseAdminClient();
}

export async function syncClientIntelligenceSnapshots(records: ClientIntelligenceSnapshotRecord[]) {
  const supabase = getSupabase();
  if (!supabase || !records.length) {
    return;
  }

  const result = await supabase.from("client_intelligence_snapshots").upsert(records.map((record) => ({
    client_reference: record.clientId,
    favorite_barber_reference: record.favoriteBarberId ?? null,
    favorite_location_reference: record.favoriteLocationId ?? null,
    primary_service_reference: record.primaryServiceId ?? null,
    last_completed_at: record.lastCompletedAt ?? null,
    next_due_at: record.nextDueAt ?? null,
    average_cycle_days: record.averageCycleDays ?? null,
    completed_visit_count: record.completedVisitCount,
    repeat_visit_count: record.repeatVisitCount,
    active_appointment_count: record.activeAppointmentCount,
    rebooking_window: record.rebookingWindow,
    churn_risk: record.churnRisk,
    churn_score: record.churnScore,
    reengagement_eligible: record.reengagementEligible,
    loyalty_segment: record.loyaltySegment,
    recommended_barber_reference: record.recommendedBarberId ?? null,
    recommended_location_reference: record.recommendedLocationId ?? null,
    recommended_service_reference: record.recommendedServiceId ?? null,
    next_best_action: record.nextBestAction,
    explanation: record.explanation,
    recommendation_reasons: record.recommendationReasons,
    signal_summary: {
      completedVisitCount: record.completedVisitCount,
      repeatVisitCount: record.repeatVisitCount,
      activeAppointmentCount: record.activeAppointmentCount
    },
    updated_at: record.updatedAt
  })), { onConflict: "client_reference" });

  if (result.error) {
    throw result.error;
  }
}

export async function syncLocationIntelligenceSnapshots(records: LocationIntelligenceSnapshotRecord[]) {
  const supabase = getSupabase();
  if (!supabase || !records.length) {
    return;
  }

  const result = await supabase.from("location_intelligence_snapshots").upsert(records.map((record) => ({
    location_reference: record.locationId,
    repeat_client_count: record.repeatClientCount,
    loyal_client_count: record.loyalClientCount,
    churn_risk_client_count: record.churnRiskClientCount,
    reengagement_eligible_count: record.reengagementEligibleCount,
    rebooking_opportunity_count: record.rebookingOpportunityCount,
    completed_service_count: record.completedServiceCount,
    top_returning_clients: record.topReturningClients,
    barber_retention: record.barberRetention,
    signal_summary: {
      repeatClientCount: record.repeatClientCount,
      loyalClientCount: record.loyalClientCount,
      churnRiskClientCount: record.churnRiskClientCount,
      reengagementEligibleCount: record.reengagementEligibleCount,
      rebookingOpportunityCount: record.rebookingOpportunityCount
    },
    updated_at: record.updatedAt
  })), { onConflict: "location_reference" });

  if (result.error) {
    throw result.error;
  }
}

export async function syncScopedEngagementIntelligence(
  state: EngagementState,
  snapshot: LiveOperationsSnapshot | undefined,
  locationIds: string[]
) {
  const scopedLocationIds = locationIds.length
    ? locationIds
    : unique((snapshot?.appointments ?? demoAppointments).map((appointment) => appointment.locationId));
  const clientIds = unique(
    (snapshot?.appointments ?? demoAppointments)
      .filter((appointment) => scopedLocationIds.includes(appointment.locationId))
      .map((appointment) => appointment.clientId)
  );
  const clientRecords = clientIds
    .map((clientId) => buildClientIntelligenceSnapshot(state, snapshot, clientId))
    .filter((record): record is ClientIntelligenceSnapshotRecord => Boolean(record));
  const locationRecords = scopedLocationIds.map((locationId) => buildLocationIntelligenceSnapshot(snapshot, locationId));

  await Promise.all([
    syncClientIntelligenceSnapshots(clientRecords),
    syncLocationIntelligenceSnapshots(locationRecords)
  ]);

  return {
    clientRecords,
    locationRecords
  };
}
