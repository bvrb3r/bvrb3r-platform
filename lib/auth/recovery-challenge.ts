import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual
} from "node:crypto";
import {
  hasEmailDeliveryConfig,
  hasTwilioDeliveryConfig,
  runtimeConfig
} from "@/lib/config/runtime";
import {
  findProfileByEmail,
  normalizeEmail,
  normalizePhone,
  resolvePasswordRecoveryEmail,
  type PasswordRecoverySupabaseClient
} from "@/lib/auth/password-recovery";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const RECOVERY_CODE_EXPIRES_SECONDS = 10 * 60;
export const RECOVERY_CODE_ATTEMPT_LIMIT = 5;
export const RECOVERY_REQUEST_LIMIT_PER_TARGET = 5;
export const RECOVERY_REQUEST_LIMIT_PER_SOURCE = 20;

type RecoveryChannel = "email" | "sms";
type RecoveryChallengeStatus =
  | "issued"
  | "verified"
  | "consumed"
  | "expired"
  | "locked"
  | "delivery_failed";

type RecoveryChallengeRow = {
  id: string;
  profile_id: string | null;
  channel: RecoveryChannel;
  target_hash: string;
  request_source_hash: string;
  code_hash: string;
  reset_token_hash: string | null;
  attempt_count: number;
  status: RecoveryChallengeStatus;
  expires_at: string;
  verified_at: string | null;
  consumed_at: string | null;
  created_at: string;
  updated_at: string;
};

type DemoRecoveryChallenge = RecoveryChallengeRow & {
  destination: string;
};

declare global {
  var __bvrb3rRecoveryChallenges: DemoRecoveryChallenge[] | undefined;
}

export class RecoveryChallengeError extends Error {
  status: number;
  code: string;
  retryAfterSeconds?: number;

  constructor(
    message: string,
    status = 400,
    code = "recovery_error",
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "RecoveryChallengeError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function demoMode() {
  return process.env.NEXT_PUBLIC_AUTH_MODE === "demo"
    || process.env.NODE_ENV === "test";
}

function challengeStore() {
  if (!globalThis.__bvrb3rRecoveryChallenges) {
    globalThis.__bvrb3rRecoveryChallenges = [];
  }
  return globalThis.__bvrb3rRecoveryChallenges;
}

export function resetDemoRecoveryChallenges() {
  globalThis.__bvrb3rRecoveryChallenges = [];
}

function recoverySecret() {
  const secret = process.env.AUTH_RECOVERY_SECRET
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (secret) {
    return secret;
  }
  if (demoMode()) {
    return "bvrb3r-pr30-demo-recovery-secret";
  }
  throw new RecoveryChallengeError(
    "Account recovery is temporarily unavailable.",
    503,
    "recovery_unavailable"
  );
}

function digest(kind: string, challengeId: string, value: string) {
  return createHash("sha256")
    .update(`${kind}:${challengeId}:${value}:${recoverySecret()}`)
    .digest("hex");
}

function digestTarget(value: string) {
  return createHash("sha256")
    .update(`target:${value}:${recoverySecret()}`)
    .digest("hex");
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length
    && timingSafeEqual(leftBuffer, rightBuffer);
}

function maskDestination(channel: RecoveryChannel, destination: string) {
  if (channel === "sms") {
    const normalized = normalizePhone(destination);
    return normalized ? `••• ••• ${normalized.slice(-4)}` : "your mobile number";
  }
  const [local, domain] = normalizeEmail(destination).split("@");
  return local && domain ? `${local.slice(0, 1)}•••@${domain}` : "your email";
}

function normalizeDestination(channel: RecoveryChannel, destination: string) {
  const normalized = channel === "sms"
    ? normalizePhone(destination)
    : normalizeEmail(destination);
  if (!normalized) {
    throw new RecoveryChallengeError(
      channel === "sms"
        ? "Enter a valid mobile number."
        : "Enter a valid email address.",
      400,
      "invalid_destination"
    );
  }
  return normalized;
}

async function sendRecoveryEmail(destination: string, code: string) {
  if (!hasEmailDeliveryConfig()) {
    throw new RecoveryChallengeError(
      "Email recovery is temporarily unavailable.",
      503,
      "delivery_unavailable"
    );
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtimeConfig.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: runtimeConfig.resendFromEmail,
      to: [destination],
      subject: "Your BVRB3R recovery code",
      text: `Your BVRB3R recovery code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this message.`
    })
  });
  if (!response.ok) {
    throw new RecoveryChallengeError(
      "We could not deliver the recovery code.",
      503,
      "delivery_failed"
    );
  }
}

async function sendRecoverySms(destination: string, code: string) {
  if (!hasTwilioDeliveryConfig()) {
    throw new RecoveryChallengeError(
      "SMS recovery is temporarily unavailable.",
      503,
      "delivery_unavailable"
    );
  }
  const body = new URLSearchParams();
  body.set("To", destination);
  body.set("Body", `Your BVRB3R recovery code is ${code}. It expires in 10 minutes.`);
  if (runtimeConfig.twilioMessagingServiceSid) {
    body.set("MessagingServiceSid", runtimeConfig.twilioMessagingServiceSid);
  } else {
    body.set("From", runtimeConfig.twilioFromNumber);
  }
  const credentials = Buffer.from(
    `${runtimeConfig.twilioAccountSid}:${runtimeConfig.twilioAuthToken}`
  ).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${runtimeConfig.twilioAccountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    }
  );
  if (!response.ok) {
    throw new RecoveryChallengeError(
      "We could not deliver the recovery code.",
      503,
      "delivery_failed"
    );
  }
}

async function resolveProfileId(
  client: PasswordRecoverySupabaseClient,
  channel: RecoveryChannel,
  destination: string
) {
  const resolved = await resolvePasswordRecoveryEmail(client, destination);
  if (!resolved?.email) {
    return null;
  }
  if (resolved.profileId) {
    return resolved.profileId;
  }
  if (channel === "sms") {
    return (await findProfileByEmail(client, resolved.email))?.profileId ?? null;
  }
  return null;
}

function demoRateCount(
  key: "target_hash" | "request_source_hash",
  value: string,
  since: number
) {
  return challengeStore().filter(
    (challenge) => challenge[key] === value
      && new Date(challenge.created_at).getTime() >= since
  ).length;
}

async function assertRequestRate(
  targetHash: string,
  sourceHash: string
) {
  const since = Date.now() - 60 * 60 * 1000;
  const supabase = createSupabaseAdminClient();
  let targetCount = demoRateCount("target_hash", targetHash, since);
  let sourceCount = demoRateCount("request_source_hash", sourceHash, since);

  if (supabase && !demoMode()) {
    const sinceIso = new Date(since).toISOString();
    const [target, source] = await Promise.all([
      supabase
        .from("auth_recovery_challenges")
        .select("id", { count: "exact", head: true })
        .eq("target_hash", targetHash)
        .gte("created_at", sinceIso),
      supabase
        .from("auth_recovery_challenges")
        .select("id", { count: "exact", head: true })
        .eq("request_source_hash", sourceHash)
        .gte("created_at", sinceIso)
    ]);
    if (target.error || source.error) {
      throw new RecoveryChallengeError(
        "Account recovery is temporarily unavailable.",
        503,
        "recovery_unavailable"
      );
    }
    targetCount = target.count ?? 0;
    sourceCount = source.count ?? 0;
  }

  if (
    targetCount >= RECOVERY_REQUEST_LIMIT_PER_TARGET
    || sourceCount >= RECOVERY_REQUEST_LIMIT_PER_SOURCE
  ) {
    throw new RecoveryChallengeError(
      "Too many recovery requests. Try again in 15 minutes.",
      429,
      "rate_limited",
      15 * 60
    );
  }
}

async function persistChallenge(row: DemoRecoveryChallenge) {
  if (demoMode()) {
    challengeStore().unshift(row);
    return row;
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new RecoveryChallengeError(
      "Account recovery is temporarily unavailable.",
      503,
      "recovery_unavailable"
    );
  }
  const databaseRow: RecoveryChallengeRow = {
    id: row.id,
    profile_id: row.profile_id,
    channel: row.channel,
    target_hash: row.target_hash,
    request_source_hash: row.request_source_hash,
    code_hash: row.code_hash,
    reset_token_hash: row.reset_token_hash,
    attempt_count: row.attempt_count,
    status: row.status,
    expires_at: row.expires_at,
    verified_at: row.verified_at,
    consumed_at: row.consumed_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
  const result = await supabase
    .from("auth_recovery_challenges")
    .insert(databaseRow)
    .select("*")
    .single();
  if (result.error) {
    throw new RecoveryChallengeError(
      "Account recovery is temporarily unavailable.",
      503,
      "recovery_unavailable"
    );
  }
  return result.data as RecoveryChallengeRow;
}

async function readChallenge(id: string) {
  if (demoMode()) {
    return challengeStore().find((challenge) => challenge.id === id) ?? null;
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new RecoveryChallengeError(
      "Account recovery is temporarily unavailable.",
      503,
      "recovery_unavailable"
    );
  }
  const result = await supabase
    .from("auth_recovery_challenges")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (result.error) {
    throw new RecoveryChallengeError(
      "Account recovery is temporarily unavailable.",
      503,
      "recovery_unavailable"
    );
  }
  return result.data as RecoveryChallengeRow | null;
}

async function updateChallenge(id: string, values: Partial<RecoveryChallengeRow>) {
  if (demoMode()) {
    const challenge = challengeStore().find((candidate) => candidate.id === id);
    if (challenge) {
      Object.assign(challenge, values, { updated_at: new Date().toISOString() });
    }
    return;
  }
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new RecoveryChallengeError(
      "Account recovery is temporarily unavailable.",
      503,
      "recovery_unavailable"
    );
  }
  const result = await supabase
    .from("auth_recovery_challenges")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (result.error) {
    throw new RecoveryChallengeError(
      "Account recovery is temporarily unavailable.",
      503,
      "recovery_unavailable"
    );
  }
}

export async function requestRecoveryChallenge(input: {
  channel: RecoveryChannel;
  destination: string;
  requestSource: string;
}) {
  const destination = normalizeDestination(input.channel, input.destination);
  if (!demoMode()) {
    const deliveryReady = input.channel === "sms"
      ? hasTwilioDeliveryConfig()
      : hasEmailDeliveryConfig();
    if (!deliveryReady) {
      throw new RecoveryChallengeError(
        `${input.channel === "sms" ? "SMS" : "Email"} recovery is temporarily unavailable.`,
        503,
        "delivery_unavailable"
      );
    }
  }
  const sourceHash = digestTarget(`source:${input.requestSource}`);
  const targetHash = digestTarget(`${input.channel}:${destination}`);
  await assertRequestRate(targetHash, sourceHash);

  const supabase = createSupabaseAdminClient();
  const profileId = supabase && !demoMode()
    ? await resolveProfileId(
      supabase as unknown as PasswordRecoverySupabaseClient,
      input.channel,
      destination
    )
    : demoMode()
      ? "00000000-0000-4000-8000-000000000030"
      : null;
  const id = randomUUID();
  const code = String(randomInt(100000, 1000000));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RECOVERY_CODE_EXPIRES_SECONDS * 1000);
  const row: DemoRecoveryChallenge = {
    id,
    profile_id: profileId,
    channel: input.channel,
    target_hash: targetHash,
    request_source_hash: sourceHash,
    code_hash: digest("code", id, code),
    reset_token_hash: null,
    attempt_count: 0,
    status: "issued",
    expires_at: expiresAt.toISOString(),
    verified_at: null,
    consumed_at: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    destination
  };
  await persistChallenge(row);

  if (profileId && !demoMode()) {
    try {
      if (input.channel === "sms") {
        await sendRecoverySms(destination, code);
      } else {
        await sendRecoveryEmail(destination, code);
      }
    } catch (error) {
      await updateChallenge(id, { status: "delivery_failed" });
      throw error;
    }
  }

  return {
    challengeId: id,
    maskedDestination: maskDestination(input.channel, destination),
    expiresInSeconds: RECOVERY_CODE_EXPIRES_SECONDS,
    ...(demoMode() ? { demoCode: code } : {})
  };
}

export async function verifyRecoveryChallenge(input: {
  challengeId: string;
  code: string;
}) {
  const challenge = await readChallenge(input.challengeId);
  if (!challenge || challenge.status === "delivery_failed") {
    throw new RecoveryChallengeError(
      "That recovery request is not valid. Start again.",
      400,
      "invalid_challenge"
    );
  }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await updateChallenge(challenge.id, { status: "expired" });
    throw new RecoveryChallengeError(
      "That code expired. Request a new six-digit code.",
      410,
      "code_expired"
    );
  }
  if (challenge.attempt_count >= RECOVERY_CODE_ATTEMPT_LIMIT || challenge.status === "locked") {
    throw new RecoveryChallengeError(
      "Too many incorrect codes. Start recovery again.",
      429,
      "challenge_locked"
    );
  }
  if (!/^\d{6}$/.test(input.code)) {
    throw new RecoveryChallengeError(
      "Enter the complete six-digit code.",
      400,
      "invalid_code"
    );
  }

  const nextAttempts = challenge.attempt_count + 1;
  if (!secureEqual(challenge.code_hash, digest("code", challenge.id, input.code))) {
    const locked = nextAttempts >= RECOVERY_CODE_ATTEMPT_LIMIT;
    await updateChallenge(challenge.id, {
      attempt_count: nextAttempts,
      status: locked ? "locked" : "issued"
    });
    throw new RecoveryChallengeError(
      locked
        ? "Too many incorrect codes. Start recovery again."
        : `That code is incorrect. ${RECOVERY_CODE_ATTEMPT_LIMIT - nextAttempts} attempts remain.`,
      locked ? 429 : 400,
      locked ? "challenge_locked" : "invalid_code"
    );
  }

  const resetToken = randomBytes(32).toString("base64url");
  const verifiedAt = new Date().toISOString();
  await updateChallenge(challenge.id, {
    attempt_count: nextAttempts,
    status: "verified",
    verified_at: verifiedAt,
    reset_token_hash: digest("reset", challenge.id, resetToken)
  });
  return {
    resetToken,
    expiresInSeconds: Math.max(
      1,
      Math.floor((new Date(challenge.expires_at).getTime() - Date.now()) / 1000)
    )
  };
}

export async function completeRecoveryChallenge(input: {
  challengeId: string;
  resetToken: string;
  newPassword: string;
}) {
  if (input.newPassword.length < 8) {
    throw new RecoveryChallengeError(
      "Password must be at least 8 characters.",
      400,
      "weak_password"
    );
  }
  const challenge = await readChallenge(input.challengeId);
  if (
    !challenge
    || challenge.status !== "verified"
    || !challenge.reset_token_hash
    || challenge.consumed_at
  ) {
    throw new RecoveryChallengeError(
      "That verified recovery session is no longer valid. Start again.",
      400,
      "invalid_reset_session"
    );
  }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await updateChallenge(challenge.id, { status: "expired" });
    throw new RecoveryChallengeError(
      "That verified recovery session expired. Start again.",
      410,
      "reset_session_expired"
    );
  }
  if (!secureEqual(
    challenge.reset_token_hash,
    digest("reset", challenge.id, input.resetToken)
  )) {
    throw new RecoveryChallengeError(
      "That verified recovery session is no longer valid. Start again.",
      400,
      "invalid_reset_session"
    );
  }
  if (!challenge.profile_id) {
    throw new RecoveryChallengeError(
      "That verified recovery session cannot reset an account. Contact support.",
      400,
      "account_unavailable"
    );
  }

  if (demoMode()) {
    await updateChallenge(challenge.id, {
      status: "consumed",
      consumed_at: new Date().toISOString()
    });
    return { completed: true, signInEmail: "client@bvrb3r.demo" };
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new RecoveryChallengeError(
      "Account recovery is temporarily unavailable.",
      503,
      "recovery_unavailable"
    );
  }

  const userResult = await supabase.auth.admin.getUserById(challenge.profile_id);
  if (userResult.error || !userResult.data.user?.email) {
    throw new RecoveryChallengeError(
      "We could not finish this reset. Contact support.",
      409,
      "account_unavailable"
    );
  }
  const update = await supabase.auth.admin.updateUserById(challenge.profile_id, {
    password: input.newPassword
  });
  if (update.error) {
    throw new RecoveryChallengeError(
      "We could not save that password. Try again.",
      500,
      "password_update_failed"
    );
  }
  await updateChallenge(challenge.id, {
    status: "consumed",
    consumed_at: new Date().toISOString()
  });
  return {
    completed: true,
    signInEmail: userResult.data.user.email
  };
}
