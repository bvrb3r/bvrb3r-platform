import { createHash } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  buildPlatformEventIdempotencyKey,
  recordRequiredPlatformEvents,
  type PlatformEventInput
} from "@/lib/core/platform-events";
import type {
  ClientReferralSummary,
  ReferralCodeRecord,
  ReferralEventRecord,
  ReferralStatus
} from "@/types/engagement";

type SupabaseClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type ReferralCodeRow = {
  id: string;
  client_reference: string;
  client_email: string;
  code: string;
  reward_points: number | string | null;
  active: boolean;
  created_at: string;
};

type ReferralEventRow = {
  id: string;
  referral_code_id: string;
  referrer_client_reference: string;
  referrer_client_email: string;
  referred_client_email: string;
  referred_client_reference: string | null;
  status: ReferralStatus;
  reward_points: number | string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  signed_up_at: string | null;
  booked_at: string | null;
  completed_at: string | null;
  appointment_reference: string | null;
  credited_at: string | null;
  credited_transaction_reference: string | null;
};

type InternalReferralCodeRecord = ReferralCodeRecord & {
  clientEmail: string;
};

const DEFAULT_REFERRAL_REWARD_POINTS = 10;
const REFERRAL_SELECT = [
  "id",
  "referral_code_id",
  "referrer_client_reference",
  "referrer_client_email",
  "referred_client_email",
  "referred_client_reference",
  "status",
  "reward_points",
  "metadata",
  "created_at",
  "signed_up_at",
  "booked_at",
  "completed_at",
  "appointment_reference",
  "credited_at",
  "credited_transaction_reference"
].join(", ");

export class ReferralServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ReferralServiceError";
    this.status = status;
  }
}

function stableUuid(seed: string) {
  const hash = createHash("sha1").update(seed).digest("hex");
  const base = hash.slice(0, 32).split("");
  base[12] = "5";
  base[16] = ((parseInt(base[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${base.slice(0, 8).join("")}-${base.slice(8, 12).join("")}-${base.slice(12, 16).join("")}-${base.slice(16, 20).join("")}-${base.slice(20, 32).join("")}`;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function buildReferralCodeValue(clientId: string) {
  return `BVR${createHash("sha1").update(clientId).digest("hex").slice(0, 8).toUpperCase()}`;
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

function buildReferralShareMessage(code?: string | null) {
  return code
    ? `Book through BVRB3R with my code ${code} and unlock your first real visit on-platform.`
    : "Join me on BVRB3R and book your next barber through the marketplace.";
}

function mapReferralCodeRow(row: ReferralCodeRow): InternalReferralCodeRecord {
  return {
    id: row.id,
    clientId: row.client_reference,
    clientEmail: row.client_email,
    code: row.code,
    rewardPoints: Number(row.reward_points ?? 0),
    active: row.active,
    createdAt: row.created_at
  };
}

function toReferralCodeRecord(record: InternalReferralCodeRecord): ReferralCodeRecord {
  return {
    id: record.id,
    clientId: record.clientId,
    code: record.code,
    rewardPoints: record.rewardPoints,
    active: record.active,
    createdAt: record.createdAt
  };
}

function mapReferralEventRow(row: ReferralEventRow): ReferralEventRecord {
  return {
    id: row.id,
    referralCodeId: row.referral_code_id,
    referrerClientId: row.referrer_client_reference,
    referredClientEmail: row.referred_client_email,
    referredClientId: row.referred_client_reference ?? undefined,
    status: row.status,
    rewardPoints: Number(row.reward_points ?? 0),
    createdAt: row.created_at,
    signedUpAt: row.signed_up_at ?? undefined,
    bookedAt: row.booked_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    creditedAt: row.credited_at ?? undefined,
    appointmentId: row.appointment_reference ?? undefined,
    creditedTransactionId: row.credited_transaction_reference ?? undefined
  };
}

function getStatusRank(status: ReferralStatus) {
  switch (status) {
    case "signed_up":
      return 1;
    case "booked":
      return 2;
    case "completed":
      return 3;
    case "credited":
      return 4;
    case "invited":
    default:
      return 0;
  }
}

function hasReachedReferralStage(record: ReferralEventRecord, stage: ReferralStatus) {
  const stageRank = getStatusRank(stage);
  const currentRank = getStatusRank(record.status);

  if (currentRank >= stageRank) {
    return true;
  }

  if (stage === "signed_up") {
    return Boolean(record.signedUpAt);
  }

  if (stage === "booked") {
    return Boolean(record.bookedAt || record.appointmentId);
  }

  if (stage === "completed") {
    return Boolean(record.completedAt);
  }

  if (stage === "credited") {
    return Boolean(record.creditedAt || record.creditedTransactionId);
  }

  return true;
}

function createEmptySummary(clientId: string): ClientReferralSummary {
  return {
    clientId,
    inviteLink: "/referrals",
    shareMessage: buildReferralShareMessage(null),
    totals: {
      invited: 0,
      signedUp: 0,
      booked: 0,
      completed: 0,
      credited: 0,
      rewardPointsEarned: 0
    },
    recentReferrals: []
  };
}

function getSupabase(required: true): SupabaseClient;
function getSupabase(required?: false): SupabaseClient | null;
function getSupabase(required = false) {
  if (!isSupabaseEnabled()) {
    if (required) {
      throw new ReferralServiceError("Referral execution requires Supabase configuration.", 503);
    }
    return null;
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase && required) {
    throw new ReferralServiceError("Referral execution requires Supabase configuration.", 503);
  }

  return supabase;
}

function getRequiredSupabase(supabaseOverride?: SupabaseClient | null) {
  return supabaseOverride ?? getSupabase(true);
}

async function readReferralCodeByClientReference(supabase: SupabaseClient, clientId: string) {
  const result = await supabase
    .from("referral_codes")
    .select("id, client_reference, client_email, code, reward_points, active, created_at")
    .eq("client_reference", clientId)
    .eq("active", true)
    .maybeSingle();

  if (result.error) {
    throw new ReferralServiceError("Unable to load the referral identity.", 500);
  }

  return result.data ? mapReferralCodeRow(result.data as ReferralCodeRow) : null;
}

async function readReferralCodeByCode(supabase: SupabaseClient, code: string) {
  const result = await supabase
    .from("referral_codes")
    .select("id, client_reference, client_email, code, reward_points, active, created_at")
    .eq("code", normalizeCode(code))
    .eq("active", true)
    .maybeSingle();

  if (result.error) {
    throw new ReferralServiceError("Unable to resolve the referral code.", 500);
  }

  return result.data ? mapReferralCodeRow(result.data as ReferralCodeRow) : null;
}

async function ensureReferralCode(
  supabase: SupabaseClient,
  input: { clientId: string; clientEmail?: string | null }
) {
  const existing = await readReferralCodeByClientReference(supabase, input.clientId);
  if (existing) {
    return existing;
  }

  const normalizedEmail = input.clientEmail ? normalizeEmail(input.clientEmail) : null;
  if (!normalizedEmail) {
    return null;
  }

  const insert = await supabase
    .from("referral_codes")
    .upsert({
      id: stableUuid(`referral-code:${input.clientId}`),
      client_reference: input.clientId,
      client_email: normalizedEmail,
      code: buildReferralCodeValue(input.clientId),
      reward_points: DEFAULT_REFERRAL_REWARD_POINTS,
      active: true,
      created_at: new Date().toISOString()
    }, { onConflict: "id" })
    .select("id, client_reference, client_email, code, reward_points, active, created_at")
    .single();

  if (insert.error) {
    throw new ReferralServiceError("Unable to create the referral identity.", 500);
  }

  return mapReferralCodeRow(insert.data as ReferralCodeRow);
}

async function readReferralEventsForReferrer(supabase: SupabaseClient, clientId: string) {
  const result = await supabase
    .from("referral_events")
    .select(REFERRAL_SELECT)
    .eq("referrer_client_reference", clientId)
    .order("created_at", { ascending: false });

  if (result.error) {
    throw new ReferralServiceError("Unable to load referral activity.", 500);
  }

  return ((result.data ?? []) as unknown as ReferralEventRow[]).map(mapReferralEventRow);
}

async function readReferralEventsForReferredClient(supabase: SupabaseClient, clientId: string) {
  const result = await supabase
    .from("referral_events")
    .select(REFERRAL_SELECT)
    .eq("referred_client_reference", clientId)
    .order("created_at", { ascending: false });

  if (result.error) {
    throw new ReferralServiceError("Unable to load referral attribution.", 500);
  }

  return ((result.data ?? []) as unknown as ReferralEventRow[]).map(mapReferralEventRow);
}

async function readReferralEventById(supabase: SupabaseClient, referralEventId: string) {
  const result = await supabase
    .from("referral_events")
    .select(REFERRAL_SELECT)
    .eq("id", referralEventId)
    .maybeSingle();

  if (result.error) {
    throw new ReferralServiceError("Unable to load the referral event.", 500);
  }

  return result.data ? mapReferralEventRow(result.data as unknown as ReferralEventRow) : null;
}

async function updateReferralEvent(
  supabase: SupabaseClient,
  referralEventId: string,
  patch: Record<string, unknown>
) {
  const result = await supabase
    .from("referral_events")
    .update(patch)
    .eq("id", referralEventId)
    .select(REFERRAL_SELECT)
    .single();

  if (result.error) {
    throw new ReferralServiceError("Unable to persist the referral lifecycle.", 500);
  }

  return mapReferralEventRow(result.data as unknown as ReferralEventRow);
}

export async function readClientReferralSummary(
  input: { clientId: string; clientEmail?: string | null },
  supabaseOverride?: SupabaseClient | null
): Promise<ClientReferralSummary> {
  const supabase = supabaseOverride ?? getSupabase(false);
  if (!supabase) {
    return createEmptySummary(input.clientId);
  }

  const referralCode = await ensureReferralCode(supabase, input);
  const recentReferrals = (await readReferralEventsForReferrer(supabase, input.clientId)).slice(0, 6);
  const creditedReferrals = recentReferrals.filter((record) => hasReachedReferralStage(record, "credited"));

  return {
    clientId: input.clientId,
    referralCode: referralCode ? toReferralCodeRecord(referralCode) : undefined,
    inviteLink: referralCode ? buildReferralInviteLink(referralCode.code) : "/referrals",
    shareMessage: buildReferralShareMessage(referralCode?.code),
    totals: {
      invited: recentReferrals.length,
      signedUp: recentReferrals.filter((record) => hasReachedReferralStage(record, "signed_up")).length,
      booked: recentReferrals.filter((record) => hasReachedReferralStage(record, "booked")).length,
      completed: recentReferrals.filter((record) => hasReachedReferralStage(record, "completed")).length,
      credited: creditedReferrals.length,
      rewardPointsEarned: creditedReferrals.reduce((sum, record) => sum + record.rewardPoints, 0)
    },
    recentReferrals
  };
}

export async function createReferralInvite(
  input: {
    clientId: string;
    clientEmail: string;
    referredClientEmail: string;
  },
  supabaseOverride?: SupabaseClient | null
) {
  const supabase = getRequiredSupabase(supabaseOverride);
  const normalizedClientEmail = normalizeEmail(input.clientEmail);
  const normalizedInviteEmail = normalizeEmail(input.referredClientEmail);

  if (normalizedInviteEmail === normalizedClientEmail) {
    throw new ReferralServiceError("You cannot send a referral invite to your own email.", 409);
  }

  const referralCode = await ensureReferralCode(supabase, {
    clientId: input.clientId,
    clientEmail: normalizedClientEmail
  });
  if (!referralCode) {
    throw new ReferralServiceError("A referral code could not be created for this client.", 500);
  }

  const existingEvents = await readReferralEventsForReferrer(supabase, input.clientId);
  const duplicate = existingEvents.find((event) => normalizeEmail(event.referredClientEmail) === normalizedInviteEmail);
  if (duplicate) {
    throw new ReferralServiceError("This referral invite has already been shared.", 409);
  }

  const insert = await supabase
    .from("referral_events")
    .insert({
      id: stableUuid(`referral-event:${referralCode.id}:${normalizedInviteEmail}`),
      referral_code_id: referralCode.id,
      referrer_client_reference: input.clientId,
      referrer_client_email: normalizedClientEmail,
      referred_client_email: normalizedInviteEmail,
      status: "invited",
      reward_points: referralCode.rewardPoints,
      metadata: {},
      created_at: new Date().toISOString()
    })
    .select(REFERRAL_SELECT)
    .single();

  if (insert.error) {
    throw new ReferralServiceError("Unable to create the referral invite.", 500);
  }

  return {
    referralCode: toReferralCodeRecord(referralCode),
    referralEvent: mapReferralEventRow(insert.data as unknown as ReferralEventRow)
  };
}

export async function syncReferralAttribution(
  input: {
    referralCode: string;
    referredClientId: string;
    referredClientEmail: string;
  },
  supabaseOverride?: SupabaseClient | null
) {
  const supabase = getRequiredSupabase(supabaseOverride);
  const normalizedEmail = normalizeEmail(input.referredClientEmail);
  const referralCode = await readReferralCodeByCode(supabase, input.referralCode);
  if (!referralCode) {
    return { referralEvent: null };
  }

  if (
    referralCode.clientId === input.referredClientId
    || normalizeEmail(referralCode.clientEmail) === normalizedEmail
  ) {
    return { referralEvent: null };
  }

  const existing = (await readReferralEventsForReferredClient(supabase, input.referredClientId))[0]
    ?? (await readReferralEventsForReferrer(supabase, referralCode.clientId)).find((event) => normalizeEmail(event.referredClientEmail) === normalizedEmail)
    ?? null;

  const now = new Date().toISOString();
  if (!existing) {
    const insert = await supabase
      .from("referral_events")
      .insert({
        id: stableUuid(`referral-event:${referralCode.id}:${normalizedEmail}`),
        referral_code_id: referralCode.id,
        referrer_client_reference: referralCode.clientId,
        referrer_client_email: referralCode.clientEmail,
        referred_client_email: normalizedEmail,
        referred_client_reference: input.referredClientId,
        status: "signed_up",
        reward_points: referralCode.rewardPoints,
        metadata: {},
        created_at: now,
        signed_up_at: now
      })
      .select(REFERRAL_SELECT)
      .single();

    if (insert.error) {
      throw new ReferralServiceError("Unable to attach the referral attribution.", 500);
    }

    return { referralEvent: mapReferralEventRow(insert.data as unknown as ReferralEventRow) };
  }

  if (existing.referrerClientId === input.referredClientId) {
    return { referralEvent: null };
  }

  return {
    referralEvent: await updateReferralEvent(supabase, existing.id, {
      referred_client_email: normalizedEmail,
      referred_client_reference: input.referredClientId,
      status: getStatusRank(existing.status) >= getStatusRank("signed_up") ? existing.status : "signed_up",
      signed_up_at: existing.signedUpAt ?? now
    })
  };
}

export async function recordReferralBookingProgress(
  input: {
    clientId: string;
    appointmentId: string;
  },
  supabaseOverride?: SupabaseClient | null
) {
  const supabase = getRequiredSupabase(supabaseOverride);
  const existing = (await readReferralEventsForReferredClient(supabase, input.clientId))
    .find((event) => event.referrerClientId !== input.clientId && event.status !== "credited");

  if (!existing) {
    return { referralEvent: null };
  }

  const now = new Date().toISOString();
  return {
    referralEvent: await updateReferralEvent(supabase, existing.id, {
      appointment_reference: existing.appointmentId ?? input.appointmentId,
      status: getStatusRank(existing.status) >= getStatusRank("booked") ? existing.status : "booked",
      signed_up_at: existing.signedUpAt ?? now,
      booked_at: existing.bookedAt ?? now
    })
  };
}

export async function readQualifyingReferralEvent(
  input: {
    clientId: string;
    appointmentId: string;
  },
  supabaseOverride?: SupabaseClient | null
) {
  const supabase = supabaseOverride ?? getSupabase(false);
  if (!supabase) {
    return null;
  }

  const candidates = await readReferralEventsForReferredClient(supabase, input.clientId);
  return candidates.find((event) =>
    event.referrerClientId !== input.clientId
    && (event.status === "booked" || event.status === "completed")
    && event.appointmentId === input.appointmentId
  ) ?? null;
}

export async function finalizeReferralReward(
  input: {
    referralEventId: string;
    appointmentId: string;
    creditedTransactionId: string;
    rewardPointsIssued?: number;
    occurredAt?: string | null;
  },
  supabaseOverride?: SupabaseClient | null
) {
  const supabase = getRequiredSupabase(supabaseOverride);
  const existing = await readReferralEventById(supabase, input.referralEventId);
  if (!existing) {
    throw new ReferralServiceError("Referral event not found for reward finalization.", 404);
  }

  if (
    existing.creditedTransactionId
    && existing.creditedTransactionId !== input.creditedTransactionId
  ) {
    throw new ReferralServiceError("Referral reward has already been linked to a different ledger entry.", 409);
  }

  if (existing.status === "credited" && existing.creditedTransactionId === input.creditedTransactionId) {
    return { referralEvent: existing };
  }

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const referralEvent = await updateReferralEvent(supabase, existing.id, {
    appointment_reference: existing.appointmentId ?? input.appointmentId,
    status: "credited",
    completed_at: existing.completedAt ?? occurredAt,
    credited_at: existing.creditedAt ?? occurredAt,
    credited_transaction_reference: existing.creditedTransactionId ?? input.creditedTransactionId
  });

  const events: PlatformEventInput[] = [];
  if (!existing.completedAt) {
    events.push({
      eventType: "referral_qualified",
      entityType: "referral_event",
      entityId: referralEvent.id,
      actorId: referralEvent.referrerClientId,
      actorRole: "client",
      source: "system",
      relatedIds: {
        referralEventId: referralEvent.id,
        referralCodeId: referralEvent.referralCodeId,
        appointmentId: referralEvent.appointmentId,
        referredClientId: referralEvent.referredClientId,
        referrerClientId: referralEvent.referrerClientId
      },
      payload: {
        rewardPoints: referralEvent.rewardPoints,
        previousStatus: existing.status,
        nextStatus: "completed"
      },
      idempotencyKey: buildPlatformEventIdempotencyKey(["referral", referralEvent.id, "qualified"]),
      occurredAt
    });
  }

  if (!existing.creditedAt) {
    events.push({
      eventType: "referral_rewarded",
      entityType: "referral_event",
      entityId: referralEvent.id,
      actorId: referralEvent.referrerClientId,
      actorRole: "client",
      source: "system",
      relatedIds: {
        referralEventId: referralEvent.id,
        referralCodeId: referralEvent.referralCodeId,
        appointmentId: referralEvent.appointmentId,
        referredClientId: referralEvent.referredClientId,
        referrerClientId: referralEvent.referrerClientId,
        creditedTransactionId: referralEvent.creditedTransactionId
      },
      payload: {
        rewardPoints: referralEvent.rewardPoints,
        rewardPointsIssued: input.rewardPointsIssued ?? referralEvent.rewardPoints,
        previousStatus: existing.status,
        nextStatus: referralEvent.status
      },
      idempotencyKey: buildPlatformEventIdempotencyKey(["referral", referralEvent.id, "rewarded"]),
      occurredAt
    });
  }

  if (events.length) {
    await recordRequiredPlatformEvents(supabase, events);
  }

  return { referralEvent };
}
