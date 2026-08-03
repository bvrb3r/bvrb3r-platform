import "server-only";

import {
  appIdentityRoleLabel,
  appIdentityScanHint,
  buildAppIdentityScanActions,
  isAppIdentityRole,
  type AppIdentityPublicReference,
  type AppIdentityRole,
  type AppIdentityScanAction
} from "@/lib/app-id/catalog";
import {
  AppIdentityTokenError,
  signAppIdentityToken,
  verifyAppIdentityToken
} from "@/lib/app-id/token.server";
import { productionSupabaseTruthError, runtimeConfig, shouldRequireProductionSupabaseTruth } from "@/lib/config/runtime";
import { encodeKioskQr, type KioskQrSymbol } from "@/lib/kiosk/qr";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

type AdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

type AppIdentityServiceDependencies = {
  supabase?: AdminClient | null;
  signingSecret?: string;
  appUrl?: string;
  now?: Date;
  appleWalletIssuerTemplate?: string;
  googleWalletIssuerTemplate?: string;
};

type AppIdentityCardRow = {
  user_id: string;
  role: string;
  public_identifier: string;
  code_version: number;
  code_expires_at: string;
  paused_at: string | null;
  regenerated_at: string | null;
};

type PublicIdentity = {
  role: AppIdentityRole;
  displayName: string;
  username: string | null;
  initials: string;
  avatarUrl: string | null;
  verified: boolean;
  verificationLabel: string;
  reference: AppIdentityPublicReference;
};

export type AppIdentityWalletProvider = {
  provider: "apple" | "google";
  label: string;
  status: "ready" | "setup_required" | "paused";
  href: string | null;
  detail: string;
};

export type AppIdentitySnapshot = PublicIdentity & {
  roleTag: string;
  scanHint: string;
  serverTruth: "connected" | "unavailable";
  paused: boolean;
  expiresAt: string | null;
  regeneratedAt: string | null;
  scanUrl: string | null;
  qr: KioskQrSymbol | null;
  qrUnavailableReason: string | null;
  walletProviders: AppIdentityWalletProvider[];
  actions: AppIdentityScanAction[];
};

export type AppIdentityScanResolution = {
  status: "valid" | "invalid" | "expired" | "paused" | "unavailable";
  message: string;
  identity: (PublicIdentity & {
    roleTag: string;
    scanHint: string;
    actions: AppIdentityScanAction[];
  }) | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export class AppIdentityServiceError extends Error {
  constructor(message: string, readonly code: string, readonly status = 500) {
    super(message);
    this.name = "AppIdentityServiceError";
  }
}

function requireRole(user: Pick<UserAccount, "role">): AppIdentityRole {
  if (!isAppIdentityRole(user.role)) {
    throw new AppIdentityServiceError("App ID is available only to Client, Barber, and Shop Owner accounts.", "wrong_role", 403);
  }
  return user.role;
}

function requireUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new AppIdentityServiceError(`${label} is invalid.`, "invalid_identifier", 400);
  }
  return value;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function nullableText(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function integer(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : fallback;
}

function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "ID";
  return `${words[0]?.[0] ?? ""}${words.length > 1 ? words.at(-1)?.[0] ?? "" : words[0]?.[1] ?? ""}`.toUpperCase();
}

function isVerifiedStatus(value: unknown) {
  return value === "verified" || value === "approved";
}

function parseCardRow(value: unknown): AppIdentityCardRow {
  const row = objectValue(value);
  const role = text(row.role);
  const userId = text(row.user_id);
  const publicIdentifier = text(row.public_identifier);
  const codeVersion = integer(row.code_version);
  const expiresAt = text(row.code_expires_at);
  if (!isAppIdentityRole(role)
      || !UUID_PATTERN.test(userId)
      || !UUID_PATTERN.test(publicIdentifier)
      || codeVersion < 1
      || !Number.isFinite(Date.parse(expiresAt))) {
    throw new AppIdentityServiceError("App ID authority returned an invalid card.", "invalid_card_authority");
  }
  return {
    user_id: userId,
    role,
    public_identifier: publicIdentifier,
    code_version: codeVersion,
    code_expires_at: expiresAt,
    paused_at: nullableText(row.paused_at),
    regenerated_at: nullableText(row.regenerated_at)
  };
}

function codeExpiry(now: Date) {
  return new Date(now.getTime() + CODE_LIFETIME_MS);
}

function normalizeAppUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function signingSecret(dependencies?: AppIdentityServiceDependencies) {
  return dependencies?.signingSecret ?? process.env.APP_ID_SIGNING_SECRET ?? "";
}

function buildWalletProvider(
  provider: "apple" | "google",
  template: string,
  token: string | null,
  paused: boolean,
  appUrl: string
): AppIdentityWalletProvider {
  const label = provider === "apple" ? "Add to Apple Wallet" : "Google Wallet";
  if (paused) {
    return {
      provider,
      label,
      status: "paused",
      href: null,
      detail: "Card paused — wallet state is dark and cannot be issued or refreshed."
    };
  }
  if (!token || !template.trim() || !template.includes("{token}")) {
    return {
      provider,
      label,
      status: "setup_required",
      href: null,
      detail: `${provider === "apple" ? "Apple" : "Google"} signed-pass issuer is not configured.`
    };
  }

  const href = template.replaceAll("{token}", encodeURIComponent(token));
  try {
    const candidate = new URL(href, appUrl);
    if (candidate.protocol !== "https:" && !(candidate.protocol === "http:" && ["localhost", "127.0.0.1"].includes(candidate.hostname))) {
      throw new Error("unsupported protocol");
    }
    return {
      provider,
      label,
      status: "ready",
      href: candidate.toString(),
      detail: "Connected to the configured signed-pass issuer."
    };
  } catch {
    return {
      provider,
      label,
      status: "setup_required",
      href: null,
      detail: "The configured signed-pass issuer URL is invalid."
    };
  }
}

function fallbackIdentity(user: Pick<UserAccount, "role" | "name" | "ownedShopName" | "appApprovalStatus" | "shopApprovalStatus">): PublicIdentity {
  const role = requireRole(user);
  const displayName = role === "shop_owner_user" ? user.ownedShopName ?? user.name : user.name;
  const verified = role === "barber_user"
    ? user.appApprovalStatus === "approved"
    : role === "shop_owner_user" && user.shopApprovalStatus === "approved";
  return {
    role,
    displayName,
    username: null,
    initials: initialsFor(displayName),
    avatarUrl: null,
    verified,
    verificationLabel: role === "client_user"
      ? "Member profile"
      : verified
        ? role === "barber_user" ? "License verified ✓" : "Business verified ✓"
        : "Verification pending",
    reference: { username: null, barberId: null, shopId: null }
  };
}

async function loadPublicIdentity(supabase: AdminClient, userId: string, role: AppIdentityRole): Promise<PublicIdentity> {
  const profileResult = await supabase
    .from("profiles")
    .select("full_name, public_username, profile_photo_url, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (profileResult.error || !profileResult.data) {
    throw new AppIdentityServiceError("App ID public profile could not be loaded.", "profile_unavailable");
  }
  const profile = objectValue(profileResult.data);
  const baseName = text(profile.full_name, "BVRB3R member");
  const baseUsername = nullableText(profile.public_username);
  const avatarUrl = nullableText(profile.profile_photo_url);

  if (role === "client_user") {
    const year = new Date(text(profile.created_at)).getUTCFullYear();
    return {
      role,
      displayName: baseName,
      username: baseUsername,
      initials: initialsFor(baseName),
      avatarUrl,
      verified: false,
      verificationLabel: Number.isFinite(year) ? `Member since ${year}` : "BVRB3R member",
      reference: { username: baseUsername, barberId: null, shopId: null }
    };
  }

  const verificationPromise = supabase
    .from("verification_profiles")
    .select("public_verified, license_status, business_status")
    .eq("user_id", userId)
    .eq("role", role === "barber_user" ? "barber" : "shop_owner")
    .maybeSingle();

  if (role === "barber_user") {
    const [barberResult, verificationResult] = await Promise.all([
      supabase
        .from("barbers")
        .select("id, booking_slug")
        .eq("profile_id", userId)
        .maybeSingle(),
      verificationPromise
    ]);
    if (barberResult.error || verificationResult.error) {
      throw new AppIdentityServiceError("Barber App ID evidence could not be loaded.", "barber_identity_unavailable");
    }
    const barber = objectValue(barberResult.data);
    const verification = objectValue(verificationResult.data);
    const username = baseUsername ?? nullableText(barber.booking_slug);
    const verified = verification.public_verified === true && isVerifiedStatus(verification.license_status);
    return {
      role,
      displayName: baseName,
      username,
      initials: initialsFor(baseName),
      avatarUrl,
      verified,
      verificationLabel: verified ? "License verified ✓" : "License not verified",
      reference: {
        username,
        barberId: nullableText(barber.id),
        shopId: null
      }
    };
  }

  const [shopResult, verificationResult] = await Promise.all([
    supabase
      .from("shops")
      .select("id, name, public_username, profile_photo_url")
      .eq("owner_profile_id", userId)
      .maybeSingle(),
    verificationPromise
  ]);
  if (shopResult.error || !shopResult.data || verificationResult.error) {
    throw new AppIdentityServiceError("Shop App ID evidence could not be loaded.", "shop_identity_unavailable");
  }
  const shop = objectValue(shopResult.data);
  const verification = objectValue(verificationResult.data);
  const displayName = text(shop.name, baseName);
  const username = nullableText(shop.public_username);
  const verified = verification.public_verified === true && isVerifiedStatus(verification.business_status);
  return {
    role,
    displayName,
    username,
    initials: initialsFor(displayName),
    avatarUrl: nullableText(shop.profile_photo_url) ?? avatarUrl,
    verified,
    verificationLabel: verified ? "Business verified ✓" : "Business not verified",
    reference: { username, barberId: null, shopId: nullableText(shop.id) }
  };
}

function buildScanAssets(card: AppIdentityCardRow, dependencies?: AppIdentityServiceDependencies) {
  const configuredAppUrl = dependencies?.appUrl ?? runtimeConfig.appUrl;
  const appUrl = normalizeAppUrl(configuredAppUrl);
  const secret = signingSecret(dependencies);
  if (!appUrl) {
    return { token: null, scanUrl: null, qr: null, reason: "NEXT_PUBLIC_APP_URL must be a secure absolute URL." };
  }

  try {
    const expiresAt = Math.floor(new Date(card.code_expires_at).getTime() / 1000);
    const token = signAppIdentityToken({
      cardIdentifier: card.public_identifier,
      codeVersion: card.code_version,
      expiresAt
    }, secret);
    const scanUrl = `${appUrl}/id?scan=${encodeURIComponent(token)}`;
    const qr = encodeKioskQr(scanUrl);
    return {
      token,
      scanUrl,
      qr,
      reason: qr ? null : "The signed App ID URL exceeds the supported QR capacity."
    };
  } catch (error) {
    const reason = error instanceof AppIdentityTokenError && error.code === "configuration"
      ? "APP_ID_SIGNING_SECRET requires at least 32 private characters."
      : "The signed App ID code could not be created.";
    return { token: null, scanUrl: null, qr: null, reason };
  }
}

function walletProviders(token: string | null, paused: boolean, appUrl: string, dependencies?: AppIdentityServiceDependencies) {
  const appleTemplate = dependencies?.appleWalletIssuerTemplate
    ?? process.env.APP_ID_APPLE_WALLET_ISSUER_URL_TEMPLATE
    ?? "";
  const googleTemplate = dependencies?.googleWalletIssuerTemplate
    ?? process.env.APP_ID_GOOGLE_WALLET_ISSUER_URL_TEMPLATE
    ?? "";
  return [
    buildWalletProvider("apple", appleTemplate, token, paused, appUrl),
    buildWalletProvider("google", googleTemplate, token, paused, appUrl)
  ];
}

export async function loadAppIdentitySnapshot(
  user: Pick<UserAccount, "id" | "role" | "name" | "ownedShopName" | "appApprovalStatus" | "shopApprovalStatus">,
  dependencies?: AppIdentityServiceDependencies
): Promise<AppIdentitySnapshot> {
  const role = requireRole(user);
  const supabase = dependencies?.supabase ?? createSupabaseAdminClient();
  if (!supabase) {
    if (shouldRequireProductionSupabaseTruth()) {
      throw productionSupabaseTruthError("PR36 App ID");
    }
    const identity = fallbackIdentity(user);
    const actions = buildAppIdentityScanActions(role, identity.reference);
    return {
      ...identity,
      roleTag: appIdentityRoleLabel(role, identity.verified),
      scanHint: appIdentityScanHint(role),
      serverTruth: "unavailable",
      paused: false,
      expiresAt: null,
      regeneratedAt: null,
      scanUrl: null,
      qr: null,
      qrUnavailableReason: "Connect Supabase server truth before issuing this App ID.",
      walletProviders: walletProviders(null, false, normalizeAppUrl(dependencies?.appUrl ?? runtimeConfig.appUrl) ?? "https://bvrb3r.app", dependencies),
      actions
    };
  }

  const userId = requireUuid(user.id, "App ID account");
  const now = dependencies?.now ?? new Date();
  const expiry = codeExpiry(now);
  const cardResult = await supabase.rpc("pr36_ensure_app_identity_card", {
    p_user_id: userId,
    p_role: role,
    p_code_expires_at: expiry.toISOString()
  });
  if (cardResult.error) {
    throw new AppIdentityServiceError("App ID authority could not issue this card.", "card_issue_failed");
  }
  const card = parseCardRow(cardResult.data);
  const identity = await loadPublicIdentity(supabase, userId, role);
  const assets = buildScanAssets(card, dependencies);
  const paused = Boolean(card.paused_at);
  const appUrl = normalizeAppUrl(dependencies?.appUrl ?? runtimeConfig.appUrl) ?? "https://bvrb3r.app";
  return {
    ...identity,
    roleTag: appIdentityRoleLabel(role, identity.verified),
    scanHint: appIdentityScanHint(role),
    serverTruth: "connected",
    paused,
    expiresAt: card.code_expires_at,
    regeneratedAt: card.regenerated_at,
    scanUrl: assets.scanUrl,
    qr: assets.qr,
    qrUnavailableReason: assets.reason,
    walletProviders: walletProviders(assets.token, paused, appUrl, dependencies),
    actions: buildAppIdentityScanActions(role, identity.reference)
  };
}

export async function regenerateAppIdentityCard(
  user: Pick<UserAccount, "id" | "role">,
  dependencies?: AppIdentityServiceDependencies
) {
  const role = requireRole(user);
  const userId = requireUuid(user.id, "App ID account");
  const supabase = dependencies?.supabase ?? createSupabaseAdminClient();
  if (!supabase) throw new AppIdentityServiceError("App ID server truth is unavailable.", "card_truth_unavailable", 503);
  const now = dependencies?.now ?? new Date();
  const result = await supabase.rpc("pr36_regenerate_app_identity_card", {
    p_user_id: userId,
    p_role: role,
    p_code_expires_at: codeExpiry(now).toISOString()
  });
  if (result.error) {
    throw new AppIdentityServiceError("App ID code could not be regenerated.", "regeneration_failed");
  }
  return parseCardRow(result.data);
}

export async function setAppIdentityCardPaused(
  user: Pick<UserAccount, "id" | "role">,
  paused: boolean,
  dependencies?: AppIdentityServiceDependencies
) {
  const role = requireRole(user);
  const userId = requireUuid(user.id, "App ID account");
  const supabase = dependencies?.supabase ?? createSupabaseAdminClient();
  if (!supabase) throw new AppIdentityServiceError("App ID server truth is unavailable.", "card_truth_unavailable", 503);
  const result = await supabase.rpc("pr36_set_app_identity_card_paused", {
    p_user_id: userId,
    p_role: role,
    p_paused: paused
  });
  if (result.error) {
    throw new AppIdentityServiceError("App ID privacy state could not be saved.", "privacy_update_failed");
  }
  return parseCardRow(result.data);
}

function invalidResolution(status: AppIdentityScanResolution["status"], message: string): AppIdentityScanResolution {
  return { status, message, identity: null };
}

export async function resolveAppIdentityScan(
  token: string,
  dependencies?: AppIdentityServiceDependencies
): Promise<AppIdentityScanResolution> {
  const secret = signingSecret(dependencies);
  const now = dependencies?.now ?? new Date();
  let payload;
  try {
    payload = verifyAppIdentityToken(token, secret, now);
  } catch (error) {
    if (error instanceof AppIdentityTokenError) {
      if (error.code === "configuration") return invalidResolution("unavailable", "App ID signing is not configured.");
      if (error.code === "expired") return invalidResolution("expired", "This App ID code expired. Ask the card owner to regenerate it.");
    }
    return invalidResolution("invalid", "This App ID code is invalid or has been replaced.");
  }

  const supabase = dependencies?.supabase ?? createSupabaseAdminClient();
  if (!supabase) {
    return invalidResolution("unavailable", "App ID resolver truth is temporarily unavailable.");
  }
  const cardResult = await supabase
    .from("app_identity_cards")
    .select("user_id, role, public_identifier, code_version, code_expires_at, paused_at, regenerated_at")
    .eq("public_identifier", payload.cardIdentifier)
    .maybeSingle();
  if (cardResult.error || !cardResult.data) {
    return invalidResolution("invalid", "This App ID code is invalid or has been replaced.");
  }
  const card = parseCardRow(cardResult.data);
  const authorityExpiry = Math.floor(new Date(card.code_expires_at).getTime() / 1000);
  if (card.code_version !== payload.codeVersion || payload.expiresAt > authorityExpiry) {
    return invalidResolution("invalid", "This App ID code is invalid or has been replaced.");
  }
  if (authorityExpiry <= Math.floor(now.getTime() / 1000)) {
    return invalidResolution("expired", "This App ID code expired. Ask the card owner to regenerate it.");
  }
  if (card.paused_at) {
    return invalidResolution("paused", "This App ID is paused by its owner. Its QR and wallet state are dark.");
  }

  const identity = await loadPublicIdentity(supabase, card.user_id, card.role as AppIdentityRole);
  return {
    status: "valid",
    message: "Signed App ID verified against current server authority.",
    identity: {
      ...identity,
      roleTag: appIdentityRoleLabel(identity.role, identity.verified),
      scanHint: appIdentityScanHint(identity.role),
      actions: buildAppIdentityScanActions(identity.role, identity.reference)
    }
  };
}
