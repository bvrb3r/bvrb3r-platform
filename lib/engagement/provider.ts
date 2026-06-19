/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto";
import { getNotificationDeliveryProvider } from "@/lib/engagement/delivery-provider";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import { demoBarbers, demoClients, demoUsers } from "@/lib/data/demo";
import {
  createEmptyEngagementState,
  createReferralInvite as createReferralInviteInState,
  followBarber as followBarberInState,
  processCompletedBookingGrowth as processCompletedBookingGrowthInState,
  recordReferralBooking as recordReferralBookingInState,
  recordEngagementEvent as recordEngagementEventInState,
  syncReferralAttribution as syncReferralAttributionInState,
  unfollowBarber as unfollowBarberInState,
  type EngagementActor,
  type RecordEngagementEventInput
} from "@/lib/engagement/engine";
import type {
  BarberFollowRecord,
  EngagementNotificationRecord,
  EngagementState,
  LoyaltyAccountRecord,
  LoyaltyRewardRuleRecord,
  LoyaltyTier
} from "@/types/engagement";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

export interface EngagementProvider {
  kind: "demo" | "supabase";
  readState(): Promise<EngagementState>;
  followBarber(
    actor: EngagementActor,
    input: Pick<BarberFollowRecord, "barberId" | "notifyOnAvailability" | "notifyOnPortfolio">
  ): Promise<ReturnType<typeof followBarberInState>>;
  unfollowBarber(actor: EngagementActor, barberId: string): Promise<{ unfollowedBarberId: string }>;
  createReferralInvite(actor: EngagementActor, input: { referredClientEmail: string }): Promise<ReturnType<typeof createReferralInviteInState>>;
  syncReferralAttribution(input: {
    referralCode: string;
    referredClientId: string;
    referredClientEmail: string;
  }): Promise<{ referralEvent: EngagementState["referralEvents"][number] | null }>;
  recordReferralBooking(input: {
    clientId: string;
    appointmentId: string;
  }): Promise<{ referralEvent: EngagementState["referralEvents"][number] | null }>;
  recordEvent(actor: EngagementActor, input: RecordEngagementEventInput): Promise<ReturnType<typeof recordEngagementEventInState>>;
  rewardCompletedBooking(input: {
    clientId: string;
    appointmentId: string;
    completedAt?: string;
    completedBookingHistory?: Array<{
      appointmentId: string;
      completedAt: string;
    }>;
    activeMembership?: boolean;
  }): Promise<void>;
}

function stableUuid(seed: string) {
  const hash = createHash("sha1").update(seed).digest("hex");
  const base = hash.slice(0, 32).split("");
  base[12] = "5";
  base[16] = ((parseInt(base[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${base.slice(0, 8).join("")}-${base.slice(8, 12).join("")}-${base.slice(12, 16).join("")}-${base.slice(16, 20).join("")}-${base.slice(20, 32).join("")}`;
}

function pointsToTier(points: number): LoyaltyTier {
  return points >= 250 ? "elite" : points >= 120 ? "vip" : "core";
}

function getClientEmail(clientId: string) {
  return demoClients.find((client) => client.id === clientId)?.email ?? `${clientId}@client.bvrb3r.local`;
}

function getBarberEmail(barberId: string) {
  const barber = demoBarbers.find((entry) => entry.id === barberId);
  return demoUsers.find((user) => user.id === barber?.userId)?.email ?? `${barberId}@barber.bvrb3r.local`;
}

function diffById<T extends { id: string }>(previous: T[], next: T[]) {
  const previousIds = new Set(previous.map((row) => row.id));
  return next.filter((row) => !previousIds.has(row.id));
}

function changedById<T extends { id: string }>(previous: T[], next: T[]) {
  const previousById = new Map(previous.map((row) => [row.id, JSON.stringify(row)]));
  return next.filter((row) => previousById.get(row.id) !== JSON.stringify(row));
}

function changedAccounts(previous: LoyaltyAccountRecord[], next: LoyaltyAccountRecord[]) {
  return next.filter((record) => {
    const current = previous.find((entry) => entry.clientId === record.clientId);
    return !current
      || current.pointsBalance !== record.pointsBalance
      || current.lifetimePoints !== record.lifetimePoints
      || current.referralCredits !== record.referralCredits
      || current.tier !== record.tier;
  });
}

async function syncNotificationDeliveries(previous: EngagementState, next: EngagementState) {
  const newNotifications = diffById(previous.notifications, next.notifications);
  if (!newNotifications.length) {
    return;
  }

  const deliveryProvider = await getNotificationDeliveryProvider();
  await deliveryProvider.syncNotifications(newNotifications);
}
function toNotification(row: any): EngagementNotificationRecord | null {
  if (!row.notification_type || !row.audience_role || !row.audience_email) {
    return null;
  }

  return {
    id: row.dedupe_key ?? `${row.notification_type}-${row.audience_email}-${row.created_at}`,
    userEmail: row.audience_email,
    role: row.audience_role,
    clientId: row.client_reference ?? undefined,
    barberId: row.barber_reference ?? undefined,
    locationId: row.location_reference ?? undefined,
    channel: row.channel,
    type: row.notification_type,
    title: row.title,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    scheduledFor: row.scheduled_for ?? undefined
  };
}

async function readSupabaseState(supabase: SupabaseClient): Promise<EngagementState> {
  const base = createEmptyEngagementState();
  const [
    notificationPreferences,
    accounts,
    transactions,
    rewardRules,
    referralCodes,
    referralEvents,
    follows,
    events,
    rebookingCycles,
    rebookingRecommendations,
    notifications,
    reputationScores,
    rankingSnapshots,
    growthRecommendations
  ] = await Promise.all([
    supabase.from("notification_preferences").select("id, role, user_email, client_reference, barber_reference, in_app_enabled, sms_enabled, email_enabled, push_enabled, updated_at").order("updated_at", { ascending: false }),
    supabase.from("loyalty_accounts").select("id, client_reference, points, available_points, lifetime_points, referral_credits, vip_status, updated_at"),
    supabase.from("loyalty_transactions").select("client_reference, reason, points_delta, label, reference_id, created_at, dedupe_key").order("created_at", { ascending: false }),
    supabase.from("loyalty_reward_rules").select("id, rule_code, title, trigger_event, active, threshold_count, every_nth_count, min_days_since_last_completion, requires_active_membership, points_delta, metadata, created_at, updated_at").order("updated_at", { ascending: false }),
    supabase.from("referral_codes").select("id, client_reference, code, reward_points, active, created_at").order("created_at", { ascending: false }),
    supabase.from("referral_events").select("id, referral_code_id, referrer_client_reference, referred_client_email, referred_client_reference, status, reward_points, created_at, signed_up_at, booked_at, completed_at, appointment_reference, credited_at, credited_transaction_reference").order("created_at", { ascending: false }),
    supabase.from("barber_follows").select("client_reference, barber_reference, notify_on_availability, notify_on_portfolio, created_at").order("created_at", { ascending: false }),
    supabase.from("engagement_events").select("actor_role, actor_reference, target_type, target_reference, event_type, metadata, created_at, dedupe_key").order("created_at", { ascending: false }),
    supabase.from("rebooking_cycles").select("id, client_reference, barber_reference, service_reference, average_cycle_days, confidence, last_completed_at, next_suggested_at").order("next_suggested_at", { ascending: true }),
    supabase.from("rebooking_recommendations").select("id, client_reference, barber_reference, service_reference, message, remind_at, status, reason, created_at").order("created_at", { ascending: false }),
    supabase.from("notifications").select("audience_role, audience_email, client_reference, barber_reference, location_reference, channel, notification_type, title, body, status, created_at, scheduled_for, dedupe_key").not("notification_type", "is", null).order("created_at", { ascending: false }),
    supabase.from("reputation_scores").select("barber_reference, review_score, punctuality_score, completion_score, retention_score, overall_score, reputation_tier, updated_at"),
    supabase.from("ranking_snapshots").select("id, barber_reference, dimension, rank_position, score, label, observed_at").order("observed_at", { ascending: false }),
    supabase.from("growth_recommendations").select("id, barber_reference, title, description, focus_area, priority, status, action_label, created_at").order("created_at", { ascending: false })
  ]);

  for (const result of [notificationPreferences, accounts, transactions, rewardRules, referralCodes, referralEvents, follows, events, rebookingCycles, rebookingRecommendations, notifications, reputationScores, rankingSnapshots, growthRecommendations]) {
    if (result.error) {
      throw result.error;
    }
  }

  return {
    ...base,
    notificationPreferences: (notificationPreferences.data ?? []).map((row: any) => ({
      id: row.id ?? `pref-${row.role}-${row.user_email}`,
      userEmail: row.user_email,
      role: row.role,
      clientId: row.client_reference ?? undefined,
      barberId: row.barber_reference ?? undefined,
      inAppEnabled: row.in_app_enabled,
      smsEnabled: row.sms_enabled,
      emailEnabled: row.email_enabled,
      pushEnabled: row.push_enabled,
      updatedAt: row.updated_at
    })),
    loyaltyAccounts: (accounts.data ?? []).map((row: any) => ({
      id: row.id ?? `loyalty-${row.client_reference}`,
      clientId: row.client_reference,
      pointsBalance: Number(row.available_points ?? row.points ?? 0),
      lifetimePoints: Number(row.lifetime_points ?? row.available_points ?? row.points ?? 0),
      referralCredits: Number(row.referral_credits ?? 0),
      tier: (row.vip_status as LoyaltyTier | null) ?? pointsToTier(Number(row.available_points ?? row.points ?? 0)),
      updatedAt: row.updated_at ?? new Date().toISOString()
    })),
    loyaltyTransactions: (transactions.data ?? []).map((row: any) => ({
      id: row.dedupe_key ?? `${row.reason}-${row.reference_id ?? row.created_at}`,
      clientId: row.client_reference,
      reason: row.reason,
      pointsDelta: row.points_delta,
      label: row.label,
      referenceId: row.reference_id ?? undefined,
      createdAt: row.created_at
    })),
    loyaltyRewardRules: (rewardRules.data ?? []).map((row: any) => ({
      id: row.id,
      ruleCode: row.rule_code,
      title: row.title,
      triggerEvent: row.trigger_event,
      active: row.active,
      thresholdCount: Number(row.threshold_count ?? 1),
      everyNthCount: row.every_nth_count ?? undefined,
      minDaysSinceLastCompletion: row.min_days_since_last_completion ?? undefined,
      requiresActiveMembership: row.requires_active_membership,
      pointsDelta: Number(row.points_delta ?? 0),
      metadata: row.metadata ?? {},
      updatedAt: row.updated_at
    } satisfies LoyaltyRewardRuleRecord)),
    referralCodes: (referralCodes.data ?? []).map((row: any) => ({
      id: row.id,
      clientId: row.client_reference,
      code: row.code,
      rewardPoints: row.reward_points,
      active: row.active,
      createdAt: row.created_at
    })),
    referralEvents: (referralEvents.data ?? []).map((row: any) => ({
      id: row.id,
      referralCodeId: row.referral_code_id,
      referrerClientId: row.referrer_client_reference,
      referredClientEmail: row.referred_client_email,
      referredClientId: row.referred_client_reference ?? undefined,
      status: row.status,
      rewardPoints: row.reward_points,
      createdAt: row.created_at,
      signedUpAt: row.signed_up_at ?? undefined,
      bookedAt: row.booked_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      appointmentId: row.appointment_reference ?? undefined,
      creditedAt: row.credited_at ?? undefined,
      creditedTransactionId: row.credited_transaction_reference ?? undefined
    })),
    barberFollows: (follows.data ?? []).map((row: any) => ({
      id: `follow-${row.client_reference}-${row.barber_reference}`,
      clientId: row.client_reference,
      barberId: row.barber_reference,
      notifyOnAvailability: row.notify_on_availability,
      notifyOnPortfolio: row.notify_on_portfolio,
      createdAt: row.created_at
    })),
    engagementEvents: (events.data ?? []).map((row: any) => ({
      id: row.dedupe_key ?? `${row.event_type}-${row.actor_reference}-${row.created_at}`,
      actorRole: row.actor_role,
      actorId: row.actor_reference,
      targetType: row.target_type,
      targetId: row.target_reference,
      eventType: row.event_type,
      metadata: row.metadata ?? {},
      createdAt: row.created_at
    })),
    rebookingCycles: (rebookingCycles.data ?? []).map((row: any) => ({
      id: row.id,
      clientId: row.client_reference,
      barberId: row.barber_reference ?? undefined,
      serviceId: row.service_reference ?? undefined,
      averageCycleDays: row.average_cycle_days,
      confidence: row.confidence,
      lastCompletedAt: row.last_completed_at,
      nextSuggestedAt: row.next_suggested_at
    })),
    rebookingRecommendations: (rebookingRecommendations.data ?? []).map((row: any) => ({
      id: row.id,
      clientId: row.client_reference,
      barberId: row.barber_reference ?? undefined,
      serviceId: row.service_reference ?? undefined,
      message: row.message,
      remindAt: row.remind_at,
      status: row.status,
      reason: row.reason,
      createdAt: row.created_at
    })),
    notifications: (notifications.data ?? []).map((row: any) => toNotification(row)).filter((row): row is EngagementNotificationRecord => Boolean(row)),
    reputationScores: (reputationScores.data ?? []).map((row: any) => ({
      barberId: row.barber_reference,
      reviewScore: Number(row.review_score ?? 0),
      punctualityScore: Number(row.punctuality_score ?? 0),
      completionScore: Number(row.completion_score ?? 0),
      retentionScore: Number(row.retention_score ?? 0),
      overallScore: Number(row.overall_score ?? 0),
      tier: row.reputation_tier,
      updatedAt: row.updated_at
    })),
    rankingSnapshots: (rankingSnapshots.data ?? []).map((row: any) => ({
      id: row.id ?? `${row.dimension}-${row.barber_reference}-${row.observed_at}`,
      barberId: row.barber_reference,
      dimension: row.dimension,
      rankPosition: row.rank_position,
      score: Number(row.score ?? 0),
      label: row.label,
      observedAt: row.observed_at
    })),
    growthRecommendations: (growthRecommendations.data ?? []).map((row: any) => ({
      id: row.id ?? `${row.barber_reference}-${row.focus_area}-${row.created_at}`,
      barberId: row.barber_reference,
      title: row.title,
      description: row.description,
      focusArea: row.focus_area,
      priority: row.priority,
      status: row.status,
      actionLabel: row.action_label,
      createdAt: row.created_at
    }))
  };
}

async function persistDiff(supabase: SupabaseClient, previous: EngagementState, next: EngagementState) {
  const accountRows = changedAccounts(previous.loyaltyAccounts, next.loyaltyAccounts).map((record) => ({
    id: stableUuid(`loyalty-account:${record.id}`),
    client_id: stableUuid(`client:${record.clientId}`),
    client_reference: record.clientId,
    client_email: getClientEmail(record.clientId),
    tier: record.tier,
    points: record.pointsBalance,
    available_points: record.pointsBalance,
    lifetime_points: record.lifetimePoints,
    referral_credits: record.referralCredits,
    vip_status: record.tier,
    updated_at: record.updatedAt
  }));
  if (accountRows.length) {
    const result = await supabase.from("loyalty_accounts").upsert(accountRows, { onConflict: "client_reference" });
    if (result.error) {
      throw result.error;
    }
  }

  const transactionRows = diffById(previous.loyaltyTransactions, next.loyaltyTransactions).map((record) => ({
    loyalty_account_id: stableUuid(`loyalty-account:loyalty-${record.clientId.replace(/^client-/, "")}`),
    client_reference: record.clientId,
    client_email: getClientEmail(record.clientId),
    reason: record.reason,
    points_delta: record.pointsDelta,
    label: record.label,
    reference_id: record.referenceId ?? null,
    metadata: {},
    created_at: record.createdAt,
    dedupe_key: record.id
  }));
  if (transactionRows.length) {
    const result = await supabase.from("loyalty_transactions").upsert(transactionRows, { onConflict: "dedupe_key" });
    if (result.error) {
      throw result.error;
    }
  }

  const referralRows = changedById(previous.referralEvents, next.referralEvents).map((record) => ({
    id: stableUuid(`referral-event:${record.id}`),
    referral_code_id: stableUuid(`referral-code:${record.referralCodeId}`),
    referrer_client_reference: record.referrerClientId,
    referrer_client_email: getClientEmail(record.referrerClientId),
    referred_client_email: record.referredClientEmail,
    referred_client_reference: record.referredClientId ?? null,
    status: record.status,
    reward_points: record.rewardPoints,
    metadata: {},
    created_at: record.createdAt,
    signed_up_at: record.signedUpAt ?? null,
    booked_at: record.bookedAt ?? null,
    completed_at: record.completedAt ?? null,
    appointment_reference: record.appointmentId ?? null,
    credited_at: record.creditedAt ?? null,
    credited_transaction_reference: record.creditedTransactionId ?? null
  }));
  if (referralRows.length) {
    const result = await supabase.from("referral_events").upsert(referralRows, { onConflict: "id" });
    if (result.error) {
      throw result.error;
    }
  }

  const followRows = diffById(previous.barberFollows, next.barberFollows).map((record) => ({
    client_reference: record.clientId,
    client_email: getClientEmail(record.clientId),
    barber_reference: record.barberId,
    barber_email: getBarberEmail(record.barberId),
    notify_on_availability: record.notifyOnAvailability,
    notify_on_portfolio: record.notifyOnPortfolio,
    created_at: record.createdAt
  }));
  if (followRows.length) {
    const result = await supabase.from("barber_follows").upsert(followRows, { onConflict: "client_reference,barber_reference" });
    if (result.error) {
      throw result.error;
    }
  }

  const eventRows = diffById(previous.engagementEvents, next.engagementEvents).map((record) => ({
    actor_role: record.actorRole,
    actor_reference: record.actorId,
    actor_email: record.actorRole === "client" ? getClientEmail(record.actorId) : record.actorRole === "owner" ? "owner@bvrb3r.demo" : getBarberEmail(record.actorId),
    target_type: record.targetType,
    target_reference: record.targetId,
    target_email: record.targetType === "client" ? getClientEmail(record.targetId) : record.targetType === "barber" ? getBarberEmail(record.targetId) : null,
    event_type: record.eventType,
    metadata: record.metadata,
    created_at: record.createdAt,
    dedupe_key: record.id
  }));
  if (eventRows.length) {
    const result = await supabase.from("engagement_events").upsert(eventRows, { onConflict: "dedupe_key" });
    if (result.error) {
      throw result.error;
    }
  }

  const notificationRows = diffById(previous.notifications, next.notifications).map((record) => ({
    audience_role: record.role,
    audience_email: record.userEmail,
    client_reference: record.clientId ?? null,
    client_email: record.clientId ? getClientEmail(record.clientId) : null,
    barber_reference: record.barberId ?? null,
    barber_email: record.barberId ? getBarberEmail(record.barberId) : null,
    location_reference: record.locationId ?? null,
    channel: record.channel,
    notification_type: record.type,
    title: record.title,
    body: record.body,
    status: record.status,
    metadata: {},
    created_at: record.createdAt,
    scheduled_for: record.scheduledFor ?? null,
    dedupe_key: record.id
  }));
  if (notificationRows.length) {
    const result = await supabase.from("notifications").upsert(notificationRows, { onConflict: "dedupe_key" });
    if (result.error) {
      throw result.error;
    }
  }

  await syncNotificationDeliveries(previous, next);
}
function createEmptyProvider(): EngagementProvider {
  const unavailable = (): never => {
    throw new Error("Engagement data is unavailable because Supabase is not configured.");
  };

  return {
    kind: "supabase",
    async readState() {
      return createEmptyEngagementState();
    },
    async followBarber() {
      return unavailable();
    },
    async unfollowBarber() {
      return unavailable();
    },
    async createReferralInvite() {
      return unavailable();
    },
    async syncReferralAttribution() {
      return unavailable();
    },
    async recordReferralBooking() {
      return unavailable();
    },
    async recordEvent() {
      return unavailable();
    },
    async rewardCompletedBooking() {
      return unavailable();
    }
  };
}

function createSupabaseProvider(supabase: SupabaseClient): EngagementProvider {
  return {
    kind: "supabase",
    async readState() {
      return readSupabaseState(supabase);
    },
    async followBarber(actor, input) {
      const previous = await readSupabaseState(supabase);
      const result = followBarberInState(previous, actor, input);
      await persistDiff(supabase, previous, result.state);
      return result;
    },
    async unfollowBarber(actor, barberId) {
      const previous = await readSupabaseState(supabase);
      const result = unfollowBarberInState(previous, actor, barberId);
      const remove = await supabase.from("barber_follows").delete().eq("client_reference", actor.clientId ?? "").eq("barber_reference", barberId);
      if (remove.error) {
        throw remove.error;
      }
      return { unfollowedBarberId: result.unfollowedBarberId };
    },
    async createReferralInvite(actor, input) {
      const previous = await readSupabaseState(supabase);
      const result = createReferralInviteInState(previous, actor, input);
      await persistDiff(supabase, previous, result.state);
      return result;
    },
    async syncReferralAttribution(input) {
      const previous = await readSupabaseState(supabase);
      const result = syncReferralAttributionInState(previous, input);
      await persistDiff(supabase, previous, result.state);
      return { referralEvent: result.referralEvent };
    },
    async recordReferralBooking(input) {
      const previous = await readSupabaseState(supabase);
      const result = recordReferralBookingInState(previous, input);
      await persistDiff(supabase, previous, result.state);
      return { referralEvent: result.referralEvent };
    },
    async recordEvent(actor, input) {
      const previous = await readSupabaseState(supabase);
      const result = recordEngagementEventInState(previous, actor, input);
      await persistDiff(supabase, previous, result.state);
      return result;
    },
    async rewardCompletedBooking(input) {
      const previous = await readSupabaseState(supabase);
      const next = processCompletedBookingGrowthInState(previous, {
        clientId: input.clientId,
        appointmentId: input.appointmentId,
        completedAt: input.completedAt,
        completedBookingHistory: input.completedBookingHistory ?? [],
        activeMembership: input.activeMembership ?? false
      }).state;
      await persistDiff(supabase, previous, next);
    }
  };
}

export async function getEngagementProvider(): Promise<EngagementProvider> {
  if (!isSupabaseEnabled()) {
    return createEmptyProvider();
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return createEmptyProvider();
  }

  return createSupabaseProvider(supabase);
}











