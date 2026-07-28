/**
 * Booking source attribution.
 *
 * Where a booking came from is a permanent fact about it, so it is recorded once
 * at confirmation and never edited (`public.booking_attributions` has no UPDATE
 * grant and a trigger that refuses one). This module decides what is allowed to
 * become that fact.
 *
 * Two rules shape everything here:
 *
 *   1. The door is a closed set, not free text. An unrecognized door is refused
 *      rather than stored, because attribution nobody can enumerate cannot be
 *      reconciled later.
 *   2. Campaign and referral metadata is attacker-influenced — it arrives on a
 *      query string. It is length-bounded, character-restricted, and stripped of
 *      anything credential-shaped before it goes anywhere near a durable row or
 *      a log line.
 *
 * `external_readonly` exists for a future read-only calendar source. It is an
 * attribution label only: BVRB3R never treats an external scheduler's money as
 * its own, and nothing in this module records an amount.
 */

export const BOOKING_SOURCE_DOORS = [
  "bvrb3r_app",
  "bvrb3r_web",
  "shop_profile",
  "barber_profile",
  "kiosk_shop",
  "kiosk_barber",
  "external_readonly"
] as const;

export type BookingSourceDoor = (typeof BOOKING_SOURCE_DOORS)[number];

const DOOR_SET = new Set<string>(BOOKING_SOURCE_DOORS);

/** Doors that can only be reached from a physical device the shop controls. */
const KIOSK_DOORS = new Set<BookingSourceDoor>(["kiosk_shop", "kiosk_barber"]);

/** Doors a public web request may legitimately claim. */
const PUBLIC_DOORS = new Set<BookingSourceDoor>([
  "bvrb3r_app",
  "bvrb3r_web",
  "shop_profile",
  "barber_profile"
]);

export const MAX_ATTRIBUTION_FIELD_LENGTH = 120;

/**
 * Conservative allowlist for bounded metadata: campaign ids and referral codes
 * are identifiers, not prose. Anything outside this shape is dropped rather than
 * escaped, because the value has no legitimate use if it needed escaping.
 */
const SAFE_METADATA_PATTERN = /^[A-Za-z0-9._:-]+$/;

/**
 * Values that look like a credential even under an innocent field name. Mirrors
 * the PR 19 identity-audit backstop: a token pasted into `?campaign=` must not
 * survive into a durable row.
 */
const CREDENTIAL_SHAPED =
  /(\beyJ[A-Za-z0-9_-]{8,}\.)|(\bbearer\b)|(\bsb[a-z_]*_[A-Za-z0-9_-]{16,})|(access_token)|(refresh_token)/i;

export function isBookingSourceDoor(value: unknown): value is BookingSourceDoor {
  return typeof value === "string" && DOOR_SET.has(value);
}

export function isKioskSourceDoor(door: BookingSourceDoor) {
  return KIOSK_DOORS.has(door);
}

/**
 * Resolves the door for a request.
 *
 * `allowedDoors` is supplied by the caller that already knows the channel — a
 * kiosk route passes only its kiosk door, a public route passes only public
 * doors. This is what stops a web request from claiming it came from a kiosk to
 * inherit kiosk trust, and it is why the check lives here rather than in a
 * shared schema.
 */
export function resolveSourceDoor(
  requested: unknown,
  allowedDoors: readonly BookingSourceDoor[],
  fallback: BookingSourceDoor
): BookingSourceDoor {
  if (!allowedDoors.length) {
    return fallback;
  }

  if (isBookingSourceDoor(requested) && allowedDoors.includes(requested)) {
    return requested;
  }

  return allowedDoors.includes(fallback) ? fallback : allowedDoors[0];
}

export function publicBookingDoors(): BookingSourceDoor[] {
  return [...PUBLIC_DOORS];
}

/** Trims, bounds, and refuses anything that is not a plain identifier. */
export function normalizeAttributionField(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ATTRIBUTION_FIELD_LENGTH) {
    return null;
  }

  if (CREDENTIAL_SHAPED.test(trimmed) || !SAFE_METADATA_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export type BookingAttributionInput = {
  sourceDoor?: unknown;
  sourceSurface?: unknown;
  campaignId?: unknown;
  referralCode?: unknown;
  correlationId?: unknown;
};

export type NormalizedBookingAttribution = {
  sourceDoor: BookingSourceDoor;
  sourceSurface: string | null;
  campaignId: string | null;
  referralCode: string | null;
  correlationId: string | null;
};

export function normalizeBookingAttribution(
  input: BookingAttributionInput,
  allowedDoors: readonly BookingSourceDoor[],
  fallback: BookingSourceDoor
): NormalizedBookingAttribution {
  return {
    sourceDoor: resolveSourceDoor(input.sourceDoor, allowedDoors, fallback),
    sourceSurface: normalizeAttributionField(input.sourceSurface),
    campaignId: normalizeAttributionField(input.campaignId),
    referralCode: normalizeAttributionField(input.referralCode),
    correlationId: normalizeAttributionField(input.correlationId)
  };
}
