import { hasFullArchitectAccess } from "@/lib/auth/internal-operator";
import { isBarberAccountRole, isClientRole, isShopOwnerRole } from "@/lib/auth/roles";
import { getCurrentUserFromServer } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { UserAccount } from "@/types/domain";

/**
 * Server-side permission predicates.
 *
 * These answer authorization questions from canonical database relationships —
 * `shops.owner_profile_id`, `shop_operator_access`, `barber_shop_memberships`,
 * `barbers.profile_id`, `internal_operator_access` — rather than from anything
 * the client can influence. Three rules hold throughout:
 *
 *   1. **Never trust user metadata.** `user_metadata` / `raw_user_meta_data` is
 *      writable by the account holder through `auth.updateUser`, so it can
 *      state intent but never authority.
 *   2. **Fail closed.** A missing Supabase client, a query error, or an
 *      ambiguous row all resolve to "no", never to "yes". A permission check
 *      that throws on infrastructure trouble becomes a permission check people
 *      route around.
 *   3. **Role is not entitlement and not business context.** Role says which
 *      lane an account is in; a shop relationship says which business it acts
 *      inside. Asking "is this user a shop owner" is not the same question as
 *      "does this user own *this* shop", and only the second one authorizes an
 *      action against a shop.
 *
 * The predicates are read-only. They are the shared vocabulary PR 20 booking,
 * PR 21 queue and PR 22 money will call; none of those domains are implemented
 * here.
 */

const GUEST_SENTINEL_ID = "guest-user";

export type PermissionActor = Pick<UserAccount, "id" | "role" | "platformAdmin" | "accountStatus">;

/** A verified actor plus the session facts a caller needs to branch on. */
export type VerifiedActor = {
  user: UserAccount;
  authenticated: boolean;
  mode: "demo" | "supabase";
};

export function isGuestActor(actor: Pick<PermissionActor, "id"> | null | undefined) {
  return !actor?.id || actor.id === GUEST_SENTINEL_ID;
}

/**
 * Resolves the current actor from the server session.
 *
 * `getCurrentUserFromServer` already calls `supabase.auth.getUser()`, which
 * revalidates the JWT against the auth server, rather than `getSession()`,
 * which only decodes whatever cookie arrived. That distinction is the whole
 * reason this helper exists: a stale or forged cookie must not produce a
 * verified actor.
 */
export async function getVerifiedActor(): Promise<VerifiedActor | null> {
  const session = await getCurrentUserFromServer();
  if (!session.authenticated || isGuestActor(session.user)) {
    return null;
  }

  return {
    user: session.user,
    authenticated: true,
    mode: session.mode
  };
}

export class AuthorizationError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 403, code = "forbidden") {
    super(message);
    this.name = "AuthorizationError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Returns a verified actor or throws. Use at the top of a server action or
 * route handler that must never run for an anonymous caller.
 */
export async function requireVerifiedActor(): Promise<VerifiedActor> {
  const actor = await getVerifiedActor();
  if (!actor) {
    throw new AuthorizationError("Authentication required.", 401, "unauthenticated");
  }

  if (actor.user.accountStatus && actor.user.accountStatus !== "active" && actor.user.accountStatus !== "profile_only") {
    throw new AuthorizationError("This account is not active.", 403, "account_inactive");
  }

  return actor;
}

// ---------------------------------------------------------------------------
// Self
// ---------------------------------------------------------------------------

/** The narrowest predicate: the actor is the subject of the record. */
export function canActOnSelf(actor: PermissionActor | null | undefined, subjectProfileId: string | null | undefined) {
  if (isGuestActor(actor) || !subjectProfileId) {
    return false;
  }

  return actor!.id === subjectProfileId;
}

// ---------------------------------------------------------------------------
// Internal (Architect) access
// ---------------------------------------------------------------------------

/**
 * Protected internal access. Read from `internal_operator_access` — never from
 * a role a user can select and never from metadata. `platformAdmin` on the
 * runtime user is already derived from that table by the session overlay, so
 * the fast path reuses it; the slow path re-reads the table for callers that
 * hold only an id.
 */
export function hasInternalAccess(actor: PermissionActor | null | undefined) {
  if (isGuestActor(actor)) {
    return false;
  }

  return Boolean(actor!.platformAdmin);
}

export async function hasInternalAccessByProfileId(profileId: string | null | undefined) {
  if (!profileId || profileId === GUEST_SENTINEL_ID) {
    return false;
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return false;
  }

  const result = await supabase
    .from("internal_operator_access")
    .select("access_level, status")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (result.error || !result.data) {
    return false;
  }

  return hasFullArchitectAccess(result.data as { access_level: string | null; status: string | null });
}

// ---------------------------------------------------------------------------
// Shop ownership and membership
// ---------------------------------------------------------------------------

/**
 * True when the actor is the recorded owner of *this* shop.
 *
 * Holding the `shop_owner_user` lane is not sufficient and is deliberately not
 * consulted: the lane says what kind of account this is, the row says which
 * business it owns.
 */
export async function isShopOwnerOf(actor: PermissionActor | null | undefined, shopId: string | null | undefined) {
  if (isGuestActor(actor) || !shopId) {
    return false;
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return false;
  }

  const result = await supabase
    .from("shops")
    .select("id, owner_profile_id")
    .eq("id", shopId)
    .maybeSingle();

  if (result.error || !result.data) {
    return false;
  }

  const ownerProfileId = (result.data as { owner_profile_id: string | null }).owner_profile_id;
  return Boolean(ownerProfileId) && ownerProfileId === actor!.id;
}

/**
 * True when the actor owns the shop or holds active operator access to it.
 * Membership is the broader question — staff who are not owners still act
 * inside the business.
 */
export async function isShopMemberOf(actor: PermissionActor | null | undefined, shopId: string | null | undefined) {
  if (isGuestActor(actor) || !shopId) {
    return false;
  }

  if (await isShopOwnerOf(actor, shopId)) {
    return true;
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return false;
  }

  const result = await supabase
    .from("shop_operator_access")
    .select("profile_id, shop_id, status")
    .eq("profile_id", actor!.id)
    .eq("shop_id", shopId)
    .eq("status", "active")
    .maybeSingle();

  if (result.error || !result.data) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Barber context
// ---------------------------------------------------------------------------

/**
 * Resolves the barber reference this actor acts as, or null. A barber-lane role
 * without a `barbers` row is an incomplete account, not a barber.
 */
export async function resolveBarberContext(actor: PermissionActor | null | undefined) {
  if (isGuestActor(actor)) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return null;
  }

  const result = await supabase
    .from("barbers")
    .select("id, reference_code, profile_id")
    .eq("profile_id", actor!.id)
    .maybeSingle();

  if (result.error || !result.data) {
    return null;
  }

  const row = result.data as { id: string; reference_code?: string | null };
  return { barberId: row.id, barberReference: row.reference_code ?? row.id };
}

export async function hasBarberContext(actor: PermissionActor | null | undefined) {
  return Boolean(await resolveBarberContext(actor));
}

/**
 * True when the actor is a barber with an active membership at this shop, or
 * the shop's owner. Used by surfaces that belong to a chair inside a shop.
 */
export async function isBarberAtShop(actor: PermissionActor | null | undefined, shopId: string | null | undefined) {
  if (isGuestActor(actor) || !shopId) {
    return false;
  }

  const context = await resolveBarberContext(actor);
  if (!context) {
    return false;
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return false;
  }

  const result = await supabase
    .from("barber_shop_memberships")
    .select("barber_reference, shop_reference, active")
    .eq("barber_reference", context.barberReference)
    .eq("shop_reference", shopId)
    .eq("active", true)
    .maybeSingle();

  if (result.error || !result.data) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Lane predicates
// ---------------------------------------------------------------------------

/**
 * Lane checks. These describe what kind of account this is; they never stand in
 * for a relationship check. Routing may use them; an action against someone
 * else's data may not.
 */
export const lane = {
  isClient: (actor: PermissionActor | null | undefined) => !isGuestActor(actor) && isClientRole(actor!.role),
  isBarber: (actor: PermissionActor | null | undefined) => !isGuestActor(actor) && isBarberAccountRole(actor!.role),
  isShopOwner: (actor: PermissionActor | null | undefined) => !isGuestActor(actor) && isShopOwnerRole(actor!.role)
};

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

export async function assertInternalAccess(actor: PermissionActor | null | undefined) {
  if (!hasInternalAccess(actor)) {
    throw new AuthorizationError("Internal access required.", 403, "internal_access_required");
  }
}

export async function assertShopOwner(actor: PermissionActor | null | undefined, shopId: string | null | undefined) {
  if (hasInternalAccess(actor)) {
    return;
  }

  if (!(await isShopOwnerOf(actor, shopId))) {
    throw new AuthorizationError("You do not own this shop.", 403, "shop_ownership_required");
  }
}

export async function assertShopMember(actor: PermissionActor | null | undefined, shopId: string | null | undefined) {
  if (hasInternalAccess(actor)) {
    return;
  }

  if (!(await isShopMemberOf(actor, shopId))) {
    throw new AuthorizationError("You do not have access to this shop.", 403, "shop_membership_required");
  }
}

export async function assertSelf(actor: PermissionActor | null | undefined, subjectProfileId: string | null | undefined) {
  if (canActOnSelf(actor, subjectProfileId)) {
    return;
  }

  if (hasInternalAccess(actor)) {
    return;
  }

  throw new AuthorizationError("You can only act on your own account.", 403, "self_scope_required");
}
