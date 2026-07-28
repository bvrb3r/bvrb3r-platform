import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveBookingClient } from "@/lib/operations/live-provider";
import { BookingEngineError } from "@/lib/booking/engine/errors";
import type { BookingEngineActor } from "@/lib/booking/engine";

/**
 * Which client record a confirmation belongs to.
 *
 * This deliberately delegates to `resolveBookingClient`, the resolver the
 * existing booking path already uses. Client identity has a lot of accumulated
 * truth in it — profile matching, reference codes, phone normalization, the
 * repair paths for half-created accounts — and a second resolver would sooner or
 * later disagree with the first about who somebody is. One booking, one answer.
 *
 * A guest confirming from the public web supplies contact details and gets the
 * same treatment the kiosk walk-in already gets: a server action resolves or
 * creates the client record. Turning that guest record into a real account is
 * PR 23 and is not attempted here.
 */

export type GuestBookingContact = {
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
};

const MIN_NAME_LENGTH = 2;
const MIN_PHONE_LENGTH = 7;

export async function resolveConfirmingClientId(
  actor: BookingEngineActor,
  contact: GuestBookingContact
): Promise<string> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    throw new BookingEngineError("retry", "engine_unavailable");
  }

  const name = contact.fullName?.trim() ?? "";
  const phone = contact.phone?.trim() ?? "";
  const email = (contact.email ?? actor.email ?? "").trim().toLowerCase();

  // A guest has no account to look the record up from, so the contact details
  // are the only handle that exists. A signed-in caller needs none of this: the
  // profile is the handle.
  if (!actor.profileId && (name.length < MIN_NAME_LENGTH || phone.length < MIN_PHONE_LENGTH || !email)) {
    throw new BookingEngineError(
      "validation",
      "missing_required_input",
      "Guest bookings need a name, phone and email so the shop can reach you."
    );
  }

  const resolved = await resolveBookingClient(supabase, {
    clientId: null,
    actorProfileId: actor.profileId ?? null,
    actorEmail: email || null,
    clientName: name,
    clientPhone: phone
  });

  if (!resolved?.clientId) {
    throw new BookingEngineError("not_found", "client_not_found");
  }

  return resolved.clientId;
}
