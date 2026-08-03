import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCalendarBarberUserMock,
  getSquareMappingOptionsForUserMock,
  ingestAppleBusyWindowsMock,
  processCalendarSyncScheduleMock,
  saveSquareMappingForUserMock
} = vi.hoisted(() => ({
  getCalendarBarberUserMock: vi.fn(),
  getSquareMappingOptionsForUserMock: vi.fn(),
  ingestAppleBusyWindowsMock: vi.fn(),
  processCalendarSyncScheduleMock: vi.fn(),
  saveSquareMappingForUserMock: vi.fn()
}));

vi.mock("@/lib/calendar-sync/route-auth", () => ({
  getCalendarBarberUser: getCalendarBarberUserMock
}));

vi.mock("@/lib/calendar-sync/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/calendar-sync/service")>();
  return {
    ...original,
    ingestAppleBusyWindows: ingestAppleBusyWindowsMock
  };
});

vi.mock("@/lib/calendar-sync/worker", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/calendar-sync/worker")>();
  return {
    ...original,
    getSquareMappingOptionsForUser: getSquareMappingOptionsForUserMock,
    processCalendarSyncSchedule: processCalendarSyncScheduleMock,
    saveSquareMappingForUser: saveSquareMappingForUserMock
  };
});

import { POST as postProvider } from "@/app/api/calendar-sync/[provider]/route";
import { POST as postSchedule } from "@/app/api/calendar-sync/scheduled/route";

describe("Product PR33 calendar routes", () => {
  beforeEach(() => {
    process.env.CALENDAR_SYNC_CRON_SECRET = "synthetic-calendar-cron-secret";
    getCalendarBarberUserMock.mockReset();
    ingestAppleBusyWindowsMock.mockReset();
    getSquareMappingOptionsForUserMock.mockReset();
    processCalendarSyncScheduleMock.mockReset();
    saveSquareMappingForUserMock.mockReset();
    getCalendarBarberUserMock.mockResolvedValue({ id: "profile-1", role: "barber_user" });
    processCalendarSyncScheduleMock.mockResolvedValue({ jobs: 1, square: 1, google: 1, failures: 0 });
  });

  afterEach(() => {
    delete process.env.CALENDAR_SYNC_CRON_SECRET;
  });

  it("requires the exact bearer secret before scheduled provider work runs", async () => {
    const missing = await postSchedule(new Request("https://bvrb3r.app/api/calendar-sync/scheduled", { method: "POST" }));
    const incorrect = await postSchedule(new Request("https://bvrb3r.app/api/calendar-sync/scheduled", {
      method: "POST",
      headers: { authorization: "Bearer incorrect" }
    }));
    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(processCalendarSyncScheduleMock).not.toHaveBeenCalled();

    const accepted = await postSchedule(new Request("https://bvrb3r.app/api/calendar-sync/scheduled", {
      method: "POST",
      headers: { authorization: "Bearer synthetic-calendar-cron-secret" }
    }));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ jobs: 1, square: 1, google: 1, failures: 0 });
    expect(processCalendarSyncScheduleMock).toHaveBeenCalledTimes(1);
  });

  it("rejects Apple device payloads carrying event titles before service code", async () => {
    const response = await postProvider(new Request("https://bvrb3r.app/api/calendar-sync/apple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ingest_busy",
        calendarIdHash: "a".repeat(64),
        calendarName: "Personal",
        blocks: [{
          externalIdHash: "b".repeat(64),
          startsAt: "2026-08-03T10:00:00.000Z",
          endsAt: "2026-08-03T11:00:00.000Z",
          title: "Private medical appointment"
        }]
      })
    }), { params: Promise.resolve({ provider: "apple" }) });
    expect(response.status).toBe(400);
    expect(ingestAppleBusyWindowsMock).not.toHaveBeenCalled();
  });

  it("accepts privacy-minimized Apple busy windows", async () => {
    ingestAppleBusyWindowsMock.mockResolvedValue({ acceptedBusyWindows: 1, ignoredLoopEvents: 0 });
    const response = await postProvider(new Request("https://bvrb3r.app/api/calendar-sync/apple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ingest_busy",
        calendarIdHash: "a".repeat(64),
        calendarName: "Personal",
        blocks: [{
          externalIdHash: "b".repeat(64),
          startsAt: "2026-08-03T10:00:00.000Z",
          endsAt: "2026-08-03T11:00:00.000Z"
        }]
      })
    }), { params: Promise.resolve({ provider: "apple" }) });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ acceptedBusyWindows: 1, ignoredLoopEvents: 0 });
    expect(ingestAppleBusyWindowsMock).toHaveBeenCalledWith(expect.objectContaining({
      calendarName: "Personal",
      blocks: [expect.not.objectContaining({ title: expect.anything() })]
    }));
  });

  it("returns server-derived Square mapping choices and validates the save payload", async () => {
    getSquareMappingOptionsForUserMock.mockResolvedValue({
      locations: [{ id: "2fe18a92-dd51-459b-8c6a-558fe9e122ea", label: "Main Shop" }],
      teamMembers: [{ id: "square-team-1", label: "Square staff · -team-1", appointmentCount: 3 }]
    });
    saveSquareMappingForUserMock.mockResolvedValue({ saved: true });

    const optionsResponse = await postProvider(new Request("https://bvrb3r.app/api/calendar-sync/square", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "square_mapping_options" })
    }), { params: Promise.resolve({ provider: "square" }) });
    expect(optionsResponse.status).toBe(200);
    expect(getSquareMappingOptionsForUserMock).toHaveBeenCalledWith(expect.objectContaining({ id: "profile-1" }));

    const invalidResponse = await postProvider(new Request("https://bvrb3r.app/api/calendar-sync/square", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "square_mapping_save",
        locationId: "browser-invented-location",
        teamMemberId: "square-team-1"
      })
    }), { params: Promise.resolve({ provider: "square" }) });
    expect(invalidResponse.status).toBe(400);
    expect(saveSquareMappingForUserMock).not.toHaveBeenCalled();

    const saveResponse = await postProvider(new Request("https://bvrb3r.app/api/calendar-sync/square", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "square_mapping_save",
        locationId: "2fe18a92-dd51-459b-8c6a-558fe9e122ea",
        teamMemberId: "square-team-1"
      })
    }), { params: Promise.resolve({ provider: "square" }) });
    expect(saveResponse.status).toBe(200);
    expect(saveSquareMappingForUserMock).toHaveBeenCalledWith(expect.objectContaining({
      locationId: "2fe18a92-dd51-459b-8c6a-558fe9e122ea",
      teamMemberId: "square-team-1"
    }));
  });
});
