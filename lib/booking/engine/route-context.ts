import { NextResponse } from "next/server";
import { getVerifiedActor } from "@/lib/auth/permissions";
import { clientKeyFromRequest, consumeRateLimit } from "@/lib/kiosk/rate-limit";
import { BookingEngineError, toBookingEngineError } from "@/lib/booking/engine/errors";
import type { BookingEngineActor } from "@/lib/booking/engine";
import { assertPr34BillingRiskAction, Pr34BillingServiceError } from "@/lib/billing/pr34-service";
import { normalizeAccountRole } from "@/lib/auth/roles";
import { isSupabaseEnabled } from "@/lib/config/runtime";
import {
  BOOKING_SESSION_COOKIE,
  BOOKING_SESSION_COOKIE_OPTIONS,
  resolveBookingSessionKey
} from "@/lib/booking/engine/session";

/**
 * Shared plumbing for the booking routes.
 *
 * Three things every booking route needs, in the same shape every time, so no
 * route can quietly skip one:
 *
 *   1. A resolved actor — a verified profile, or an opaque booking session.
 *   2. A rate limit, applied before any work, because these endpoints are
 *      reachable by unauthenticated callers by design.
 *   3. Error serialization that never leaks an internal message and never
 *      reports an unknown state as success.
 */

export type BookingRouteContext = {
  actor: BookingEngineActor;
  /** Set when a new booking session was minted and must be returned. */
  issuedSessionKey: string | null;
};

/**
 * Resolves the actor.
 *
 * The verified session wins whenever one exists: a signed-in client's holds
 * belong to their account, not to whatever cookie their browser is carrying.
 * `getVerifiedActor` revalidates the JWT against the auth server rather than
 * decoding a cookie, so a stale or forged cookie cannot produce an actor.
 */
export async function resolveBookingRouteContext(request: Request): Promise<BookingRouteContext> {
  const verified = await resolveVerifiedActorOrGuest(request);

  if (verified) {
    return {
      actor: {
        profileId: verified.user.id,
        sessionKey: null,
        role: verified.user.role ?? null,
        email: verified.user.email ?? null,
        permissionActor: {
          id: verified.user.id,
          role: verified.user.role,
          platformAdmin: verified.user.platformAdmin,
          accountStatus: verified.user.accountStatus
        }
      },
      issuedSessionKey: null
    };
  }

  const existing = readCookie(request, BOOKING_SESSION_COOKIE);
  const { sessionKey, issued } = resolveBookingSessionKey(existing);

  return {
    actor: { profileId: null, sessionKey, role: null, permissionActor: null },
    issuedSessionKey: issued ? sessionKey : null
  };
}

/**
 * Cookie and header names that mean "this caller is claiming to be signed in".
 * Supabase SSR writes `sb-<project-ref>-auth-token`, chunked as `.0`, `.1` when
 * the payload is large; the two legacy names and the demo cookie are the other
 * ways a session arrives in this codebase.
 */
const SUPABASE_AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;
const LEGACY_SUPABASE_COOKIES = new Set(["sb-access-token", "sb-refresh-token"]);
const DEMO_SESSION_COOKIE = "bvrb3r-demo-email";

export function carriesAuthenticationMaterial(request: Request) {
  if (request.headers.get("authorization")) {
    return true;
  }

  const header = request.headers.get("cookie");
  if (!header) {
    return false;
  }

  return header.split(";").some((part) => {
    const name = part.trim().split("=")[0];
    return Boolean(name)
      && (SUPABASE_AUTH_COOKIE.test(name) || LEGACY_SUPABASE_COOKIES.has(name) || name === DEMO_SESSION_COOKIE);
  });
}

/**
 * Resolves the verified actor, distinguishing two failures that look identical
 * from inside `getVerifiedActor` but mean opposite things to the caller.
 *
 * A request carrying **no** authentication material is unambiguously a guest.
 * Reporting that as "booking is temporarily unavailable" would send someone
 * retrying forever against an answer that is never going to change; the honest
 * answer is that changing a booking needs an account.
 *
 * A request that **does** carry a session and fails to verify is ambiguous — we
 * cannot tell whether this is a signed-in client whose session store is
 * unreachable, or a forged cookie. Downgrading that to "guest" would tell a
 * signed-in person to sign in, and would quietly mask a broken auth path. It
 * stays a retryable failure. Neither branch can ever grant authority: one
 * yields no profile, the other yields no answer at all.
 */
async function resolveVerifiedActorOrGuest(request: Request) {
  try {
    return await getVerifiedActor();
  } catch (error) {
    if (carriesAuthenticationMaterial(request)) {
      console.warn("[booking-engine] session_verification_failed", {
        message: error instanceof Error ? error.message : "unknown"
      });
      throw new BookingEngineError("retry", "engine_unavailable");
    }

    return null;
  }
}

/** Routes that change an existing booking require a real account. */
export function requireAccountActor(context: BookingRouteContext) {
  if (!context.actor.profileId) {
    throw new BookingEngineError("forbidden", "actor_not_permitted", "Sign in to change this booking.");
  }

  return context.actor;
}

/**
 * Account balance is a server-owned booking gate. Guests have no account
 * balance to inspect, while authenticated callers are blocked before a hold or
 * appointment can be created whenever the balance is owed or unverifiable.
 */
export async function assertBookingBillingAccess(context: BookingRouteContext) {
  if (!isSupabaseEnabled() || !context.actor.profileId || !context.actor.role) return;

  try {
    await assertPr34BillingRiskAction({
      user: {
        id: context.actor.profileId,
        role: normalizeAccountRole(context.actor.role)
      },
      action: "booking"
    });
  } catch (error) {
    if (error instanceof Pr34BillingServiceError && error.code === "account_balance_locked") {
      throw new BookingEngineError(
        "forbidden",
        "account_balance_locked",
        error.message,
        { recoveryHref: "/billing" }
      );
    }
    throw new BookingEngineError("retry", "engine_unavailable");
  }
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

/**
 * Applies the rate limit for a booking bucket.
 *
 * Reuses the kiosk limiter rather than adding a second one, so there is one
 * definition of "too many requests" in the codebase. Returns a 429 response to
 * send, or null to continue.
 */
export function enforceBookingRateLimit(request: Request, bucket: string, limit: number) {
  const rate = consumeRateLimit({
    bucket,
    key: clientKeyFromRequest(request),
    limit,
    windowMs: 60_000
  });

  if (rate.allowed) {
    return null;
  }

  return NextResponse.json(
    { error: "Too many booking requests. Try again shortly.", kind: "retry", reason: "rate_limited", retryable: true },
    { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
  );
}

/** Attaches a freshly minted booking session cookie, if one was issued. */
export function withBookingSession(response: NextResponse, context: BookingRouteContext) {
  if (context.issuedSessionKey) {
    response.cookies.set(BOOKING_SESSION_COOKIE, context.issuedSessionKey, BOOKING_SESSION_COOKIE_OPTIONS);
  }

  return response;
}

/**
 * Serializes any thrown value into an honest response.
 *
 * Anything that is not already a `BookingEngineError` becomes a retryable
 * failure with a generic message — an unexpected throw is never described to the
 * caller in its own words, and it is never reported as a booking that happened.
 */
export function bookingErrorResponse(error: unknown) {
  const normalized = toBookingEngineError(error);
  return NextResponse.json(normalized.toResponseBody(), { status: normalized.status });
}
