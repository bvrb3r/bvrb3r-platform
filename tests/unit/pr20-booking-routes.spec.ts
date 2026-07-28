import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingEngineError } from "@/lib/booking/engine/errors";
import { BOOKING_SESSION_COOKIE } from "@/lib/booking/engine/session";

/**
 * Route contracts for the booking engine.
 *
 * The engine itself is mocked here on purpose: these assert the boundary — what
 * a route accepts, who it lets through, what it returns when the engine says no,
 * and what it never puts in a response. The engine's own rules are exercised in
 * the sibling specs, and the SQL in the migration spec.
 */

const engine = vi.hoisted(() => ({
  readBookingAvailability: vi.fn(),
  createBookingHold: vi.fn(),
  releaseBookingHold: vi.fn(),
  confirmBooking: vi.fn(),
  rescheduleBooking: vi.fn(),
  cancelBooking: vi.fn(),
  readBookingAppointment: vi.fn()
}));

const auth = vi.hoisted(() => ({ getVerifiedActor: vi.fn() }));
const rateLimit = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 })),
  clientKeyFromRequest: vi.fn(() => "test-client")
}));
const clientResolution = vi.hoisted(() => ({ resolveConfirmingClientId: vi.fn() }));

vi.mock("@/lib/booking/engine", () => engine);
vi.mock("@/lib/auth/permissions", () => auth);
vi.mock("@/lib/kiosk/rate-limit", () => rateLimit);
vi.mock("@/lib/booking/engine/client-resolution", () => clientResolution);

const { GET: getAvailability } = await import("@/app/api/booking/availability/route");
const { POST: createHold } = await import("@/app/api/booking/holds/route");
const { POST: releaseHold } = await import("@/app/api/booking/holds/release/route");
const { POST: confirm } = await import("@/app/api/booking/confirm/route");
const { GET: readAppointment } = await import("@/app/api/booking/appointments/[appointmentId]/route");
const { POST: reschedule } = await import("@/app/api/booking/appointments/[appointmentId]/reschedule/route");
const { POST: cancel } = await import("@/app/api/booking/appointments/[appointmentId]/cancel/route");

const BARBER_ID = "11111111-1111-1111-1111-111111111111";
const SERVICE_ID = "22222222-2222-2222-2222-222222222222";
const APPOINTMENT_ID = "33333333-3333-3333-3333-333333333333";
const HOLD_TOKEN = "a".repeat(43);

function postRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers }
  });
}

function signedIn() {
  auth.getVerifiedActor.mockResolvedValue({
    user: { id: "profile-1", role: "client_user", platformAdmin: false, accountStatus: "active", email: "a@b.co" },
    authenticated: true,
    mode: "supabase"
  });
}

function guest() {
  auth.getVerifiedActor.mockResolvedValue(null);
}

beforeEach(() => {
  guest();
  rateLimit.consumeRateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("availability", () => {
  it("refuses a request that does not identify a barber and a service", async () => {
    const response = await getAvailability(new NextRequest("http://localhost/api/booking/availability"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ kind: "validation", retryable: false });
    expect(engine.readBookingAvailability).not.toHaveBeenCalled();
  });

  it("refuses identifiers that are not uuids, before any database work", async () => {
    const response = await getAvailability(
      new NextRequest("http://localhost/api/booking/availability?barberId=not-a-uuid&serviceId=" + SERVICE_ID)
    );
    expect(response.status).toBe(400);
    expect(engine.readBookingAvailability).not.toHaveBeenCalled();
  });

  it("returns slots with the reason attached when there are none", async () => {
    engine.readBookingAvailability.mockResolvedValue({
      timezone: "America/New_York",
      slots: [],
      days: [],
      unavailableReason: "no_working_window"
    });

    const response = await getAvailability(
      new NextRequest(`http://localhost/api/booking/availability?barberId=${BARBER_ID}&serviceId=${SERVICE_ID}`)
    );

    expect(response.status).toBe(200);
    expect((await response.json()).availability.unavailableReason).toBe("no_working_window");
  });

  it("is reachable without signing in, because comparing barbers comes first", async () => {
    engine.readBookingAvailability.mockResolvedValue({ slots: [], days: [], unavailableReason: null });
    const response = await getAvailability(
      new NextRequest(`http://localhost/api/booking/availability?barberId=${BARBER_ID}&serviceId=${SERVICE_ID}`)
    );

    expect(response.status).toBe(200);
  });

  it("is rate limited", async () => {
    rateLimit.consumeRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 30 });
    const response = await getAvailability(
      new NextRequest(`http://localhost/api/booking/availability?barberId=${BARBER_ID}&serviceId=${SERVICE_ID}`)
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(engine.readBookingAvailability).not.toHaveBeenCalled();
  });
});

describe("holds", () => {
  const body = {
    barberId: BARBER_ID,
    serviceId: SERVICE_ID,
    startsAt: "2026-08-01T14:00:00.000Z"
  };

  it("returns the token once and issues a booking session for a guest", async () => {
    engine.createBookingHold.mockResolvedValue({
      holdToken: HOLD_TOKEN,
      hold: { holdId: "hold-1", expiresAt: "2026-08-01T13:05:00.000Z" }
    });

    const response = await createHold(postRequest("http://localhost/api/booking/holds", body));

    expect(response.status).toBe(201);
    expect((await response.json()).holdToken).toBe(HOLD_TOKEN);

    const cookie = response.cookies.get(BOOKING_SESSION_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("binds a signed-in caller to their profile rather than to a cookie", async () => {
    signedIn();
    engine.createBookingHold.mockResolvedValue({ holdToken: HOLD_TOKEN, hold: { holdId: "hold-1" } });

    const response = await createHold(postRequest("http://localhost/api/booking/holds", body));

    expect(engine.createBookingHold.mock.calls[0][0].actor).toMatchObject({
      profileId: "profile-1",
      sessionKey: null
    });
    expect(response.cookies.get(BOOKING_SESSION_COOKIE)).toBeUndefined();
  });

  it("offers no way to send a price, duration or end time", async () => {
    engine.createBookingHold.mockResolvedValue({ holdToken: HOLD_TOKEN, hold: {} });

    await createHold(
      postRequest("http://localhost/api/booking/holds", {
        ...body,
        priceCents: 1,
        durationMin: 5,
        endsAt: "2026-08-01T14:05:00.000Z"
      })
    );

    const forwarded = engine.createBookingHold.mock.calls[0][0];
    expect(forwarded).not.toHaveProperty("priceCents");
    expect(forwarded).not.toHaveProperty("durationMin");
    expect(forwarded).not.toHaveProperty("endsAt");
  });

  it("only lets a web caller claim a public door", async () => {
    engine.createBookingHold.mockResolvedValue({ holdToken: HOLD_TOKEN, hold: {} });

    await createHold(postRequest("http://localhost/api/booking/holds", { ...body, sourceDoor: "kiosk_shop" }));

    const forwarded = engine.createBookingHold.mock.calls[0][0];
    expect(forwarded.allowedDoors).not.toContain("kiosk_shop");
    expect(forwarded.fallbackDoor).toBe("bvrb3r_web");
  });

  it("reports a lost race as a conflict, never as a hold", async () => {
    engine.createBookingHold.mockRejectedValue(new BookingEngineError("conflict", "slot_unavailable"));

    const response = await createHold(postRequest("http://localhost/api/booking/holds", body));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      kind: "conflict",
      reason: "slot_unavailable",
      retryable: false
    });
  });

  it("reports a reused key with a different payload as an idempotency conflict", async () => {
    engine.createBookingHold.mockRejectedValue(
      new BookingEngineError("idempotency_conflict", "key_reused_with_different_payload")
    );

    const response = await createHold(
      postRequest("http://localhost/api/booking/holds", { ...body, idempotencyKey: "k".repeat(32) })
    );

    expect(response.status).toBe(422);
    expect((await response.json()).reason).toBe("key_reused_with_different_payload");
  });

  it("never describes an unexpected failure in its own words", async () => {
    engine.createBookingHold.mockRejectedValue(new Error("relation public.booking_slot_holds does not exist"));

    const response = await createHold(postRequest("http://localhost/api/booking/holds", body));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(JSON.stringify(payload)).not.toContain("booking_slot_holds");
    expect(payload.retryable).toBe(true);
  });

  it("refuses a malformed body without calling the engine", async () => {
    const response = await createHold(postRequest("http://localhost/api/booking/holds", { barberId: "nope" }));
    expect(response.status).toBe(400);
    expect(engine.createBookingHold).not.toHaveBeenCalled();
  });
});

describe("releasing a hold", () => {
  it("reports success when the hold was already released", async () => {
    engine.releaseBookingHold.mockResolvedValue({ holdId: "hold-1", alreadyReleased: true });

    const response = await releaseHold(
      postRequest("http://localhost/api/booking/holds/release", { holdToken: HOLD_TOKEN })
    );

    expect(response.status).toBe(200);
    expect((await response.json()).alreadyReleased).toBe(true);
  });

  it("reports a conflict when the hold was already used to book", async () => {
    engine.releaseBookingHold.mockRejectedValue(new BookingEngineError("conflict", "hold_already_consumed"));

    const response = await releaseHold(
      postRequest("http://localhost/api/booking/holds/release", { holdToken: HOLD_TOKEN })
    );

    expect(response.status).toBe(409);
  });

  it("refuses a hold token belonging to another session", async () => {
    engine.releaseBookingHold.mockRejectedValue(new BookingEngineError("forbidden", "hold_not_owned"));

    const response = await releaseHold(
      postRequest("http://localhost/api/booking/holds/release", { holdToken: HOLD_TOKEN })
    );

    expect(response.status).toBe(403);
  });
});

describe("confirmation", () => {
  it("books through a server action for a guest and returns the booking", async () => {
    clientResolution.resolveConfirmingClientId.mockResolvedValue("client-1");
    engine.confirmBooking.mockResolvedValue({ appointmentId: APPOINTMENT_ID, status: "confirmed", revision: 1 });

    const response = await confirm(
      postRequest("http://localhost/api/booking/confirm", {
        holdToken: HOLD_TOKEN,
        fullName: "Sam Rivera",
        phone: "8135550100",
        email: "sam@example.com"
      })
    );

    expect(response.status).toBe(201);
    expect((await response.json()).booking.appointmentId).toBe(APPOINTMENT_ID);
  });

  it("refuses a guest confirmation with no way to reach the person", async () => {
    clientResolution.resolveConfirmingClientId.mockRejectedValue(
      new BookingEngineError("validation", "missing_required_input")
    );

    const response = await confirm(
      postRequest("http://localhost/api/booking/confirm", { holdToken: HOLD_TOKEN })
    );

    expect(response.status).toBe(400);
    expect(engine.confirmBooking).not.toHaveBeenCalled();
  });

  it("reports an expired hold as expired, not as a generic failure", async () => {
    clientResolution.resolveConfirmingClientId.mockResolvedValue("client-1");
    engine.confirmBooking.mockRejectedValue(new BookingEngineError("expired", "hold_expired"));

    const response = await confirm(
      postRequest("http://localhost/api/booking/confirm", { holdToken: HOLD_TOKEN })
    );

    expect(response.status).toBe(410);
    expect((await response.json()).reason).toBe("hold_expired");
  });

  it("takes no payment field of any kind", async () => {
    clientResolution.resolveConfirmingClientId.mockResolvedValue("client-1");
    engine.confirmBooking.mockResolvedValue({ appointmentId: APPOINTMENT_ID });

    await confirm(
      postRequest("http://localhost/api/booking/confirm", {
        holdToken: HOLD_TOKEN,
        paymentMethodId: "pm_123",
        depositAmount: 500
      })
    );

    const forwarded = engine.confirmBooking.mock.calls[0][0];
    expect(forwarded).not.toHaveProperty("paymentMethodId");
    expect(forwarded).not.toHaveProperty("depositAmount");
  });
});

describe("changing an existing booking requires an account", () => {
  const params = { params: Promise.resolve({ appointmentId: APPOINTMENT_ID }) };

  it("refuses a guest session on read, reschedule and cancel", async () => {
    const responses = await Promise.all([
      readAppointment(new NextRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}`), {
        params: Promise.resolve({ appointmentId: APPOINTMENT_ID })
      }),
      reschedule(
        postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/reschedule`, {
          expectedRevision: 1,
          holdToken: HOLD_TOKEN
        }),
        { params: Promise.resolve({ appointmentId: APPOINTMENT_ID }) }
      ),
      cancel(
        postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/cancel`, { expectedRevision: 1 }),
        { params: Promise.resolve({ appointmentId: APPOINTMENT_ID }) }
      )
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
    }
    expect(engine.rescheduleBooking).not.toHaveBeenCalled();
    expect(engine.cancelBooking).not.toHaveBeenCalled();
  });

  it("tells a stranger the booking was not found rather than that it exists", async () => {
    signedIn();
    engine.readBookingAppointment.mockRejectedValue(
      new BookingEngineError("not_found", "appointment_not_found")
    );

    const response = await readAppointment(
      new NextRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}`),
      params
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ kind: "not_found" });
  });

  it("returns the immutable snapshot and attribution on read", async () => {
    signedIn();
    engine.readBookingAppointment.mockResolvedValue({
      appointmentId: APPOINTMENT_ID,
      service: { name: "Signature cut", priceCents: 4500, durationMin: 30, bufferMin: 10, currency: "usd" },
      attribution: { sourceDoor: "barber_profile", campaignId: null, referralCode: null }
    });

    const response = await readAppointment(
      new NextRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}`),
      params
    );

    const payload = await response.json();
    expect(payload.appointment.service.priceCents).toBe(4500);
    expect(payload.appointment.attribution.sourceDoor).toBe("barber_profile");
  });
});

/**
 * Two failures look identical inside session resolution and mean opposite
 * things: nobody is signed in, versus we cannot tell who is signed in. Only the
 * first is safe to answer with "sign in"; the second must stay a retry, or a
 * signed-in client gets told to sign in and a broken auth path goes unnoticed.
 * Neither may ever grant authority.
 */
describe("session resolution distinguishes 'no session' from 'cannot verify'", () => {
  const params = () => ({ params: Promise.resolve({ appointmentId: APPOINTMENT_ID }) });

  it("answers a request with no auth material deterministically, even if the resolver throws", async () => {
    auth.getVerifiedActor.mockRejectedValue(new Error("session store unreachable"));

    const responses = await Promise.all([
      readAppointment(new NextRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}`), params()),
      reschedule(
        postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/reschedule`, {
          expectedRevision: 1,
          holdToken: HOLD_TOKEN
        }),
        params()
      ),
      cancel(
        postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/cancel`, { expectedRevision: 1 }),
        params()
      )
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect((await response.json()).reason).toBe("actor_not_permitted");
    }

    expect(engine.readBookingAppointment).not.toHaveBeenCalled();
    expect(engine.rescheduleBooking).not.toHaveBeenCalled();
    expect(engine.cancelBooking).not.toHaveBeenCalled();
  });

  it("keeps the honest retry when a session is present but cannot be verified", async () => {
    auth.getVerifiedActor.mockRejectedValue(new Error("session store unreachable"));

    const authed = (path: string, body?: unknown) =>
      body === undefined
        ? new NextRequest(`http://localhost${path}`, {
            headers: { cookie: "sb-abcdefg-auth-token=partial-value" }
          })
        : postRequest(`http://localhost${path}`, body, { cookie: "sb-abcdefg-auth-token=partial-value" });

    const responses = await Promise.all([
      readAppointment(authed(`/api/booking/appointments/${APPOINTMENT_ID}`), params()),
      reschedule(
        authed(`/api/booking/appointments/${APPOINTMENT_ID}/reschedule`, {
          expectedRevision: 1,
          holdToken: HOLD_TOKEN
        }),
        params()
      ),
      cancel(authed(`/api/booking/appointments/${APPOINTMENT_ID}/cancel`, { expectedRevision: 1 }), params())
    ]);

    for (const response of responses) {
      expect(response.status).toBe(503);
      const payload = await response.json();
      expect(payload.kind).toBe("retry");
      expect(payload.retryable).toBe(true);
    }

    // The decisive property: an unverifiable session grants nothing.
    expect(engine.readBookingAppointment).not.toHaveBeenCalled();
    expect(engine.rescheduleBooking).not.toHaveBeenCalled();
    expect(engine.cancelBooking).not.toHaveBeenCalled();
  });

  it.each([
    ["chunked supabase cookie", "sb-abcdefg-auth-token.0=chunk"],
    ["legacy supabase cookie", "sb-access-token=value"],
    ["demo session cookie", "bvrb3r-demo-email=someone%40example.com"]
  ])("treats a %s as a session claim rather than a guest", async (_label, cookie) => {
    auth.getVerifiedActor.mockRejectedValue(new Error("session store unreachable"));

    const response = await cancel(
      postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/cancel`, { expectedRevision: 1 }, { cookie }),
      params()
    );

    expect(response.status).toBe(503);
    expect(engine.cancelBooking).not.toHaveBeenCalled();
  });

  it("treats a booking-session cookie alone as a guest, not as a session claim", async () => {
    auth.getVerifiedActor.mockRejectedValue(new Error("session store unreachable"));

    const response = await cancel(
      postRequest(
        `http://localhost/api/booking/appointments/${APPOINTMENT_ID}/cancel`,
        { expectedRevision: 1 },
        { cookie: `${BOOKING_SESSION_COOKIE}=${"g".repeat(32)}` }
      ),
      params()
    );

    expect(response.status).toBe(403);
  });

  it("lets a guest still take a hold when the resolver is failing", async () => {
    auth.getVerifiedActor.mockRejectedValue(new Error("session store unreachable"));
    engine.createBookingHold.mockResolvedValue({ holdToken: HOLD_TOKEN, hold: { holdId: "hold-1" } });

    const response = await createHold(
      postRequest("http://localhost/api/booking/holds", {
        barberId: BARBER_ID,
        serviceId: SERVICE_ID,
        startsAt: "2026-08-01T14:00:00.000Z"
      })
    );

    expect(response.status).toBe(201);
    expect(engine.createBookingHold.mock.calls[0][0].actor.profileId).toBeNull();
  });
});

describe("reschedule", () => {
  const params = { params: Promise.resolve({ appointmentId: APPOINTMENT_ID }) };

  beforeEach(() => {
    signedIn();
  });

  it("requires a validated hold rather than a bare time", async () => {
    const response = await reschedule(
      postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/reschedule`, {
        expectedRevision: 1,
        appointmentTime: "2026-08-01T15:00:00.000Z"
      }),
      params
    );

    expect(response.status).toBe(400);
    expect(engine.rescheduleBooking).not.toHaveBeenCalled();
  });

  it("requires the revision the caller believed it was changing", async () => {
    const response = await reschedule(
      postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/reschedule`, {
        holdToken: HOLD_TOKEN
      }),
      params
    );

    expect(response.status).toBe(400);
    expect(engine.rescheduleBooking).not.toHaveBeenCalled();
  });

  it("reports a stale revision as a conflict carrying the current one", async () => {
    engine.rescheduleBooking.mockRejectedValue(
      new BookingEngineError("conflict", "stale_revision", undefined, { currentRevision: 3 })
    );

    const response = await reschedule(
      postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/reschedule`, {
        expectedRevision: 1,
        holdToken: HOLD_TOKEN
      }),
      params
    );

    expect(response.status).toBe(409);
    expect((await response.json()).details.currentRevision).toBe(3);
  });

  it("refuses an actor with no authority over the booking", async () => {
    engine.rescheduleBooking.mockRejectedValue(new BookingEngineError("forbidden", "actor_not_permitted"));

    const response = await reschedule(
      postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/reschedule`, {
        expectedRevision: 1,
        holdToken: HOLD_TOKEN
      }),
      params
    );

    expect(response.status).toBe(403);
  });

  it("refuses a booking already in the chair, which PR 21 owns", async () => {
    engine.rescheduleBooking.mockRejectedValue(
      new BookingEngineError("forbidden", "invalid_transition", undefined, { status: "in_service" })
    );

    const response = await reschedule(
      postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/reschedule`, {
        expectedRevision: 1,
        holdToken: HOLD_TOKEN
      }),
      params
    );

    expect(response.status).toBe(403);
    expect((await response.json()).reason).toBe("invalid_transition");
  });

  it("returns the new window and bumped revision on success", async () => {
    engine.rescheduleBooking.mockResolvedValue({
      appointmentId: APPOINTMENT_ID,
      startsAt: "2026-08-02T14:00:00.000Z",
      previousStartsAt: "2026-08-01T14:00:00.000Z",
      revision: 2
    });

    const response = await reschedule(
      postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/reschedule`, {
        expectedRevision: 1,
        holdToken: HOLD_TOKEN
      }),
      params
    );

    expect(response.status).toBe(200);
    expect((await response.json()).booking).toMatchObject({ revision: 2 });
  });
});

describe("cancel", () => {
  const params = { params: Promise.resolve({ appointmentId: APPOINTMENT_ID }) };

  beforeEach(() => {
    signedIn();
  });

  it("reports success when the booking was already cancelled", async () => {
    engine.cancelBooking.mockResolvedValue({ appointmentId: APPOINTMENT_ID, alreadyCancelled: true, revision: 2 });

    const response = await cancel(
      postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/cancel`, { expectedRevision: 2 }),
      params
    );

    expect(response.status).toBe(200);
    expect((await response.json()).booking.alreadyCancelled).toBe(true);
  });

  it("passes the reason through and refuses one that is too long", async () => {
    engine.cancelBooking.mockResolvedValue({ appointmentId: APPOINTMENT_ID, revision: 2 });

    await cancel(
      postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/cancel`, {
        expectedRevision: 1,
        reason: "Client asked to move to next week"
      }),
      params
    );
    expect(engine.cancelBooking.mock.calls[0][0].reason).toBe("Client asked to move to next week");

    const tooLong = await cancel(
      postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/cancel`, {
        expectedRevision: 1,
        reason: "x".repeat(400)
      }),
      params
    );
    expect(tooLong.status).toBe(400);
  });

  it("refuses to cancel a finished booking", async () => {
    engine.cancelBooking.mockRejectedValue(
      new BookingEngineError("forbidden", "invalid_transition", undefined, { status: "completed" })
    );

    const response = await cancel(
      postRequest(`http://localhost/api/booking/appointments/${APPOINTMENT_ID}/cancel`, { expectedRevision: 1 }),
      params
    );

    expect(response.status).toBe(403);
  });
});
