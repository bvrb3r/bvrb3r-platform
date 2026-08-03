import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { CalendarSyncError } from "@/lib/calendar-sync/domain";

function readEncryptionKey() {
  const configured = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw new CalendarSyncError(
      "Calendar credential encryption is not configured.",
      503,
      "calendar_encryption_unavailable"
    );
  }

  const key = /^[0-9a-f]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");
  if (key.length !== 32) {
    throw new CalendarSyncError(
      "Calendar credential encryption key must decode to 32 bytes.",
      503,
      "calendar_encryption_key_invalid"
    );
  }
  return key;
}

export function encryptCalendarSecret(plaintext: string) {
  if (!plaintext) {
    throw new CalendarSyncError("A provider credential was empty.", 502, "calendar_provider_credential_empty");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", readEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptCalendarSecret(value: string) {
  const [version, ivValue, tagValue, ciphertextValue, ...rest] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue || rest.length) {
    throw new CalendarSyncError("Stored calendar credential is invalid.", 500, "calendar_credential_invalid");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", readEncryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new CalendarSyncError("Stored calendar credential could not be decrypted.", 500, "calendar_credential_invalid");
  }
}
