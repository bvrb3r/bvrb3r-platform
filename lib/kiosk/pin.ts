import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const KIOSK_PIN_ITERATIONS = 120_000;
const KIOSK_PIN_KEY_LENGTH = 32;
const KIOSK_PIN_DIGEST = "sha256";
const KIOSK_PIN_PREFIX = "pbkdf2_sha256";

export function isFourDigitKioskPin(pin: string) {
  return /^\d{4}$/.test(pin);
}

export function hashKioskPin(pin: string, salt = randomBytes(16).toString("hex")) {
  if (!isFourDigitKioskPin(pin)) {
    throw new Error("Kiosk PIN must be exactly 4 digits.");
  }

  const hash = pbkdf2Sync(pin, salt, KIOSK_PIN_ITERATIONS, KIOSK_PIN_KEY_LENGTH, KIOSK_PIN_DIGEST).toString("hex");
  return `${KIOSK_PIN_PREFIX}$${KIOSK_PIN_ITERATIONS}$${salt}$${hash}`;
}

export function verifyKioskPinHash(pin: string, storedHash: string) {
  if (!isFourDigitKioskPin(pin)) {
    return false;
  }

  const [prefix, iterationsRaw, salt, expectedHash] = storedHash.split("$");
  const iterations = Number(iterationsRaw);
  if (prefix !== KIOSK_PIN_PREFIX || !Number.isInteger(iterations) || iterations < 1 || !salt || !expectedHash) {
    return false;
  }

  const actual = pbkdf2Sync(pin, salt, iterations, KIOSK_PIN_KEY_LENGTH, KIOSK_PIN_DIGEST);
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
