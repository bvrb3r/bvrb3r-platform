import {
  GOOGLE_CALENDAR_SCOPES,
  SQUARE_CALENDAR_SCOPES,
  assertGoogleCalendarScopes,
  assertSquareReadOnlyScopes,
  buildBusyBlockHash,
  buildCalendarLoopTag,
  isBvrb3rCalendarLoopTag,
  resolveLastKnownCalendarState
} from "@/lib/calendar-sync/domain";
import { buildGoogleAuthorizationUrl } from "@/lib/calendar-sync/providers/google";
import { buildSquareAuthorizationUrl } from "@/lib/calendar-sync/providers/square";

describe("Product PR33 calendar doctrine", () => {
  beforeEach(() => {
    process.env.SQUARE_APPLICATION_ID = "synthetic-square-app";
    process.env.SQUARE_APPLICATION_SECRET = "synthetic-square-secret";
    process.env.SQUARE_CALENDAR_REDIRECT_URI = "https://bvrb3r.app/api/calendar-sync/square/oauth/callback";
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "synthetic-google-client";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "synthetic-google-secret";
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = "https://bvrb3r.app/api/calendar-sync/google/oauth/callback";
  });

  afterEach(() => {
    delete process.env.SQUARE_APPLICATION_ID;
    delete process.env.SQUARE_APPLICATION_SECRET;
    delete process.env.SQUARE_CALENDAR_REDIRECT_URI;
    delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
    delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
    delete process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  });

  it("accepts only Square Appointments READ and rejects every money or write scope", () => {
    expect(assertSquareReadOnlyScopes(["APPOINTMENTS_READ"])).toEqual([...SQUARE_CALENDAR_SCOPES]);
    expect(() => assertSquareReadOnlyScopes(["APPOINTMENTS_READ", "PAYMENTS_READ"]))
      .toThrow(/read access only/i);
    expect(() => assertSquareReadOnlyScopes(["APPOINTMENTS_READ", "APPOINTMENTS_WRITE"]))
      .toThrow(/read access only/i);

    const url = new URL(buildSquareAuthorizationUrl("synthetic-square-state"));
    expect(url.searchParams.get("scope")).toBe("APPOINTMENTS_READ");
    expect(url.searchParams.get("scope")).not.toMatch(/PAYMENT|PAYOUT|WRITE|CARD/i);
  });

  it("limits Google to the BVRB3R-created calendar plus free/busy", () => {
    expect(assertGoogleCalendarScopes([...GOOGLE_CALENDAR_SCOPES].reverse())).toEqual([...GOOGLE_CALENDAR_SCOPES]);
    expect(() => assertGoogleCalendarScopes([...GOOGLE_CALENDAR_SCOPES, "https://www.googleapis.com/auth/calendar.events"]))
      .toThrow(/limited/i);

    const url = new URL(buildGoogleAuthorizationUrl("synthetic-google-state"));
    expect(url.searchParams.get("scope")?.split(" ")).toEqual([...GOOGLE_CALENDAR_SCOPES]);
    expect(url.searchParams.get("include_granted_scopes")).toBe("false");
    expect(url.searchParams.get("scope")).not.toContain("calendar.readonly");
    expect(url.searchParams.get("scope")).not.toContain("calendar.events ");
  });

  it("tags outbound events and creates stable privacy hashes for busy windows", () => {
    const loopTag = buildCalendarLoopTag("appointment-123");
    expect(loopTag).toBe("bvrb3r:appointment:appointment-123");
    expect(isBvrb3rCalendarLoopTag(loopTag)).toBe(true);
    expect(isBvrb3rCalendarLoopTag("external:apple")).toBe(false);

    const first = buildBusyBlockHash({
      provider: "google",
      calendarIdHash: "a".repeat(64),
      startsAt: "2026-08-03T10:00:00.000Z",
      endsAt: "2026-08-03T11:00:00.000Z"
    });
    const second = buildBusyBlockHash({
      provider: "google",
      calendarIdHash: "a".repeat(64),
      startsAt: "2026-08-03T10:00:00.000Z",
      endsAt: "2026-08-03T11:00:00.000Z"
    });
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("serves stamped last-known state only after a prior successful sync", () => {
    expect(resolveLastKnownCalendarState({
      status: "degraded",
      lastSuccessAt: "2026-08-03T10:00:00.000Z",
      lastSyncAt: "2026-08-03T10:05:00.000Z"
    })).toEqual({
      servingLastKnown: true,
      stampedAt: "2026-08-03T10:00:00.000Z"
    });
    expect(resolveLastKnownCalendarState({ status: "degraded", lastSuccessAt: null, lastSyncAt: null }).servingLastKnown).toBe(false);
  });
});
