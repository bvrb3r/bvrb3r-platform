import { normalizePublicBarberHandle } from "@/lib/marketplace/client-facing";

/**
 * Strict public-identity rules for the kiosk.
 *
 * The shared `getClientFacingBarberName` helper is deliberately forgiving — if
 * a barber has no handle it falls back through display name, business name and
 * finally the real name, which is right for a signed-in app surface. A kiosk is
 * a screen bolted to a wall in a public room, and PR 18's privacy rule is
 * absolute: a barber's real name appears once, on the confirmation reveal card,
 * after the client has already booked.
 *
 * So this module never falls back to a name. It returns a handle or nothing,
 * and the caller substitutes a non-identifying label.
 */

/** Internal references that are identifiers, not names a client should read. */
function isInternalReference(value: string) {
  return /^(barber|client|independent-barber|srv|shop|loc|kiosk)[-_]/i.test(value)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Resolves the one public handle a kiosk may display, or null. Candidates are
 * tried in order; anything that looks like an internal reference is rejected
 * rather than shown to a walk-up client.
 */
export function resolveKioskPublicHandle(...candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    const handle = normalizePublicBarberHandle(candidate);
    if (handle && !isInternalReference(handle)) {
      return handle;
    }
  }
  return null;
}
