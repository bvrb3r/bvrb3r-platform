import { describe, expect, it } from "vitest";
import {
  canPerformPr20Action,
  isExpectedRevision,
  MAX_CANCELLATION_REASON_LENGTH,
  normalizeCancellationReason,
  PR20_DEFERRED_STATUSES,
  PR20_TERMINAL_STATUSES,
  relationshipMayPerform,
  type BookingActorRelationship,
  type Pr20BookingAction
} from "@/lib/booking/engine/lifecycle";
import {
  BOOKING_SOURCE_DOORS,
  isBookingSourceDoor,
  isKioskSourceDoor,
  normalizeAttributionField,
  normalizeBookingAttribution,
  publicBookingDoors,
  resolveSourceDoor
} from "@/lib/booking/engine/attribution";
import { redactIdentityAuditMetadata } from "@/lib/auth/identity-audit";

describe("the PR 20 state machine covers only what booking owns", () => {
  it("confirms only from nothing, because confirmation is what creates the row", () => {
    expect(canPerformPr20Action("confirm", null)).toBe(true);
    expect(canPerformPr20Action("confirm", "confirmed")).toBe(false);
    expect(canPerformPr20Action("confirm", "cancelled")).toBe(false);
  });

  it("reschedules a scheduled booking, including the legacy status values", () => {
    for (const status of ["pending", "confirmed", "booked"]) {
      expect(canPerformPr20Action("reschedule", status), status).toBe(true);
    }
  });

  it("refuses to reschedule a booking that PR 21 owns", () => {
    for (const status of PR20_DEFERRED_STATUSES) {
      expect(canPerformPr20Action("reschedule", status), status).toBe(false);
    }
  });

  it("refuses every action on a terminal booking", () => {
    const actions: Pr20BookingAction[] = ["reschedule", "cancel"];
    for (const status of PR20_TERMINAL_STATUSES) {
      for (const action of actions) {
        expect(canPerformPr20Action(action, status), `${action} from ${status}`).toBe(false);
      }
    }
  });

  it("still allows cancelling a checked-in booking, because that is a booking decision", () => {
    expect(canPerformPr20Action("cancel", "checked_in")).toBe(true);
    // ...but not one already finished, which is a refund decision.
    expect(canPerformPr20Action("cancel", "completed")).toBe(false);
    expect(canPerformPr20Action("cancel", "no_show")).toBe(false);
  });

  it("treats an unknown status as not actionable rather than guessing", () => {
    expect(canPerformPr20Action("reschedule", "in_the_chair_probably")).toBe(false);
    expect(canPerformPr20Action("cancel", undefined)).toBe(false);
  });
});

describe("authority comes from the relationship, never from the lane", () => {
  const relationships: BookingActorRelationship[] = [
    "client_of_record",
    "barber_of_record",
    "shop_operator",
    "internal_operator"
  ];

  it("lets the client of record book, move and cancel their own booking", () => {
    expect(relationshipMayPerform("client_of_record", "confirm")).toBe(true);
    expect(relationshipMayPerform("client_of_record", "reschedule")).toBe(true);
    expect(relationshipMayPerform("client_of_record", "cancel")).toBe(true);
  });

  it("does not let a client mark their own booking complete", () => {
    expect(relationshipMayPerform("client_of_record", "complete")).toBe(false);
  });

  it("does not let a barber or operator confirm a booking on someone's behalf", () => {
    // Confirmation is the client's explicit act. A shop taking a booking for
    // someone is a front-desk flow with its own consent story, not this one.
    expect(relationshipMayPerform("barber_of_record", "confirm")).toBe(false);
    expect(relationshipMayPerform("shop_operator", "confirm")).toBe(false);
    expect(relationshipMayPerform("internal_operator", "confirm")).toBe(false);
  });

  it("grants nothing at all without a relationship", () => {
    for (const action of ["confirm", "reschedule", "cancel", "complete"] as Pr20BookingAction[]) {
      expect(relationshipMayPerform(null, action), action).toBe(false);
      expect(relationshipMayPerform(undefined, action), action).toBe(false);
    }
  });

  it("keeps internal access away from marking work complete", () => {
    // Internal operators support the business; they do not perform the service,
    // and a completion they recorded would be a fabricated fact.
    expect(relationshipMayPerform("internal_operator", "complete")).toBe(false);
  });

  it("gives every relationship a strictly bounded set of actions", () => {
    for (const relationship of relationships) {
      const allowed = (["confirm", "reschedule", "cancel", "complete"] as Pr20BookingAction[]).filter((action) =>
        relationshipMayPerform(relationship, action)
      );
      expect(allowed.length).toBeGreaterThan(0);
      expect(allowed.length).toBeLessThan(4);
    }
  });
});

describe("optimistic concurrency", () => {
  it("accepts a plausible revision only", () => {
    expect(isExpectedRevision(1)).toBe(true);
    expect(isExpectedRevision(42)).toBe(true);
    expect(isExpectedRevision(0)).toBe(false);
    expect(isExpectedRevision(-1)).toBe(false);
    expect(isExpectedRevision(1.5)).toBe(false);
    expect(isExpectedRevision("3")).toBe(false);
    expect(isExpectedRevision(Number.NaN)).toBe(false);
    expect(isExpectedRevision(2_000_000)).toBe(false);
  });
});

describe("cancellation metadata", () => {
  it("keeps what the person wrote, bounded", () => {
    expect(normalizeCancellationReason("  Something came up  ")).toBe("Something came up");
    expect(normalizeCancellationReason("x".repeat(400))).toHaveLength(MAX_CANCELLATION_REASON_LENGTH);
  });

  it("treats blank and non-string input as no reason given", () => {
    expect(normalizeCancellationReason("   ")).toBeNull();
    expect(normalizeCancellationReason(null)).toBeNull();
    expect(normalizeCancellationReason(42)).toBeNull();
  });
});

describe("attribution is a closed set, not free text", () => {
  it("recognizes exactly the seven doors", () => {
    expect(BOOKING_SOURCE_DOORS).toHaveLength(7);
    for (const door of BOOKING_SOURCE_DOORS) {
      expect(isBookingSourceDoor(door)).toBe(true);
    }
    expect(isBookingSourceDoor("some_partner")).toBe(false);
    expect(isBookingSourceDoor(null)).toBe(false);
  });

  it("keeps kiosk doors out of the set a public web request may claim", () => {
    const publicDoors = publicBookingDoors();
    expect(publicDoors).not.toContain("kiosk_shop");
    expect(publicDoors).not.toContain("kiosk_barber");
    expect(publicDoors).not.toContain("external_readonly");

    // A web caller asking to be recorded as a kiosk is given the fallback.
    expect(resolveSourceDoor("kiosk_shop", publicDoors, "bvrb3r_web")).toBe("bvrb3r_web");
    expect(resolveSourceDoor("barber_profile", publicDoors, "bvrb3r_web")).toBe("barber_profile");
  });

  it("identifies the kiosk doors for callers that need to branch on them", () => {
    expect(isKioskSourceDoor("kiosk_shop")).toBe(true);
    expect(isKioskSourceDoor("bvrb3r_web")).toBe(false);
  });

  it("falls back predictably when the requested door is absent or unknown", () => {
    expect(resolveSourceDoor(undefined, publicBookingDoors(), "bvrb3r_app")).toBe("bvrb3r_app");
    expect(resolveSourceDoor("nonsense", ["kiosk_shop"], "bvrb3r_web")).toBe("kiosk_shop");
  });
});

describe("campaign metadata is bounded and never credential-shaped", () => {
  it("keeps a plain identifier", () => {
    expect(normalizeAttributionField("spring-2026_promo")).toBe("spring-2026_promo");
    expect(normalizeAttributionField("  ref:abc  ")).toBe("ref:abc");
  });

  it("drops anything longer than the column allows", () => {
    expect(normalizeAttributionField("a".repeat(121))).toBeNull();
    expect(normalizeAttributionField("a".repeat(120))).toHaveLength(120);
  });

  it("drops values carrying characters an identifier would never need", () => {
    for (const value of ["<script>", "a b", "drop table", "emoji🙂", "semi;colon", "quote'"]) {
      expect(normalizeAttributionField(value), value).toBeNull();
    }
  });

  it("drops anything that looks like a credential even under an innocent name", () => {
    for (const value of [
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc",
      "Bearer-abcdefghijklmnop",
      "sb_secret_abcdefghijklmnopqrst",
      "access_token"
    ]) {
      expect(normalizeAttributionField(value), value).toBeNull();
    }
  });

  it("normalizes a whole attribution payload in one pass", () => {
    const normalized = normalizeBookingAttribution(
      {
        sourceDoor: "kiosk_barber",
        sourceSurface: "profile-cta",
        campaignId: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.leak",
        referralCode: "friend-1234",
        correlationId: "req_01HZY"
      },
      publicBookingDoors(),
      "bvrb3r_web"
    );

    expect(normalized).toEqual({
      sourceDoor: "bvrb3r_web",
      sourceSurface: "profile-cta",
      campaignId: null,
      referralCode: "friend-1234",
      correlationId: "req_01HZY"
    });
  });

  it("carries no personal detail through attribution at all", () => {
    const normalized = normalizeBookingAttribution(
      { campaignId: "person@example.com", referralCode: "+1 813 555 0100" },
      publicBookingDoors(),
      "bvrb3r_web"
    );

    // An email fails the identifier allowlist on `@`, a phone on the spaces and
    // `+`. Neither reaches a durable attribution row.
    expect(normalized.campaignId).toBeNull();
    expect(normalized.referralCode).toBeNull();
  });
});

describe("booking audit metadata inherits the PR 19 redaction", () => {
  it("redacts credential-shaped keys before an audit write", () => {
    const redacted = redactIdentityAuditMetadata({
      appointmentId: "a1",
      holdToken: "should-not-survive",
      idempotency_key: "k".repeat(32),
      sourceDoor: "bvrb3r_web"
    }) as Record<string, unknown>;

    expect(redacted.appointmentId).toBe("a1");
    expect(redacted.sourceDoor).toBe("bvrb3r_web");
    expect(redacted.holdToken).toBe("[redacted]");
  });

  it("redacts a credential-shaped value under an innocent key", () => {
    const redacted = redactIdentityAuditMetadata({
      note: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"
    }) as Record<string, unknown>;

    expect(redacted.note).toBe("[redacted]");
  });
});
