import { Buffer } from "node:buffer";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deliverAndRecordNotification } from "@/lib/notifications/delivery";
import { maskEmail, maskPhone } from "@/lib/kiosk/priority1";

export type PriorityOneIdentityMethod = "username" | "phone" | "email";
export type PriorityOneIdentityChannel = "sms" | "email";

export interface PriorityOneIdentityCandidate {
  candidateToken: string;
  displayName: string;
  publicUsername: string | null;
  maskedPhone: string | null;
  maskedEmail: string | null;
  availableChannels: PriorityOneIdentityChannel[];
  accountRestricted: boolean;
}

export interface PriorityOneIdentityChallengeResult {
  challengeId: string;
  channel: PriorityOneIdentityChannel;
  destinationMasked: string;
  expiresAt: string;
  deliveryStatus: "sent";
}

export interface PriorityOneIdentityVerificationResult {
  verificationToken: string;
  verificationExpiresAt: string;
  displayName: string;
  publicUsername: string | null;
}

export class PriorityOneIdentityError extends Error {
  constructor(public message: string, public status = 400, public code = "priority1_identity_error") {
    super(message);
    this.name = "PriorityOneIdentityError";
  }
}

function admin() {
  const client = createSupabaseAdminClient();
  if (!client) throw new PriorityOneIdentityError("Supabase is unavailable.", 503, "supabase_unavailable");
  return client;
}

function secret() {
  const value = process.env.KIOSK_VERIFICATION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new PriorityOneIdentityError("Kiosk verification is not configured.", 503, "verification_secret_missing");
  return value;
}

function token() {
  return randomBytes(32).toString("base64url");
}

function hash(value: string) {
  return createHash("sha256").update(`${secret()}:${value}`).digest("hex");
}

function codeHash(challengeId: string, code: string) {
  return hash(`${challengeId}:${code}`);
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeLookup(method: PriorityOneIdentityMethod, value: string) {
  const trimmed = value.trim();
  if (method === "email") return trimmed.toLowerCase();
  if (method === "phone") return normalizePhone(trimmed);
  return trimmed.replace(/^@+/, "").toLowerCase();
}

function maskedName(value: string | null) {
  const words = (value ?? "BVRB3R Client").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "BVRB3R Client";
  return words.length === 1 ? words[0] : `${words[0]} ${words.at(-1)?.slice(0, 1) ?? ""}.`;
}

function compareHashes(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function searchPriorityOneClientIdentity(input: {
  shopId: string;
  method: PriorityOneIdentityMethod;
  value: string;
}): Promise<PriorityOneIdentityCandidate[]> {
  const value = normalizeLookup(input.method, input.value);
  if ((input.method === "username" && value.length < 3) || (input.method === "phone" && value.length < 7) || (input.method === "email" && !value.includes("@"))) {
    throw new PriorityOneIdentityError("Enter a complete username, phone number, or email.", 400, "identity_lookup_invalid");
  }

  const supabase = admin();
  let query = supabase
    .from("profiles")
    .select("id, full_name, email, phone, public_username, role, onboarding_state")
    .eq("role", "client_user")
    .limit(3);

  if (input.method === "username") query = query.eq("public_username", value);
  if (input.method === "email") query = query.eq("email", value);
  if (input.method === "phone") query = query.eq("phone", input.value.trim());

  let result = await query;
  if (!result.error && input.method === "phone" && !(result.data ?? []).length && value !== input.value.trim()) {
    result = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, public_username, role, onboarding_state")
      .eq("role", "client_user")
      .eq("phone", value)
      .limit(3);
  }
  if (result.error) throw new PriorityOneIdentityError("Unable to search client accounts.", 500, "identity_lookup_failed");

  const candidates: PriorityOneIdentityCandidate[] = [];
  for (const profile of result.data ?? []) {
    const client = await supabase.from("clients").select("id").eq("profile_id", profile.id).maybeSingle();
    if (client.error) throw new PriorityOneIdentityError("Unable to resolve client identity.", 500, "client_identity_failed");

    const rawCandidateToken = token();
    const candidateExpiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const challenge = await supabase.from("kiosk_identity_challenges").insert({
      shop_id: input.shopId,
      profile_id: profile.id,
      client_id: client.data?.id ?? null,
      purpose: "kiosk_account_link",
      status: "candidate",
      candidate_token_hash: hash(rawCandidateToken),
      candidate_expires_at: candidateExpiresAt,
      idempotency_key: `identity-candidate:${input.shopId}:${profile.id}:${randomBytes(8).toString("hex")}`,
      metadata: { lookup_method: input.method }
    }).select("id").single();
    if (challenge.error) throw new PriorityOneIdentityError("Unable to protect the identity result.", 500, "identity_candidate_failed");

    const channels: PriorityOneIdentityChannel[] = [];
    if (profile.phone) channels.push("sms");
    if (profile.email) channels.push("email");
    candidates.push({
      candidateToken: rawCandidateToken,
      displayName: maskedName(profile.full_name),
      publicUsername: profile.public_username ? `@${String(profile.public_username).slice(0, 1)}•••` : null,
      maskedPhone: maskPhone(profile.phone),
      maskedEmail: maskEmail(profile.email),
      availableChannels: channels,
      accountRestricted: false
    });
  }

  return candidates;
}

export async function startPriorityOneIdentityChallenge(input: {
  candidateToken: string;
  channel: PriorityOneIdentityChannel;
}): Promise<PriorityOneIdentityChallengeResult> {
  const supabase = admin();
  const challengeResult = await supabase
    .from("kiosk_identity_challenges")
    .select("id, profile_id, client_id, shop_id, status, candidate_expires_at, attempts")
    .eq("candidate_token_hash", hash(input.candidateToken))
    .maybeSingle();
  if (challengeResult.error || !challengeResult.data) throw new PriorityOneIdentityError("That account result expired. Search again.", 404, "identity_candidate_missing");
  const challenge = challengeResult.data;
  if (new Date(challenge.candidate_expires_at).getTime() <= Date.now()) {
    await supabase.from("kiosk_identity_challenges").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", challenge.id);
    throw new PriorityOneIdentityError("That account result expired. Search again.", 410, "identity_candidate_expired");
  }

  const profileResult = await supabase.from("profiles").select("id, email, phone, full_name, public_username").eq("id", challenge.profile_id).maybeSingle();
  if (profileResult.error || !profileResult.data) throw new PriorityOneIdentityError("The account could not be verified.", 404, "identity_profile_missing");
  const destination = input.channel === "sms" ? profileResult.data.phone : profileResult.data.email;
  if (!destination) throw new PriorityOneIdentityError(`This account cannot verify by ${input.channel}.`, 409, "identity_channel_unavailable");

  const verificationCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  await supabase.from("kiosk_identity_challenges").update({
    status: "sending",
    channel: input.channel,
    destination_masked: input.channel === "sms" ? maskPhone(destination) : maskEmail(destination),
    verification_code_hash: codeHash(challenge.id, verificationCode),
    code_expires_at: expiresAt,
    updated_at: new Date().toISOString()
  }).eq("id", challenge.id);

  const delivery = await deliverAndRecordNotification({
    channel: input.channel,
    to: destination,
    title: "Your BVRB3R verification code",
    body: `Your BVRB3R kiosk verification code is ${verificationCode}. It expires in 10 minutes. Never share this code with anyone.`,
    notificationType: "kiosk_identity_verification",
    profileId: challenge.profile_id,
    clientReference: challenge.client_id,
    locationReference: challenge.shop_id,
    dedupeKey: `kiosk-identity:${challenge.id}:${Date.now()}`,
    metadata: { challenge_id: challenge.id, expires_at: expiresAt, operational: true },
    consentGranted: true,
    operational: true
  });

  if (delivery.status !== "sent") {
    await supabase.from("kiosk_identity_challenges").update({ status: "failed", updated_at: new Date().toISOString(), metadata: { delivery_failure: delivery.failureCode } }).eq("id", challenge.id);
    throw new PriorityOneIdentityError("The verification message could not be delivered. Try another channel or continue as guest.", 503, delivery.failureCode ?? "identity_delivery_failed");
  }

  await supabase.from("kiosk_identity_challenges").update({ status: "sent", updated_at: new Date().toISOString() }).eq("id", challenge.id);
  return {
    challengeId: challenge.id,
    channel: input.channel,
    destinationMasked: delivery.destinationMasked,
    expiresAt,
    deliveryStatus: "sent"
  };
}

export async function verifyPriorityOneIdentityChallenge(input: {
  challengeId: string;
  code: string;
}): Promise<PriorityOneIdentityVerificationResult> {
  const supabase = admin();
  const result = await supabase
    .from("kiosk_identity_challenges")
    .select("id, profile_id, status, verification_code_hash, code_expires_at, attempts, max_attempts")
    .eq("id", input.challengeId)
    .maybeSingle();
  if (result.error || !result.data) throw new PriorityOneIdentityError("Verification session not found.", 404, "identity_challenge_missing");
  const challenge = result.data;
  if (challenge.status === "locked" || Number(challenge.attempts) >= Number(challenge.max_attempts)) {
    throw new PriorityOneIdentityError("Too many attempts. Search again or continue as guest.", 423, "identity_challenge_locked");
  }
  if (!challenge.code_expires_at || new Date(challenge.code_expires_at).getTime() <= Date.now()) {
    await supabase.from("kiosk_identity_challenges").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", challenge.id);
    throw new PriorityOneIdentityError("That code expired. Request a new code.", 410, "identity_code_expired");
  }

  const nextAttempts = Number(challenge.attempts) + 1;
  const submittedHash = codeHash(challenge.id, input.code.replace(/\D/g, ""));
  if (!challenge.verification_code_hash || !compareHashes(challenge.verification_code_hash, submittedHash)) {
    const locked = nextAttempts >= Number(challenge.max_attempts);
    await supabase.from("kiosk_identity_challenges").update({ status: locked ? "locked" : "sent", attempts: nextAttempts, updated_at: new Date().toISOString() }).eq("id", challenge.id);
    throw new PriorityOneIdentityError(locked ? "Too many attempts. Search again or continue as guest." : "That code does not match.", locked ? 423 : 401, locked ? "identity_challenge_locked" : "identity_code_incorrect");
  }

  const rawVerificationToken = token();
  const verificationExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  await supabase.from("kiosk_identity_challenges").update({
    status: "verified",
    attempts: nextAttempts,
    verified_at: new Date().toISOString(),
    verification_token_hash: hash(rawVerificationToken),
    verification_token_expires_at: verificationExpiresAt,
    updated_at: new Date().toISOString()
  }).eq("id", challenge.id);

  const profile = await supabase.from("profiles").select("full_name, public_username").eq("id", challenge.profile_id).maybeSingle();
  if (profile.error || !profile.data) throw new PriorityOneIdentityError("Verified account could not be loaded.", 500, "verified_profile_missing");
  return {
    verificationToken: rawVerificationToken,
    verificationExpiresAt,
    displayName: profile.data.full_name ?? "BVRB3R Client",
    publicUsername: profile.data.public_username ?? null
  };
}

export async function resolveVerifiedPriorityOneIdentity(verificationToken: string) {
  const supabase = admin();
  const result = await supabase
    .from("kiosk_identity_challenges")
    .select("id, profile_id, client_id, shop_id, status, verification_token_expires_at")
    .eq("verification_token_hash", hash(verificationToken))
    .eq("status", "verified")
    .maybeSingle();
  if (result.error || !result.data) throw new PriorityOneIdentityError("Account verification is required.", 401, "identity_verification_required");
  if (!result.data.verification_token_expires_at || new Date(result.data.verification_token_expires_at).getTime() <= Date.now()) {
    await supabase.from("kiosk_identity_challenges").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", result.data.id);
    throw new PriorityOneIdentityError("Account verification expired. Verify again.", 410, "identity_verification_expired");
  }

  const profile = await supabase.from("profiles").select("id, full_name, email, phone, public_username, role").eq("id", result.data.profile_id).eq("role", "client_user").maybeSingle();
  if (profile.error || !profile.data) throw new PriorityOneIdentityError("Verified account is unavailable.", 404, "verified_profile_missing");
  let clientId = result.data.client_id as string | null;
  if (!clientId) {
    const client = await supabase.from("clients").select("id").eq("profile_id", profile.data.id).maybeSingle();
    if (client.error || !client.data) throw new PriorityOneIdentityError("Verified client record is unavailable.", 404, "verified_client_missing");
    clientId = client.data.id;
  }
  return { challengeId: result.data.id, clientId, profile: profile.data };
}
