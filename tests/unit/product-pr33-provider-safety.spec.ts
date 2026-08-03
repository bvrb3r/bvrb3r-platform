import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryGoogleFreeBusy } from "@/lib/calendar-sync/providers/google";
import { listSquareBookings, revokeSquareToken } from "@/lib/calendar-sync/providers/square";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("Product PR33 provider safety", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    process.env.SQUARE_ENVIRONMENT = "sandbox";
    process.env.SQUARE_APPLICATION_ID = "synthetic-square-app";
    process.env.SQUARE_APPLICATION_SECRET = "synthetic-square-secret";
    process.env.SQUARE_CALENDAR_REDIRECT_URI = "https://bvrb3r.app/api/calendar-sync/square/oauth/callback";
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    delete process.env.SQUARE_ENVIRONMENT;
    delete process.env.SQUARE_APPLICATION_ID;
    delete process.env.SQUARE_APPLICATION_SECRET;
    delete process.env.SQUARE_CALENDAR_REDIRECT_URI;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("collects every Square cursor page instead of silently truncating at 500", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      const cursor = url.searchParams.get("cursor");
      const page = cursor ? Number(cursor.replace("page-", "")) : 1;
      const bookings = Array.from({ length: 100 }, (_, index) => ({
        id: `booking-${page}-${index}`,
        start_at: "2026-08-03T10:00:00.000Z",
        appointment_segments: [{ duration_minutes: 30, team_member_id: "team-1" }]
      }));
      return jsonResponse({ bookings, cursor: page < 6 ? `page-${page + 1}` : undefined });
    });

    const bookings = await listSquareBookings({
      accessToken: "synthetic-access-token",
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-12-01T00:00:00.000Z"
    });

    expect(bookings).toHaveLength(600);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("rejects a repeated Square cursor before returning a partial snapshot", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ bookings: [{ id: "one", start_at: "2026-08-03T10:00:00.000Z" }], cursor: "repeat" }))
      .mockResolvedValueOnce(jsonResponse({ bookings: [{ id: "two", start_at: "2026-08-03T11:00:00.000Z" }], cursor: "repeat" }));

    await expect(listSquareBookings({
      accessToken: "synthetic-access-token",
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-12-01T00:00:00.000Z"
    })).rejects.toMatchObject({ code: "square_booking_cursor_repeated" });
  });

  it("rejects an HTTP-200 Square page carrying provider errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      bookings: [{ id: "partial", start_at: "2026-08-03T10:00:00.000Z" }],
      errors: [{ code: "TEMPORARY_ERROR" }]
    }));

    await expect(listSquareBookings({
      accessToken: "synthetic-access-token",
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-12-01T00:00:00.000Z"
    })).rejects.toMatchObject({ code: "square_booking_read_failed" });
  });

  it("defaults Square cleanup to one access token instead of merchant-wide revocation", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    await revokeSquareToken("synthetic-access-token");

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      client_id: "synthetic-square-app",
      access_token: "synthetic-access-token",
      revoke_only_access_token: true
    });
  });

  it("marks only failed Google calendars and preserves successful free/busy windows", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      calendars: {
        primary: { errors: [{ reason: "notFound" }] },
        work: { busy: [{ start: "2026-08-03T10:00:00Z", end: "2026-08-03T11:00:00Z" }] }
      }
    }));

    await expect(queryGoogleFreeBusy({
      accessToken: "synthetic-access-token",
      calendarIds: ["primary", "work"],
      startsAt: "2026-08-01T00:00:00.000Z",
      endsAt: "2026-12-01T00:00:00.000Z"
    })).resolves.toEqual({
      calendars: {
        work: [{ start: "2026-08-03T10:00:00.000Z", end: "2026-08-03T11:00:00.000Z" }]
      },
      failedCalendarIds: ["primary"]
    });
  });
});
