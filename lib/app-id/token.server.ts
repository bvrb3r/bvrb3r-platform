import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,256}\.[A-Za-z0-9_-]{43}$/;

export type AppIdentityTokenPayload = {
  cardIdentifier: string;
  codeVersion: number;
  expiresAt: number;
};

export class AppIdentityTokenError extends Error {
  constructor(message: string, readonly code: "invalid" | "expired" | "configuration") {
    super(message);
    this.name = "AppIdentityTokenError";
  }
}

function requireSigningSecret(secret: string) {
  const normalized = secret.trim();
  if (normalized.length < 32) {
    throw new AppIdentityTokenError("App ID signing is not configured.", "configuration");
  }
  return normalized;
}

function signatureFor(encodedPayload: string, secret: string) {
  return createHmac("sha256", requireSigningSecret(secret))
    .update(encodedPayload)
    .digest("base64url");
}

export function signAppIdentityToken(payload: AppIdentityTokenPayload, secret: string) {
  if (!UUID_PATTERN.test(payload.cardIdentifier)
      || !Number.isSafeInteger(payload.codeVersion)
      || payload.codeVersion < 1
      || !Number.isSafeInteger(payload.expiresAt)
      || payload.expiresAt < 1) {
    throw new AppIdentityTokenError("App ID token payload is invalid.", "invalid");
  }

  const encodedPayload = Buffer.from(JSON.stringify({
    v: TOKEN_VERSION,
    c: payload.cardIdentifier,
    g: payload.codeVersion,
    e: payload.expiresAt
  }), "utf8").toString("base64url");
  return `${encodedPayload}.${signatureFor(encodedPayload, secret)}`;
}

export function verifyAppIdentityToken(token: string, secret: string, now = new Date()) {
  if (token.length > 320 || !TOKEN_PATTERN.test(token)) {
    throw new AppIdentityTokenError("App ID code is invalid.", "invalid");
  }
  const [encodedPayload, suppliedSignature] = token.split(".");
  const expectedSignature = signatureFor(encodedPayload, secret);
  const suppliedBytes = Buffer.from(suppliedSignature, "base64url");
  const expectedBytes = Buffer.from(expectedSignature, "base64url");
  if (suppliedBytes.length !== expectedBytes.length
      || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    throw new AppIdentityTokenError("App ID signature is invalid.", "invalid");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new AppIdentityTokenError("App ID payload is invalid.", "invalid");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new AppIdentityTokenError("App ID payload is invalid.", "invalid");
  }
  const record = parsed as Record<string, unknown>;
  if (record.v !== TOKEN_VERSION
      || typeof record.c !== "string"
      || !UUID_PATTERN.test(record.c)
      || !Number.isSafeInteger(record.g)
      || Number(record.g) < 1
      || !Number.isSafeInteger(record.e)
      || Number(record.e) < 1) {
    throw new AppIdentityTokenError("App ID payload is invalid.", "invalid");
  }
  const expiresAt = Number(record.e);
  if (expiresAt <= Math.floor(now.getTime() / 1000)) {
    throw new AppIdentityTokenError("App ID code has expired.", "expired");
  }

  return {
    cardIdentifier: record.c,
    codeVersion: Number(record.g),
    expiresAt
  } satisfies AppIdentityTokenPayload;
}
