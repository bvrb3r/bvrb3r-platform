import { demoAppointments, demoBarbers, demoClients, demoLocations, demoUsers } from "@/lib/data/demo";
import { isScheduledAppointmentStatus } from "@/lib/appointments/domain";
import {
  demoBarberFollows,
  demoEngagementEvents,
  demoEngagementNotifications,
  demoGrowthRecommendations,
  demoLoyaltyAccounts,
  demoLoyaltyRewardRules,
  demoLoyaltyTransactions,
  demoNotificationPreferences,
  demoRankingSnapshots,
  demoReferralCodes,
  demoReferralEvents,
  demoRebookingCycles,
  demoRebookingRecommendations,
  demoReputationScores
} from "@/lib/data/engagement";
import { demoBarberProfiles } from "@/lib/data/marketplace";
import {
  buildClientBarberRecommendations,
  buildClientHistoryIntelligence,
  buildClientIntelligenceSnapshot,
  buildLocationIntelligenceSnapshot
} from "@/lib/engagement/intelligence";
import { isClientRole } from "@/lib/auth/roles";
import { buildEmptyOwnerMonetizationSummary } from "@/lib/monetization/domain";
import { appendEngagementNotification } from "@/lib/engagement/notifications";
import type { LiveOperationsSnapshot } from "@/lib/operations/live-state";
import type {
  BarberEngagementSummary,
  BarberFollowRecord,
  ClientAutomationSummary,
  ClientEngagementSummary,
  ClientReferralSummary,
  ClientRewardOption,
  EngagementEventRecord,
  EngagementEventType,
  EngagementState,
  LoyaltyAccountRecord,
  LoyaltyRewardRuleRecord,
  LoyaltyTransactionReason,
  OwnerAutomationSummary,
  OwnerIntelligenceSummary,
  RebookingCycleRecord,
  RebookingRecommendationRecord,
  ReferralEventRecord
} from "@/types/engagement";
import type { Appointment, Client, Role } from "@/types/domain";

const DEFAULT_REFERENCE_TIME = "2026-03-09T12:00:00-05:00";
const DEFAULT_REWARDS: Array<Omit<ClientRewardOption, "unlocked">> = [
  { id: "reward-add-on", title: "Premium add-on credit", pointsRequired: 120 },
  { id: "reward-discount", title: "15 dollars off your next visit", pointsRequired: 180 },
  { id: "reward-vip", title: "VIP early-booking access", pointsRequired: 260 }
];

const EVENT_POINTS: Partial<Record<EngagementEventType, number>> = {
  barber_reviewed: 15,
  service_completed: 25
};

const ALLOWED_EVENT_TYPES: Record<Role, readonly EngagementEventType[]> = {
  platform_admin: ["payout_released", "appointment_booked"],
  architect: ["payout_released", "appointment_booked"],
  shop_owner_user: ["payout_released", "appointment_booked"],
  owner: ["payout_released", "appointment_booked"],
  manager: ["appointment_booked"],
  front_desk: ["appointment_booked", "waitlist_joined"],
  barber_user: ["service_completed", "review_received", "profile_updated", "portfolio_updated", "booking_accepted", "payout_released"],
  barber: ["service_completed", "review_received", "profile_updated", "portfolio_updated", "booking_accepted", "payout_released"],
  freelance_barber: ["service_completed", "review_received", "profile_updated", "portfolio_updated", "booking_accepted", "payout_released"],
  commission_barber: ["service_completed", "review_received", "profile_updated", "portfolio_updated", "booking_accepted", "payout_released"],
  booth_rent_barber: ["service_completed", "review_received", "profile_updated", "portfolio_updated", "booking_accepted", "payout_released"],
  client_user: ["appointment_booked", "appointment_rebooked", "waitlist_joined", "barber_followed", "barber_reviewed", "reward_redeemed"],
  client: ["appointment_booked", "appointment_rebooked", "waitlist_joined", "barber_followed", "barber_reviewed", "reward_redeemed"]
};

export interface EngagementActor {
  role: Role;
  userEmail?: string;
  clientId?: string;
  barberId?: string;
  locationIds?: string[];
}

export interface RecordEngagementEventInput {
  eventType: EngagementEventType;
  targetType: EngagementEventRecord["targetType"];
  targetId: string;
  metadata?: Record<string, string | number | boolean | null>;
}

type ClientEngagementLoyaltyOverride = {
  pointsBalance: number;
  lifetimePoints?: number;
  referralCredits?: number;
};

export class EngagementPermissionError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = "EngagementPermissionError";
  }
}

export class EngagementValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "EngagementValidationError";
  }
}

export class EngagementNotFoundError extends Error {
  readonly status = 404;

  constructor(message: string) {
    super(message);
    this.name = "EngagementNotFoundError";
  }
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getLoyaltyTier(pointsBalance: number): LoyaltyAccountRecord["tier"] {
  if (pointsBalance >= 250) {
    return "elite";
  }

  if (pointsBalance >= 120) {
    return "vip";
  }

  return "core";
}

function sortByNewest<T extends { createdAt?: string; scheduledFor?: string; observedAt?: string; updatedAt?: string }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftValue = left.createdAt ?? left.scheduledFor ?? left.observedAt ?? left.updatedAt ?? "";
    const rightValue = right.createdAt ?? right.scheduledFor ?? right.observedAt ?? right.updatedAt ?? "";
    return rightValue.localeCompare(leftValue);
  });
}

function daysBetween(leftIso: string, rightIso: string) {
  const diff = Math.abs(new Date(leftIso).getTime() - new Date(rightIso).getTime());
  return Math.max(1, Math.round(diff / (24 * 60 * 60 * 1000)));
}

function addDays(iso: string, days: number) {
  const next = new Date(iso);
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

function getReferenceTime(candidates: string[]) {
  return [...candidates, DEFAULT_REFERENCE_TIME].sort((left, right) => right.localeCompare(left))[0] ?? DEFAULT_REFERENCE_TIME;
}

function isWithinDays(iso: string, referenceIso: string, days: number) {
  const diff = new Date(referenceIso).getTime() - new Date(iso).getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function getBarber(barberId: string) {
  return demoBarbers.find((barber) => barber.id === barberId);
}

function getClient(clientId: string, snapshot?: LiveOperationsSnapshot) {
  return snapshot?.clients.find((client) => client.id === clientId) ?? demoClients.find((client) => client.id === clientId);
}

function getBarberProfile(barberId: string) {
  return demoBarberProfiles.find((profile) => profile.barberId === barberId);
}

function getBarberEmail(barberId: string) {
  const barber = getBarber(barberId);
  return demoUsers.find((user) => user.id === barber?.userId)?.email ?? `${barberId}@bvrb3r.local`;
}

function buildReferralInviteLink(code: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    try {
      return new URL(`/r/${encodeURIComponent(code)}`, appUrl).toString();
    } catch {}
  }

  return `/r/${encodeURIComponent(code)}`;
}

function getReferralCodeForClient(state: EngagementState, clientId: string) {
  return state.referralCodes.find((code) => code.clientId === clientId && code.active);
}

function getAppointments(snapshot: LiveOperationsSnapshot | undefined, predicate?: (appointment: Appointment) => boolean) {
  const rows = snapshot?.appointments ?? demoAppointments;
  return predicate ? rows.filter(predicate) : rows;
}

function deriveFallbackCycle(clientId: string, appointments: Appointment[]): RebookingCycleRecord | null {
  const completed = appointments.filter((appointment) => appointment.status === "completed").sort((left, right) => left.start.localeCompare(right.start));
  if (!completed.length) {
    return null;
  }

  const gaps: number[] = [];
  for (let index = 1; index < completed.length; index += 1) {
    gaps.push(daysBetween(completed[index - 1].start, completed[index].start));
  }

  const averageCycleDays = gaps.length
    ? Math.max(7, Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length))
    : completed.some((appointment) => appointment.serviceId === "srv-color")
      ? 28
      : completed.some((appointment) => appointment.serviceId === "srv-razor")
        ? 21
        : 14;
  const lastCompletedAt = completed[completed.length - 1].end;

  return {
    id: `derived-cycle-${clientId}`,
    clientId,
    barberId: completed[completed.length - 1].barberId,
    serviceId: completed[completed.length - 1].serviceId,
    averageCycleDays,
    confidence: gaps.length >= 2 ? "high" : gaps.length === 1 ? "medium" : "low",
    lastCompletedAt,
    nextSuggestedAt: addDays(lastCompletedAt, averageCycleDays)
  };
}

function buildFallbackRecommendation(cycle: RebookingCycleRecord, client?: Client): RebookingRecommendationRecord {
  const barberName = cycle.barberId ? getBarber(cycle.barberId)?.name : undefined;
  return {
    id: `derived-recommendation-${cycle.clientId}`,
    clientId: cycle.clientId,
    barberId: cycle.barberId,
    serviceId: cycle.serviceId,
    message: barberName
      ? `${barberName} usually sees you every ${cycle.averageCycleDays} days. Your next refresh window is approaching.`
      : `${client?.name ?? "Your profile"} is approaching the next likely refresh window based on recent booking history.`,
    remindAt: addDays(cycle.nextSuggestedAt, -2),
    status: "suggested",
    reason: `Derived from ${cycle.confidence}-confidence cadence detection over recent completed visits.`,
    createdAt: new Date().toISOString()
  };
}

function getRecentEventsForClient(state: EngagementState, clientId: string) {
  return sortByNewest(
    state.engagementEvents.filter((event) => event.actorId === clientId || event.targetId === clientId)
  ).slice(0, 5);
}

function getRecentEventsForBarber(state: EngagementState, barberId: string) {
  return sortByNewest(
    state.engagementEvents.filter((event) => event.actorId === barberId || event.targetId === barberId)
  ).slice(0, 5);
}

function getRecentNotificationsForRole(state: EngagementState, role: Role, options: { userEmail?: string; clientId?: string; barberId?: string }) {
  return sortByNewest(
    state.notifications.filter((notification) => {
      if (notification.role !== role) {
        return false;
      }

      if (options.userEmail && notification.userEmail === options.userEmail) {
        return true;
      }

      if (options.clientId && notification.clientId === options.clientId) {
        return true;
      }

      if (options.barberId && notification.barberId === options.barberId) {
        return true;
      }

      return false;
    })
  ).slice(0, 4);
}

function buildRewards(pointsBalance: number) {
  return DEFAULT_REWARDS.map((reward) => ({
    ...reward,
    unlocked: pointsBalance >= reward.pointsRequired
  }));
}

function getRewardDefinition(rewardId?: string) {
  if (!rewardId) {
    return null;
  }

  return DEFAULT_REWARDS.find((reward) => reward.id === rewardId) ?? null;
}

function buildEmptyClientAutomationSummary(): ClientAutomationSummary {
  return {
    eligibleAutomationCount: 0,
    pendingRuns: 0,
    processingRuns: 0,
    retryScheduledRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    blockedRuns: 0,
    nextAutomation: undefined,
    recentRuns: []
  };
}

function buildEmptyOwnerAutomationSummary(): OwnerAutomationSummary {
  return {
    eligibleClients: 0,
    pendingRuns: 0,
    queuedRuns: 0,
    dueNowRuns: 0,
    processingRuns: 0,
    retryScheduledRuns: 0,
    retryDueRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    blockedRuns: 0,
    cancelledRuns: 0,
    retryCount: 0,
    backlogRuns: 0,
    completionRate: 0,
    failureRate: 0,
    rebookingReminderEligible: 0,
    reengagementEligible: 0,
    promotionEligible: 0,
    rewardEligible: 0,
    channelBreakdown: [],
    recentActivity: [],
    recentRuns: [],
    topPendingClients: []
  };
}

const REFERRAL_STATUS_ORDER: Record<ReferralEventRecord["status"], number> = {
  invited: 1,
  signed_up: 2,
  booked: 3,
  completed: 4,
  credited: 5
};

function hasReferralReachedStatus(current: ReferralEventRecord["status"], next: ReferralEventRecord["status"]) {
  return REFERRAL_STATUS_ORDER[current] >= REFERRAL_STATUS_ORDER[next];
}

function mergeReferralEvent(
  event: ReferralEventRecord,
  patch: Partial<ReferralEventRecord> & { status?: ReferralEventRecord["status"] }
) {
  const nextStatus = patch.status && !hasReferralReachedStatus(event.status, patch.status)
    ? patch.status
    : event.status;

  return {
    ...event,
    ...patch,
    status: nextStatus
  } satisfies ReferralEventRecord;
}

function upsertReferralEvent(state: EngagementState, nextEvent: ReferralEventRecord) {
  return {
    ...state,
    referralEvents: sortByNewest([
      nextEvent,
      ...state.referralEvents.filter((event) => event.id !== nextEvent.id)
    ])
  };
}

function getClientName(clientId: string, snapshot?: LiveOperationsSnapshot) {
  return getClient(clientId, snapshot)?.name ?? clientId;
}

function getFollowSuggestions(state: EngagementState, client: Client) {
  const followedIds = new Set(state.barberFollows.filter((follow) => follow.clientId === client.id).map((follow) => follow.barberId));
  const candidates = demoBarbers.filter((barber) => !followedIds.has(barber.id));

  const ranked = candidates.sort((left, right) => {
    const leftFavoriteBoost = left.id === client.favoriteBarberId ? 1 : 0;
    const rightFavoriteBoost = right.id === client.favoriteBarberId ? 1 : 0;
    if (leftFavoriteBoost !== rightFavoriteBoost) {
      return rightFavoriteBoost - leftFavoriteBoost;
    }

    return right.rating - left.rating;
  });

  return ranked.slice(0, 3).map((barber) => ({
    barberId: barber.id,
    barberName: barber.name,
    username: getBarberProfile(barber.id)?.username,
    reason: barber.id === client.favoriteBarberId ? "Follow your favorite barber for faster rebooking and availability alerts." : `Track ${barber.name}'s openings and portfolio activity.`
  }));
}

function upsertLoyaltyAccount(accounts: LoyaltyAccountRecord[], clientId: string, pointsDelta: number, reason: LoyaltyTransactionReason) {
  const existing = accounts.find((account) => account.clientId === clientId);
  if (existing) {
    return accounts.map((account) => {
      if (account.clientId !== clientId) {
        return account;
      }

      const nextBalance = Math.max(0, account.pointsBalance + pointsDelta);
      return {
        ...account,
        pointsBalance: nextBalance,
        lifetimePoints: pointsDelta > 0 ? account.lifetimePoints + pointsDelta : account.lifetimePoints,
        referralCredits: reason === "referral" ? account.referralCredits + 1 : account.referralCredits,
        updatedAt: new Date().toISOString(),
        tier: getLoyaltyTier(nextBalance)
      };
    });
  }

  const nextBalance = Math.max(0, pointsDelta);
  return [
    ...accounts,
    {
      id: `loyalty-${clientId}`,
      clientId,
      pointsBalance: nextBalance,
      lifetimePoints: pointsDelta > 0 ? pointsDelta : 0,
      referralCredits: reason === "referral" ? 1 : 0,
      tier: getLoyaltyTier(nextBalance),
      updatedAt: new Date().toISOString()
    }
  ];
}

function addLoyaltyTransaction(
  state: EngagementState,
  clientId: string,
  reason: LoyaltyTransactionReason,
  pointsDelta: number,
  label: string,
  referenceId?: string
) {
  const transaction = {
    id: createId("loyalty-txn"),
    clientId,
    reason,
    pointsDelta,
    label,
    referenceId,
    createdAt: new Date().toISOString()
  };

  return {
    state: {
      ...state,
      loyaltyAccounts: upsertLoyaltyAccount(state.loyaltyAccounts, clientId, pointsDelta, reason),
      loyaltyTransactions: sortByNewest([transaction, ...state.loyaltyTransactions])
    },
    transaction
  };
}

function getActiveRewardRules(
  state: EngagementState,
  triggerEvent: LoyaltyRewardRuleRecord["triggerEvent"]
) {
  return state.loyaltyRewardRules
    .filter((rule) => rule.active && rule.triggerEvent === triggerEvent)
    .sort((left, right) => left.thresholdCount - right.thresholdCount || left.ruleCode.localeCompare(right.ruleCode));
}

type CompletedBookingHistoryItem = {
  appointmentId: string;
  completedAt: string;
};

function awardLoyaltyRuleTransactions(
  state: EngagementState,
  input: {
    clientId: string;
    appointmentId: string;
    completedAt: string;
    completedBookingHistory: CompletedBookingHistoryItem[];
    activeMembership: boolean;
  }
) {
  let nextState = state;
  const currentCompletionCount = input.completedBookingHistory.length;
  const sortedHistory = [...input.completedBookingHistory].sort((left, right) => left.completedAt.localeCompare(right.completedAt));
  const previousCompletion = [...sortedHistory].reverse().find((entry) => entry.appointmentId !== input.appointmentId);
  const daysSinceLastCompletion = previousCompletion
    ? daysBetween(previousCompletion.completedAt, input.completedAt)
    : undefined;

  for (const rule of getActiveRewardRules(state, "completed_booking")) {
    if (rule.requiresActiveMembership && !input.activeMembership) {
      continue;
    }

    if (currentCompletionCount < rule.thresholdCount) {
      continue;
    }

    if (typeof rule.everyNthCount === "number" && currentCompletionCount % rule.everyNthCount !== 0) {
      continue;
    }

    if (typeof rule.minDaysSinceLastCompletion === "number" && (daysSinceLastCompletion ?? 0) < rule.minDaysSinceLastCompletion) {
      continue;
    }

    const referenceId = `${input.appointmentId}:${rule.ruleCode}`;
    if (nextState.loyaltyTransactions.some((transaction) => transaction.referenceId === referenceId)) {
      continue;
    }

    nextState = addLoyaltyTransaction(
      nextState,
      input.clientId,
      "behavior_reward",
      rule.pointsDelta,
      rule.title,
      referenceId
    ).state;

    nextState = appendEngagementNotification(nextState, {
      role: "client_user",
      clientId: input.clientId,
      userEmail: getClient(input.clientId)?.email ?? `${input.clientId}@client.bvrb3r.local`,
      type: "loyalty_milestone",
      title: rule.title,
      body: `You unlocked ${rule.pointsDelta} bonus points through ${rule.metadata.reason ?? "your recent behavior"}.`,
      dedupeSeed: `loyalty-rule:${referenceId}`
    }).state;
  }

  return nextState;
}

export function createInitialEngagementState(): EngagementState {
  return cloneState({
    loyaltyAccounts: demoLoyaltyAccounts,
    loyaltyTransactions: demoLoyaltyTransactions,
    loyaltyRewardRules: demoLoyaltyRewardRules,
    referralCodes: demoReferralCodes,
    referralEvents: demoReferralEvents,
    barberFollows: demoBarberFollows,
    engagementEvents: demoEngagementEvents,
    rebookingCycles: demoRebookingCycles,
    rebookingRecommendations: demoRebookingRecommendations,
    notificationPreferences: demoNotificationPreferences,
    notifications: demoEngagementNotifications,
    reputationScores: demoReputationScores,
    rankingSnapshots: demoRankingSnapshots,
    growthRecommendations: demoGrowthRecommendations
  });
}

export function createEmptyEngagementState(): EngagementState {
  return {
    loyaltyAccounts: [],
    loyaltyTransactions: [],
    loyaltyRewardRules: [],
    referralCodes: [],
    referralEvents: [],
    barberFollows: [],
    engagementEvents: [],
    rebookingCycles: [],
    rebookingRecommendations: [],
    notificationPreferences: [],
    notifications: [],
    reputationScores: [],
    rankingSnapshots: [],
    growthRecommendations: []
  };
}

export function getClientEngagementSummary(
  state: EngagementState,
  snapshot: LiveOperationsSnapshot | undefined,
  clientId: string,
  loyaltyOverride?: ClientEngagementLoyaltyOverride
): ClientEngagementSummary {
  const client = getClient(clientId, snapshot);
  if (!client) {
    throw new EngagementNotFoundError("Client engagement profile could not be found.");
  }

  const clientAppointments = getAppointments(snapshot, (appointment) => appointment.clientId === clientId);
  const loyaltyAccount = state.loyaltyAccounts.find((account) => account.clientId === clientId) ?? {
    id: `loyalty-${clientId}`,
    clientId,
    pointsBalance: client.loyaltyPoints,
    lifetimePoints: client.loyaltyPoints,
    referralCredits: 0,
    tier: getLoyaltyTier(client.loyaltyPoints),
    updatedAt: DEFAULT_REFERENCE_TIME
  } satisfies LoyaltyAccountRecord;
  const clientIntelligence = buildClientIntelligenceSnapshot(state, snapshot, clientId) ?? buildClientHistoryIntelligence({
    client,
    appointments: clientAppointments
  });
  const rebookingCycle = state.rebookingCycles.find((cycle) => cycle.clientId === clientId) ?? deriveFallbackCycle(clientId, clientAppointments);
  const rebookingRecommendation = state.rebookingRecommendations.find((recommendation) => recommendation.clientId === clientId) ?? (
    rebookingCycle
      ? {
          ...buildFallbackRecommendation(rebookingCycle, client),
          message: clientIntelligence.nextBestAction,
          reason: clientIntelligence.explanation
        }
      : null
  );
  const follows = state.barberFollows.filter((follow) => follow.clientId === clientId);
  const pointsBalance = loyaltyOverride?.pointsBalance ?? loyaltyAccount.pointsBalance;
  const lifetimePoints = loyaltyOverride?.lifetimePoints ?? loyaltyAccount.lifetimePoints;
  const referralCredits = loyaltyOverride?.referralCredits ?? loyaltyAccount.referralCredits;

  return {
    clientId,
    pointsBalance,
    lifetimePoints,
    tier: getLoyaltyTier(pointsBalance),
    referralCredits,
    completedBookings: clientAppointments.filter((appointment) => appointment.status === "completed").length,
    favoriteBarberName: client.favoriteBarberId ? getBarber(client.favoriteBarberId)?.name : undefined,
    rebookingRecommendation,
    intelligence: clientIntelligence,
    recommendedBarbers: buildClientBarberRecommendations(state, snapshot, clientId, clientIntelligence),
    followedBarbers: follows.map((follow) => ({
      barberId: follow.barberId,
      barberName: getBarber(follow.barberId)?.name ?? follow.barberId,
      username: getBarberProfile(follow.barberId)?.username,
      nextAvailableAt: getBarberProfile(follow.barberId)?.nextAvailableAt,
      notifyOnAvailability: follow.notifyOnAvailability
    })),
    followSuggestions: getFollowSuggestions(state, client),
    rewards: buildRewards(pointsBalance),
    referralCode: state.referralCodes.find((code) => code.clientId === clientId),
    recentTransactions: sortByNewest(state.loyaltyTransactions.filter((transaction) => transaction.clientId === clientId)).slice(0, 4),
    recentNotifications: getRecentNotificationsForRole(state, "client", { clientId, userEmail: client.email }),
    recentEvents: getRecentEventsForClient(state, clientId),
    automation: buildEmptyClientAutomationSummary()
  };
}

export function getClientReferralSummary(state: EngagementState, clientId: string): ClientReferralSummary {
  const referralCode = getReferralCodeForClient(state, clientId);
  const recentReferrals = sortByNewest(state.referralEvents.filter((event) => event.referrerClientId === clientId)).slice(0, 6);
  const totals = {
    invited: recentReferrals.filter((event) => event.status === "invited").length,
    signedUp: recentReferrals.filter((event) => event.status === "signed_up").length,
    booked: recentReferrals.filter((event) => event.status === "booked").length,
    completed: recentReferrals.filter((event) => event.status === "completed").length,
    credited: recentReferrals.filter((event) => event.status === "credited").length,
    rewardPointsEarned: recentReferrals.filter((event) => event.status === "credited").reduce((sum, event) => sum + event.rewardPoints, 0)
  };

  return {
    clientId,
    referralCode,
    inviteLink: buildReferralInviteLink(referralCode?.code ?? "BVRB3R"),
    shareMessage: referralCode
      ? `Book through BVRB3R with my code ${referralCode.code} and step into the marketplace with a premium first visit.`
      : "Join me on BVRB3R and book your next barber through the marketplace.",
    totals,
    recentReferrals
  };
}

function getRevenueRows(snapshot: LiveOperationsSnapshot | undefined, barberId: string) {
  const compensationRows = snapshot?.compensationSnapshots.filter((entry) => entry.barberReference === barberId) ?? [];
  if (compensationRows.length) {
    return compensationRows.map((row) => ({
      amount: row.grossServiceAmount,
      tipAmount: row.tipAmount,
      createdAt: row.capturedAt,
      clientId: row.clientReference
    }));
  }

  return getAppointments(snapshot, (appointment) => appointment.barberId === barberId && appointment.status === "completed").map((appointment) => ({
    amount: appointment.totalAmount,
    tipAmount: appointment.tipAmount,
    createdAt: appointment.end,
    clientId: appointment.clientId
  }));
}

export function getBarberEngagementSummary(state: EngagementState, snapshot: LiveOperationsSnapshot | undefined, barberId: string): BarberEngagementSummary {
  const barber = getBarber(barberId);
  if (!barber) {
    throw new EngagementNotFoundError("Barber engagement profile could not be found.");
  }

  const appointments = getAppointments(snapshot, (appointment) => appointment.barberId === barberId);
  const completedAppointments = appointments.filter((appointment) => appointment.status === "completed");
  const revenueRows = getRevenueRows(snapshot, barberId);
  const referenceTime = getReferenceTime(revenueRows.map((row) => row.createdAt));
  const uniqueClientIds = unique(appointments.map((appointment) => appointment.clientId));
  const repeatClients = uniqueClientIds.filter((clientRef) => appointments.filter((appointment) => appointment.clientId === clientRef).length > 1).length;
  const servedClients = uniqueClientIds.map((clientRef) => getClient(clientRef, snapshot)).filter((client): client is Client => Boolean(client));
  const clientSignals = servedClients.map((client) => {
    const clientAppointments = appointments.filter((appointment) => appointment.clientId === client.id);
    const intelligence = buildClientHistoryIntelligence({
      client,
      appointments: clientAppointments,
      favoriteBarberId: barberId
    });
    return {
      client,
      intelligence,
      lifetimeValue: round(clientAppointments.filter((appointment) => appointment.status === "completed").reduce((sum, appointment) => sum + appointment.totalAmount, 0))
    };
  });
  const tipByClient = new Map<string, number>();

  revenueRows.forEach((row) => {
    tipByClient.set(row.clientId, (tipByClient.get(row.clientId) ?? 0) + row.tipAmount);
  });

  const highestTipper = [...tipByClient.entries()].sort((left, right) => right[1] - left[1])[0];
  const highestTipperName = highestTipper ? getClient(highestTipper[0], snapshot)?.name : undefined;
  const reputation = state.reputationScores.find((score) => score.barberId === barberId) ?? null;
  const rankings = state.rankingSnapshots
    .filter((snapshotRow) => snapshotRow.barberId === barberId)
    .sort((left, right) => left.rankPosition - right.rankPosition || left.label.localeCompare(right.label));

  return {
    barberId,
    followerCount: state.barberFollows.filter((follow) => follow.barberId === barberId).length,
    earnings: {
      today: round(revenueRows.filter((row) => row.createdAt.slice(0, 10) === referenceTime.slice(0, 10)).reduce((sum, row) => sum + row.amount, 0)),
      week: round(revenueRows.filter((row) => isWithinDays(row.createdAt, referenceTime, 7)).reduce((sum, row) => sum + row.amount, 0)),
      month: round(revenueRows.filter((row) => isWithinDays(row.createdAt, referenceTime, 30)).reduce((sum, row) => sum + row.amount, 0)),
      averageTip: revenueRows.length ? round(revenueRows.reduce((sum, row) => sum + row.tipAmount, 0) / revenueRows.length) : 0
    },
    socialProof: {
      rating: barber.rating,
      reviewCount: barber.reviewCount,
      cutsCompleted: completedAppointments.length,
      trendingBadge: rankings.find((row) => row.rankPosition <= 2)?.label
    },
    clientInsights: {
      repeatClients,
      retentionRate: servedClients.length
        ? Math.round((servedClients.filter((client) => client.retentionTag === "repeat" || client.retentionTag === "vip").length / servedClients.length) * 100)
        : 0,
      returningClientsNeedingAttention: clientSignals.filter((entry) => entry.intelligence.reengagementEligible || entry.intelligence.churnRisk === "high").length,
      highestTipperName,
      averageTip: revenueRows.length ? round(revenueRows.reduce((sum, row) => sum + row.tipAmount, 0) / revenueRows.length) : 0,
      topReturningClients: clientSignals
        .filter((entry) => entry.intelligence.completedVisitCount >= 2)
        .map((entry) => ({
          clientId: entry.client.id,
          clientName: entry.client.name,
          completedVisits: entry.intelligence.completedVisitCount,
          lastVisitAt: entry.intelligence.lastCompletedAt,
          lifetimeValue: entry.lifetimeValue,
          churnRisk: entry.intelligence.churnRisk,
          loyaltySegment: entry.intelligence.loyaltySegment
        }))
        .sort((left, right) => right.completedVisits - left.completedVisits || right.lifetimeValue - left.lifetimeValue)
        .slice(0, 4)
    },
    reputation,
    rankings,
    growthRecommendations: sortByNewest(state.growthRecommendations.filter((recommendation) => recommendation.barberId === barberId)).slice(0, 3),
    recentEvents: getRecentEventsForBarber(state, barberId),
    marketplace: {
      profileViews: 0,
      bookingClicks: 0,
      bookingsCreated: 0,
      bookingsCompleted: 0,
      conversionRate: 0,
      shareCount: 0
    }
  };
}

export function getOwnerIntelligenceSummary(
  state: EngagementState,
  snapshot: LiveOperationsSnapshot | undefined,
  locationIds: string[],
  viewer?: { role: Role; userEmail?: string }
): OwnerIntelligenceSummary {
  const scopedLocationIds = locationIds.length ? locationIds : demoLocations.map((location) => location.id);
  const appointments = getAppointments(snapshot, (appointment) => scopedLocationIds.includes(appointment.locationId));
  const analyticsRows = (snapshot?.ownerAnalytics ?? []).filter((row) => scopedLocationIds.includes(row.locationReference));
  const compensationRows = (snapshot?.compensationSnapshots ?? []).filter((row) => scopedLocationIds.includes(row.locationReference));
  const referenceTime = getReferenceTime(analyticsRows.map((row) => `${row.businessDate}T23:59:59.000Z`));
  const currentBusinessDate = referenceTime.slice(0, 10);
  const activeBarberIds = unique(appointments.map((appointment) => appointment.barberId));
  const clientIds = unique(appointments.map((appointment) => appointment.clientId));
  const relevantClients = clientIds.map((clientId) => getClient(clientId, snapshot)).filter((client): client is Client => Boolean(client));
  const clientSignals = relevantClients.map((client) => {
    const clientAppointments = appointments.filter((appointment) => appointment.clientId === client.id);
    const intelligence = buildClientHistoryIntelligence({
      client,
      appointments: clientAppointments,
      updatedAt: referenceTime
    });
    return {
      client,
      intelligence,
      lifetimeValue: round(clientAppointments.filter((appointment) => appointment.status === "completed").reduce((sum, appointment) => sum + appointment.totalAmount, 0))
    };
  });
  const locationSignals = scopedLocationIds.map((locationId) => buildLocationIntelligenceSnapshot(snapshot, locationId));
  const totalChairs = demoLocations.filter((location) => scopedLocationIds.includes(location.id)).reduce((sum, location) => sum + location.chairs, 0);
  const bookingsEventCount = state.engagementEvents.filter((event) => event.eventType === "appointment_booked").length + appointments.filter((appointment) => isScheduledAppointmentStatus(appointment.status)).length;
  const rebookEventCount = state.engagementEvents.filter((event) => event.eventType === "appointment_rebooked").length;
  const loyaltyUsageCount = state.loyaltyTransactions.filter((transaction) => clientIds.includes(transaction.clientId) && transaction.pointsDelta < 0).length;
  const referralConversions = state.referralEvents.filter((event) => clientIds.includes(event.referrerClientId) && (event.status === "completed" || event.status === "credited")).length;
  const completedServices = analyticsRows.filter((row) => row.businessDate === currentBusinessDate).reduce((sum, row) => sum + row.completedServicesCount, 0);
  const revenue = analyticsRows.filter((row) => row.businessDate === currentBusinessDate).reduce((sum, row) => sum + row.revenueTotal, 0);
  const topBarbers = activeBarberIds
    .map((barberId) => ({
      barberId,
      barberName: getBarber(barberId)?.name ?? barberId,
      followerCount: state.barberFollows.filter((follow) => follow.barberId === barberId).length,
      reputationScore: state.reputationScores.find((score) => score.barberId === barberId)?.overallScore ?? 0,
      revenue: round(compensationRows.filter((row) => row.barberReference === barberId).reduce((sum, row) => sum + row.grossServiceAmount, 0))
    }))
    .sort((left, right) => right.revenue - left.revenue || right.reputationScore - left.reputationScore)
    .slice(0, 4);
  const rebookingRecommendationCount = state.rebookingRecommendations.filter((recommendation) => clientIds.includes(recommendation.clientId)).length;
  const barberRetentionMap = new Map<string, {
    barberId: string;
    barberName: string;
    repeatClients: number;
    atRiskClients: number;
    rebookingOpportunities: number;
    completedServices: number;
  }>();

  locationSignals.forEach((locationSignal) => {
    locationSignal.barberRetention.forEach((row) => {
      const current = barberRetentionMap.get(row.barberId);
      if (!current) {
        barberRetentionMap.set(row.barberId, { ...row });
        return;
      }

      current.repeatClients += row.repeatClients;
      current.atRiskClients += row.atRiskClients;
      current.rebookingOpportunities += row.rebookingOpportunities;
      current.completedServices += row.completedServices;
    });
  });

  return {
    assignedLocationIds: scopedLocationIds,
    network: {
      revenue: round(revenue),
      chairUtilization: totalChairs ? Math.min(100, Math.round((completedServices / (totalChairs * 4)) * 100)) : 0,
      activeBarbers: activeBarberIds.length,
      completedServices
    },
    retention: {
      repeatClientRate: relevantClients.length
        ? Math.round((relevantClients.filter((client) => client.retentionTag === "repeat" || client.retentionTag === "vip").length / relevantClients.length) * 100)
        : 0,
      loyaltyParticipants: state.loyaltyAccounts.filter((account) => clientIds.includes(account.clientId)).length,
      loyaltyPointsIssued: state.loyaltyTransactions.filter((transaction) => clientIds.includes(transaction.clientId) && transaction.pointsDelta > 0).reduce((sum, transaction) => sum + transaction.pointsDelta, 0),
      referralConversions,
      rebookingEffectiveness: rebookingRecommendationCount ? Math.round((rebookEventCount / rebookingRecommendationCount) * 100) : 0,
      churnRiskClients: clientSignals.filter((entry) => entry.intelligence.churnRisk === "high").length,
      reengagementEligibleClients: clientSignals.filter((entry) => entry.intelligence.reengagementEligible).length,
      rebookingOpportunities: clientSignals.filter((entry) => ["due_soon", "due_now", "overdue"].includes(entry.intelligence.rebookingWindow) && entry.intelligence.activeAppointmentCount === 0).length,
      loyalClients: clientSignals.filter((entry) => ["loyal", "vip"].includes(entry.intelligence.loyaltySegment)).length
    },
    bookingTrends: [
      { label: "Bookings", value: bookingsEventCount },
      { label: "Rebooks", value: rebookEventCount },
      { label: "Loyalty redemptions", value: loyaltyUsageCount },
      { label: "Referrals", value: referralConversions }
    ],
    topBarbers,
    topReturningClients: clientSignals
      .map((entry) => ({
        clientId: entry.client.id,
        clientName: entry.client.name,
        completedVisits: entry.intelligence.completedVisitCount,
        lastVisitAt: entry.intelligence.lastCompletedAt,
        lifetimeValue: entry.lifetimeValue,
        churnRisk: entry.intelligence.churnRisk,
        loyaltySegment: entry.intelligence.loyaltySegment
      }))
      .sort((left, right) => right.completedVisits - left.completedVisits || right.lifetimeValue - left.lifetimeValue)
      .slice(0, 5),
    barberRetention: [...barberRetentionMap.values()].sort((left, right) => right.rebookingOpportunities - left.rebookingOpportunities || right.repeatClients - left.repeatClients).slice(0, 5),
    recentNotifications: getRecentNotificationsForRole(state, viewer?.role === "manager" ? "manager" : "shop_owner_user", {
      userEmail: viewer?.userEmail ?? (viewer?.role === "manager" ? "manager@bvrb3r.demo" : "owner@bvrb3r.demo")
    }),
    automation: buildEmptyOwnerAutomationSummary(),
    monetization: buildEmptyOwnerMonetizationSummary(),
    marketplace: {
      discoveryImpressions: 0,
      profileViews: 0,
      bookingClicks: 0,
      bookingsCreated: 0,
      bookingsCompleted: 0,
      followsCreated: 0,
      haircutNowImpressions: 0,
      shareCount: 0,
      referralShares: 0,
      referralSignUps: 0,
      referralBookings: 0,
      referralCompleted: 0,
      referralCredited: 0,
      discoveryToBookingRate: 0,
      profileToBookingRate: 0,
      clickToBookingRate: 0,
      referralInvites: 0,
      topSources: []
    }
  };
}

export function followBarber(
  state: EngagementState,
  actor: EngagementActor,
  input: Pick<BarberFollowRecord, "barberId" | "notifyOnAvailability" | "notifyOnPortfolio">
) {
  if (!isClientRole(actor.role) || !actor.clientId) {
    throw new EngagementPermissionError("Only clients can follow barbers.");
  }

  const barber = getBarber(input.barberId);
  if (!barber) {
    throw new EngagementNotFoundError("Barber could not be found.");
  }

  if (state.barberFollows.some((follow) => follow.clientId === actor.clientId && follow.barberId === input.barberId)) {
    throw new EngagementValidationError("You are already following this barber.");
  }

  const follow: BarberFollowRecord = {
    id: createId("follow"),
    clientId: actor.clientId,
    barberId: input.barberId,
    notifyOnAvailability: input.notifyOnAvailability,
    notifyOnPortfolio: input.notifyOnPortfolio,
    createdAt: new Date().toISOString()
  };
  const event: EngagementEventRecord = {
    id: createId("engagement"),
    actorRole: actor.role,
    actorId: actor.clientId,
    targetType: "barber",
    targetId: input.barberId,
    eventType: "barber_followed",
    metadata: {
      notifyOnAvailability: input.notifyOnAvailability,
      notifyOnPortfolio: input.notifyOnPortfolio
    },
    createdAt: follow.createdAt
  };

  let nextState: EngagementState = {
    ...state,
    barberFollows: sortByNewest([follow, ...state.barberFollows]),
    engagementEvents: sortByNewest([event, ...state.engagementEvents])
  };

  const notificationResult = appendEngagementNotification(nextState, {
    role: barber.role,
    barberId: barber.id,
    userEmail: getBarberEmail(barber.id),
    type: "new_follower",
    title: "New client follow",
    body: `${getClient(actor.clientId)?.name ?? "A client"} followed your public profile and wants to stay close to your availability.`
  });
  nextState = notificationResult.state;

  return {
    state: nextState,
    follow,
    notification: notificationResult.notification
  };
}

export function unfollowBarber(state: EngagementState, actor: EngagementActor, barberId: string) {
  if (!isClientRole(actor.role) || !actor.clientId) {
    throw new EngagementPermissionError("Only clients can unfollow barbers.");
  }

  const existing = state.barberFollows.find((follow) => follow.clientId === actor.clientId && follow.barberId === barberId);
  if (!existing) {
    throw new EngagementValidationError("You are not following this barber.");
  }

  return {
    state: {
      ...state,
      barberFollows: state.barberFollows.filter((follow) => follow.id !== existing.id)
    },
    unfollowedBarberId: barberId
  };
}

export function createReferralInvite(state: EngagementState, actor: EngagementActor, input: { referredClientEmail: string }) {
  if (!isClientRole(actor.role) || !actor.clientId) {
    throw new EngagementPermissionError("Only clients can send referral invites.");
  }

  const normalizedEmail = input.referredClientEmail.trim().toLowerCase();
  if (!normalizedEmail.includes("@")) {
    throw new EngagementValidationError("A valid referral email is required.");
  }

  const referralCode = getReferralCodeForClient(state, actor.clientId);
  if (!referralCode) {
    throw new EngagementNotFoundError("A referral code is not available for this client yet.");
  }

  if (state.referralEvents.some((event) => event.referrerClientId === actor.clientId && event.referredClientEmail.toLowerCase() === normalizedEmail)) {
    throw new EngagementValidationError("This referral invite has already been sent.");
  }

  const referralEvent: ReferralEventRecord = {
    id: createId("referral-event"),
    referralCodeId: referralCode.id,
    referrerClientId: actor.clientId,
    referredClientEmail: normalizedEmail,
    status: "invited",
    rewardPoints: referralCode.rewardPoints,
    createdAt: new Date().toISOString()
  };

  const nextState = appendEngagementNotification({
    ...state,
    referralEvents: sortByNewest([referralEvent, ...state.referralEvents])
  }, {
    role: "client_user",
    clientId: actor.clientId,
    userEmail: getClient(actor.clientId)?.email ?? `${actor.clientId}@client.bvrb3r.local`,
    type: "loyalty_milestone",
    title: "Referral invite ready",
    body: `Your BVRB3R referral link is live for ${normalizedEmail}. Reward points unlock once the first booking closes.`
  }).state;

  return {
    state: nextState,
    referralEvent,
    referralCode
  };
}

export function syncReferralAttribution(
  state: EngagementState,
  input: {
    referralCode: string;
    referredClientId: string;
    referredClientEmail: string;
  }
) {
  const normalizedCode = input.referralCode.trim().toUpperCase();
  const normalizedEmail = input.referredClientEmail.trim().toLowerCase();
  const referralCode = state.referralCodes.find((code) => code.active && code.code.toUpperCase() === normalizedCode);

  if (!referralCode) {
    return {
      state,
      referralEvent: null
    };
  }

  if (referralCode.clientId === input.referredClientId) {
    return {
      state,
      referralEvent: null
    };
  }

  const existing = state.referralEvents.find((event) =>
    event.referralCodeId === referralCode.id
    && (
      event.referredClientId === input.referredClientId
      || event.referredClientEmail.toLowerCase() === normalizedEmail
    )
  ) ?? state.referralEvents.find((event) => event.referredClientId === input.referredClientId);

  const now = new Date().toISOString();
  const referralEvent = existing
    ? mergeReferralEvent(existing, {
        referredClientId: input.referredClientId,
        referredClientEmail: normalizedEmail,
        signedUpAt: existing.signedUpAt ?? now,
        status: "signed_up"
      })
    : ({
        id: createId("referral-event"),
        referralCodeId: referralCode.id,
        referrerClientId: referralCode.clientId,
        referredClientEmail: normalizedEmail,
        referredClientId: input.referredClientId,
        status: "signed_up",
        rewardPoints: referralCode.rewardPoints,
        createdAt: now,
        signedUpAt: now
      } satisfies ReferralEventRecord);

  return {
    state: upsertReferralEvent(state, referralEvent),
    referralEvent
  };
}

export function recordReferralBooking(
  state: EngagementState,
  input: {
    clientId: string;
    appointmentId: string;
  }
) {
  const existing = state.referralEvents.find((event) =>
    event.referredClientId === input.clientId
    && event.referrerClientId !== input.clientId
    && event.status !== "credited"
  );

  if (!existing) {
    return {
      state,
      referralEvent: null
    };
  }

  const now = new Date().toISOString();
  const referralEvent = mergeReferralEvent(existing, {
    appointmentId: existing.appointmentId ?? input.appointmentId,
    bookedAt: existing.bookedAt ?? now,
    signedUpAt: existing.signedUpAt ?? now,
    status: "booked"
  });

  return {
    state: upsertReferralEvent(state, referralEvent),
    referralEvent
  };
}

export function processCompletedBookingGrowth(
  state: EngagementState,
  input: {
    clientId: string;
    appointmentId: string;
    completedAt?: string;
    completedBookingHistory: CompletedBookingHistoryItem[];
    activeMembership: boolean;
  }
) {
  const completedAt = input.completedAt ?? new Date().toISOString();
  let nextState = state;

  if (!nextState.loyaltyTransactions.some((transaction) => transaction.referenceId === input.appointmentId && transaction.reason === "completed_booking")) {
    nextState = addLoyaltyTransaction(
      nextState,
      input.clientId,
      "completed_booking",
      25,
      "Completed booked appointment",
      input.appointmentId
    ).state;
  }

  const referralEvent = nextState.referralEvents.find((event) =>
    event.referredClientId === input.clientId
    && event.referrerClientId !== input.clientId
    && (
      event.appointmentId === input.appointmentId
      || !event.appointmentId
    )
    && event.status !== "credited"
  );

  if (referralEvent) {
    const referralCreditReference = `referral-credit:${referralEvent.id}`;
    const rewardAlreadyIssued = nextState.loyaltyTransactions.some((transaction) => transaction.referenceId === referralCreditReference);
    let creditedTransactionId = referralEvent.creditedTransactionId;

    if (!rewardAlreadyIssued) {
      const rewardResult = addLoyaltyTransaction(
        nextState,
        referralEvent.referrerClientId,
        "referral",
        referralEvent.rewardPoints,
        `Referral credited: ${getClientName(input.clientId)} completed a first visit`,
        referralCreditReference
      );
      nextState = rewardResult.state;
      creditedTransactionId = rewardResult.transaction.id;
      nextState = appendEngagementNotification(nextState, {
        role: "client_user",
        clientId: referralEvent.referrerClientId,
        userEmail: getClient(referralEvent.referrerClientId)?.email ?? `${referralEvent.referrerClientId}@client.bvrb3r.local`,
        type: "referral_reward",
        title: "Referral reward credited",
        body: `${getClientName(input.clientId)} completed a booking through your invite. ${referralEvent.rewardPoints} points are now in your BVRB3R balance.`,
        dedupeSeed: `referral-credit:${referralEvent.id}`
      }).state;
    }

    nextState = upsertReferralEvent(nextState, mergeReferralEvent(referralEvent, {
      appointmentId: input.appointmentId,
      signedUpAt: referralEvent.signedUpAt ?? completedAt,
      bookedAt: referralEvent.bookedAt ?? completedAt,
      completedAt,
      creditedAt: creditedTransactionId ? completedAt : referralEvent.creditedAt,
      creditedTransactionId,
      status: creditedTransactionId ? "credited" : "completed"
    }));
  }

  nextState = awardLoyaltyRuleTransactions(nextState, {
    clientId: input.clientId,
    appointmentId: input.appointmentId,
    completedAt,
    completedBookingHistory: input.completedBookingHistory,
    activeMembership: input.activeMembership
  });

  nextState = appendEngagementNotification(nextState, {
    role: "client_user",
    clientId: input.clientId,
    userEmail: getClient(input.clientId)?.email ?? `${input.clientId}@client.bvrb3r.local`,
    type: "referral_prompt",
    title: "Invite someone to BVRB3R",
    body: "Your visit is complete. Share your referral code while the experience is fresh and unlock points when the first booking closes.",
    dedupeSeed: `referral-prompt:${input.appointmentId}`
  }).state;

  nextState = appendEngagementNotification(nextState, {
    role: "client_user",
    clientId: input.clientId,
    userEmail: getClient(input.clientId)?.email ?? `${input.clientId}@client.bvrb3r.local`,
    type: "rebooking_reminder",
    title: "Keep the next visit easy",
    body: "Your rebooking lane and next-best-action summary just refreshed from the completed appointment.",
    scheduledFor: addDays(completedAt, 1),
    dedupeSeed: `post-booking-rebook:${input.appointmentId}`
  }).state;

  return {
    state: nextState
  };
}

export function recordEngagementEvent(state: EngagementState, actor: EngagementActor, input: RecordEngagementEventInput) {
  const allowed = ALLOWED_EVENT_TYPES[actor.role] ?? [];
  if (!allowed.includes(input.eventType)) {
    throw new EngagementPermissionError("You do not have access to record this engagement event.");
  }

  const actorId = actor.clientId ?? actor.barberId ?? actor.userEmail;
  if (!actorId) {
    throw new EngagementValidationError("A valid engagement actor is required.");
  }

  const event: EngagementEventRecord = {
    id: createId("engagement"),
    actorRole: actor.role,
    actorId,
    targetType: input.targetType,
    targetId: input.targetId,
    eventType: input.eventType,
    metadata: input.metadata ?? {},
    createdAt: new Date().toISOString()
  };

  let nextState: EngagementState = {
    ...state,
    engagementEvents: sortByNewest([event, ...state.engagementEvents])
  };

  if (input.eventType === "reward_redeemed") {
    if (!actor.clientId) {
      throw new EngagementValidationError("A client profile is required to redeem a reward.");
    }

    const rewardId = typeof input.metadata?.rewardId === "string" ? input.metadata.rewardId : undefined;
    const reward = getRewardDefinition(rewardId);
    if (!reward) {
      throw new EngagementValidationError("A valid reward selection is required.");
    }

    const account = state.loyaltyAccounts.find((entry) => entry.clientId === actor.clientId);
    const availablePoints = account?.pointsBalance ?? getClient(actor.clientId)?.loyaltyPoints ?? 0;
    if (availablePoints < reward.pointsRequired) {
      throw new EngagementValidationError("You do not have enough points to claim this reward yet.");
    }

    nextState = addLoyaltyTransaction(
      nextState,
      actor.clientId,
      "reward_redemption",
      -reward.pointsRequired,
      `Reward redeemed: ${reward.title}`,
      event.id
    ).state;
    nextState = appendEngagementNotification(nextState, {
      role: "client_user",
      clientId: actor.clientId,
      userEmail: getClient(actor.clientId)?.email ?? `${actor.clientId}@client.bvrb3r.local`,
      type: "reward_follow_up",
      title: `${reward.title} claimed`,
      body: `Your ${reward.title.toLowerCase()} is now tracked in BVRB3R. Keep booking to stack the next reward.`
    }).state;
  } else {
    const eventPoints = EVENT_POINTS[input.eventType];
    if (typeof eventPoints === "number" && actor.clientId) {
      const reason: LoyaltyTransactionReason = input.eventType === "barber_reviewed"
        ? "review"
        : "completed_booking";
      nextState = addLoyaltyTransaction(nextState, actor.clientId, reason, eventPoints, input.eventType.replaceAll("_", " "), event.id).state;
    }
  }

  if (input.eventType === "barber_reviewed" && input.targetType === "barber") {
    nextState = appendEngagementNotification(nextState, {
      role: getBarber(input.targetId)?.role ?? "barber_user",
      barberId: input.targetId,
      userEmail: getBarberEmail(input.targetId),
      type: "review_alert",
      title: "New review received",
      body: `${getClient(actor.clientId ?? "")?.name ?? "A client"} left a fresh review on your profile.`
    }).state;
  }

  if (input.eventType === "payout_released" && input.targetType === "barber") {
    nextState = appendEngagementNotification(nextState, {
      role: getBarber(input.targetId)?.role ?? "barber_user",
      barberId: input.targetId,
      userEmail: getBarberEmail(input.targetId),
      type: "payout_alert",
      title: "Payout update available",
      body: "Your latest payout or ledger update is ready to review in the barber workspace."
    }).state;
  }

  return { state: nextState, event };
}

export type { EngagementState } from "@/types/engagement";






