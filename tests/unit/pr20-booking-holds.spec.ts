import { describe, expect, it } from "vitest";
import {
  hashHoldToken,
  holdSecondsRemaining,
  isHoldLive,
  isHoldTokenShaped,
  issueHoldToken
} from "@/lib/booking/engine/holds";
import {
  computeRequestFingerprint,
  fingerprintsMatch,
  generateIdempotencyKey,
  isValidIdempotencyKey,
  resolveIdempotencyActorKey,
  stableStringify
} from "@/lib/booking/engine/idempotency";
import {
  BOOKING_SESSION_COOKIE_OPTIONS,
  isBookingSessionKey,
  issueBookingSessionKey,
  resolveBookingSessionKey
} from "@/lib/booking/engine/session";
import { BookingEngineError, unwrapEngineOutcome } from "@/lib/booking/engine/errors";

describe("hold tokens are treated as credentials", () => {
  it("issues an unpredictable token and returns only its digest for storage", () => {
    const first = issueHoldToken();
    const second = issueHoldToken();

    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(hashHoldToken(first.token));
    // The digest must not contain the token, or storing it would store the token.
    expect(first.tokenHash).not.toContain(first.token);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces enough entropy that a token cannot be guessed", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => issueHoldToken().token));
    expect(tokens.size).toBe(500);
    expect([...tokens][0]).toHaveLength(43);
  });

  it("rejects anything not shaped like an issued token before it reaches a query", () => {
    expect(isHoldTokenShaped(issueHoldToken().token)).toBe(true);
    for (const candidate of ["", "short", "a".repeat(44), "a".repeat(42), "not/base64url+", null, 42, {}]) {
      expect(isHoldTokenShaped(candidate), `${String(candidate)} was accepted`).toBe(false);
    }
  });

  it("hashes deterministically so the same token always finds the same row", () => {
    const { token } = issueHoldToken();
    expect(hashHoldToken(token)).toBe(hashHoldToken(token));
  });
});

describe("hold liveness", () => {
  const now = new Date("2026-07-01T12:00:00.000Z");

  it("counts an active, unexpired hold as live", () => {
    expect(isHoldLive({ status: "active", expiresAt: "2026-07-01T12:05:00.000Z" }, now)).toBe(true);
  });

  it("counts an active hold past its TTL as not live, because expiry is lazy", () => {
    // The database flips the row to 'expired' on the next write under the lock.
    // Until then the status still reads 'active', and trusting status alone
    // would keep a free slot hidden.
    expect(isHoldLive({ status: "active", expiresAt: "2026-07-01T11:59:59.000Z" }, now)).toBe(false);
  });

  it("counts released and consumed holds as not live", () => {
    expect(isHoldLive({ status: "released", expiresAt: "2026-07-01T12:05:00.000Z" }, now)).toBe(false);
    expect(isHoldLive({ status: "consumed", expiresAt: "2026-07-01T12:05:00.000Z" }, now)).toBe(false);
  });

  it("reports remaining seconds without going negative", () => {
    expect(holdSecondsRemaining({ expiresAt: "2026-07-01T12:05:00.000Z" }, now)).toBe(300);
    expect(holdSecondsRemaining({ expiresAt: "2026-07-01T11:00:00.000Z" }, now)).toBe(0);
    expect(holdSecondsRemaining({ expiresAt: "not-a-date" }, now)).toBe(0);
  });
});

describe("idempotency fingerprints", () => {
  it("treats key order as irrelevant, so a retry is recognized as the same request", () => {
    const left = computeRequestFingerprint({ barberId: "b1", serviceId: "s1", startsAt: "t" });
    const right = computeRequestFingerprint({ startsAt: "t", serviceId: "s1", barberId: "b1" });

    expect(left).toBe(right);
  });

  it("treats an omitted field and an explicit null as the same request", () => {
    const omitted = computeRequestFingerprint({ barberId: "b1" });
    const explicit = computeRequestFingerprint({ barberId: "b1", locationId: null });
    const undefinedValue = computeRequestFingerprint({ barberId: "b1", locationId: undefined });

    expect(explicit).toBe(omitted);
    expect(undefinedValue).toBe(omitted);
  });

  it("treats a changed value as a different request", () => {
    const original = computeRequestFingerprint({ barberId: "b1", startsAt: "2026-07-01T12:00:00.000Z" });
    const moved = computeRequestFingerprint({ barberId: "b1", startsAt: "2026-07-01T13:00:00.000Z" });

    expect(moved).not.toBe(original);
  });

  it("does not let a string masquerade as the number it looks like", () => {
    expect(computeRequestFingerprint({ revision: 1 })).not.toBe(computeRequestFingerprint({ revision: "1" }));
  });

  it("keeps nested structures stable", () => {
    expect(stableStringify({ a: [1, { c: true, b: null }] })).toBe(stableStringify({ a: [1, { b: null, c: true }] }));
  });

  it("collapses values that have no place in a request payload instead of throwing", () => {
    expect(() => computeRequestFingerprint({ fn: () => undefined, when: Number.NaN })).not.toThrow();
  });

  it("compares fingerprints in constant time", () => {
    const value = computeRequestFingerprint({ a: 1 });
    expect(fingerprintsMatch(value, value)).toBe(true);
    expect(fingerprintsMatch(value, computeRequestFingerprint({ a: 2 }))).toBe(false);
    expect(fingerprintsMatch(value, "short")).toBe(false);
  });
});

describe("idempotency keys", () => {
  it("accepts a generated key", () => {
    expect(isValidIdempotencyKey(generateIdempotencyKey())).toBe(true);
  });

  it("rejects keys that are too short, too long, or carry unsafe characters", () => {
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey("a".repeat(201))).toBe(false);
    expect(isValidIdempotencyKey("has space")).toBe(false);
    expect(isValidIdempotencyKey("has\nnewline")).toBe(false);
    expect(isValidIdempotencyKey(null)).toBe(false);
    expect(isValidIdempotencyKey(12345678)).toBe(false);
  });

  it("namespaces a key to its owner so two callers cannot collide", () => {
    expect(resolveIdempotencyActorKey({ profileId: "p1", sessionKey: "s1" })).toBe("profile:p1");
    expect(resolveIdempotencyActorKey({ profileId: null, sessionKey: "s1" })).toBe("session:s1");
    expect(resolveIdempotencyActorKey({ profileId: "  ", sessionKey: "  " })).toBeNull();
  });
});

describe("guest booking sessions carry no identity", () => {
  it("issues an opaque key of fixed shape", () => {
    const key = issueBookingSessionKey();
    expect(isBookingSessionKey(key)).toBe(true);
    expect(key).toHaveLength(32);
  });

  it("reuses a valid cookie and replaces a malformed one rather than erroring", () => {
    const existing = issueBookingSessionKey();
    expect(resolveBookingSessionKey(existing)).toEqual({ sessionKey: existing, issued: false });

    const replaced = resolveBookingSessionKey("tampered");
    expect(replaced.issued).toBe(true);
    expect(isBookingSessionKey(replaced.sessionKey)).toBe(true);

    expect(resolveBookingSessionKey(null).issued).toBe(true);
  });

  it("is httpOnly, same-site and short-lived, so it cannot become a tracker", () => {
    expect(BOOKING_SESSION_COOKIE_OPTIONS.httpOnly).toBe(true);
    expect(BOOKING_SESSION_COOKIE_OPTIONS.sameSite).toBe("lax");
    expect(BOOKING_SESSION_COOKIE_OPTIONS.maxAge).toBeLessThanOrEqual(60 * 60);
  });
});

describe("engine outcomes are normalized honestly", () => {
  it("returns the payload for a declared success", () => {
    const payload = unwrapEngineOutcome({ outcome: "created", holdId: "h1" }, ["created"]);
    expect(payload.holdId).toBe("h1");
  });

  it("maps each expected failure to its own kind and status", () => {
    const cases: Array<[string, string, number]> = [
      ["conflict", "conflict", 409],
      ["expired", "expired", 410],
      ["forbidden", "forbidden", 403],
      ["not_found", "not_found", 404],
      ["validation", "validation", 400],
      ["idempotency_conflict", "idempotency_conflict", 422]
    ];

    for (const [outcome, kind, status] of cases) {
      try {
        unwrapEngineOutcome({ outcome, reason: "slot_unavailable" }, ["created"]);
        throw new Error(`${outcome} did not throw`);
      } catch (error) {
        expect(error).toBeInstanceOf(BookingEngineError);
        expect((error as BookingEngineError).kind).toBe(kind);
        expect((error as BookingEngineError).status).toBe(status);
      }
    }
  });

  it("never reports an unrecognized outcome as a success", () => {
    for (const payload of [null, undefined, {}, { outcome: "who_knows" }, { outcome: 7 }]) {
      const error = captureError(() => unwrapEngineOutcome(payload as never, ["created"]));
      expect(error).toBeInstanceOf(BookingEngineError);
      expect((error as BookingEngineError).kind).toBe("retry");
    }
  });

  it("marks only transient failures as retryable", () => {
    expect(new BookingEngineError("retry", "engine_unavailable").retryable).toBe(true);
    expect(new BookingEngineError("conflict", "slot_unavailable").retryable).toBe(false);
    expect(new BookingEngineError("idempotency_conflict", "key_reused_with_different_payload").retryable).toBe(false);
  });

  it("carries the current revision through so a stale caller can recover", () => {
    const error = captureError(() =>
      unwrapEngineOutcome({ outcome: "conflict", reason: "stale_revision", currentRevision: 4 }, ["rescheduled"])
    ) as BookingEngineError;

    expect(error.details.currentRevision).toBe(4);
    expect(error.toResponseBody()).toMatchObject({
      kind: "conflict",
      reason: "stale_revision",
      retryable: false
    });
  });

  it("tells a person what happened rather than echoing a machine reason", () => {
    expect(new BookingEngineError("conflict", "slot_unavailable").message).toBe(
      "That time was just taken. Pick another opening."
    );
    expect(new BookingEngineError("expired", "hold_expired").message).toContain("expired");
    // An unmapped reason must not leak into user-facing text.
    expect(new BookingEngineError("retry", "some_internal_thing").message).toBe(
      "Booking is temporarily unavailable. Try again in a moment."
    );
  });

  it("never puts an internal message in a response body", () => {
    const body = new BookingEngineError("retry", "engine_unavailable").toResponseBody();
    expect(JSON.stringify(body)).not.toMatch(/stack|postgres|pg_|sql/i);
  });
});

function captureError(run: () => unknown) {
  try {
    run();
    return null;
  } catch (error) {
    return error;
  }
}
