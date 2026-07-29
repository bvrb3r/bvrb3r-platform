import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assertKioskLaunchReadyMock,
  assertKioskDeviceSessionMock,
  searchKioskAppointmentsMock,
  checkInKioskAppointmentMock,
  issueClientBridgeInvitationMock,
  getClientBridgeClaimMock,
  claimClientBridgeHistoryMock,
  declineClientBridgeInvitationMock,
  getCurrentUserFromServerMock,
  rejoinPublicQueueMock
} = vi.hoisted(() => ({
  assertKioskLaunchReadyMock: vi.fn(),
  assertKioskDeviceSessionMock: vi.fn(),
  searchKioskAppointmentsMock: vi.fn(),
  checkInKioskAppointmentMock: vi.fn(),
  issueClientBridgeInvitationMock: vi.fn(),
  getClientBridgeClaimMock: vi.fn(),
  claimClientBridgeHistoryMock: vi.fn(),
  declineClientBridgeInvitationMock: vi.fn(),
  getCurrentUserFromServerMock: vi.fn(),
  rejoinPublicQueueMock: vi.fn()
}));

vi.mock("@/lib/kiosk/launch-gate", () => ({
  assertKioskLaunchReady: assertKioskLaunchReadyMock
}));

vi.mock("@/lib/kiosk/rate-limit", () => ({
  clientKeyFromRequest: () => "test-kiosk",
  consumeRateLimit: () => ({ allowed: true, retryAfterSeconds: 0 })
}));

vi.mock("@/lib/kiosk/session-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/kiosk/session-service")>();
  return {
    ...original,
    assertKioskDeviceSession: assertKioskDeviceSessionMock,
    readKioskSessionToken: () => "signed-kiosk-session"
  };
});

vi.mock("@/lib/clientbridge/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/clientbridge/service")>();
  return {
    ...original,
    searchKioskAppointments: searchKioskAppointmentsMock,
    checkInKioskAppointment: checkInKioskAppointmentMock,
    issueClientBridgeInvitation: issueClientBridgeInvitationMock,
    getClientBridgeClaim: getClientBridgeClaimMock,
    claimClientBridgeHistory: claimClientBridgeHistoryMock,
    declineClientBridgeInvitation: declineClientBridgeInvitationMock
  };
});

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserFromServer: getCurrentUserFromServerMock
}));

vi.mock("@/lib/rent/service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/rent/service")>();
  return {
    ...original,
    rejoinPublicQueue: rejoinPublicQueueMock
  };
});

import { POST as searchAppointments } from "@/app/api/kiosk/[shopId]/appointments/search/route";
import { POST as checkInAppointment } from "@/app/api/kiosk/[shopId]/appointments/check-in/route";
import { POST as inviteClientBridge } from "@/app/api/kiosk/[shopId]/clientbridge/route";
import {
  DELETE as declineClaim,
  GET as getClaim,
  POST as claimHistory
} from "@/app/api/clientbridge/claim/[token]/route";
import { POST as rejoinQueue } from "@/app/api/queue/status/[token]/rejoin/route";

const APPOINTMENT_ID = "11111111-1111-4111-8111-111111111111";
const WAITLIST_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "a".repeat(64);

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("Product PR23 ClientBridge routes", () => {
  beforeEach(() => {
    for (const mock of [
      assertKioskLaunchReadyMock,
      assertKioskDeviceSessionMock,
      searchKioskAppointmentsMock,
      checkInKioskAppointmentMock,
      issueClientBridgeInvitationMock,
      getClientBridgeClaimMock,
      claimClientBridgeHistoryMock,
      declineClientBridgeInvitationMock,
      getCurrentUserFromServerMock,
      rejoinPublicQueueMock
    ]) {
      mock.mockReset();
    }
    assertKioskLaunchReadyMock.mockResolvedValue(undefined);
    assertKioskDeviceSessionMock.mockResolvedValue(undefined);
  });

  it("requires appointment time whenever kiosk identity uses a name", async () => {
    const response = await searchAppointments(
      jsonRequest("https://example.test/api/kiosk/loc-ybor/appointments/search", {
        kind: "name_time",
        value: "Jordan Ellis"
      }),
      { params: Promise.resolve({ shopId: "loc-ybor" }) }
    );

    expect(response.status).toBe(400);
    expect(searchKioskAppointmentsMock).not.toHaveBeenCalled();
  });

  it("searches through a launch-ready, device-bound kiosk scope", async () => {
    searchKioskAppointmentsMock.mockResolvedValue({
      results: [{
        id: APPOINTMENT_ID,
        sourceProvider: "square",
        sourceBadge: "SQUARE",
        clientLabel: "J••• E.",
        externalFinancialDataPrivate: true
      }]
    });

    const response = await searchAppointments(
      jsonRequest("https://example.test/api/kiosk/loc-ybor/appointments/search", {
        kind: "code",
        value: "BVR123"
      }),
      { params: Promise.resolve({ shopId: "loc-ybor" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(assertKioskDeviceSessionMock).toHaveBeenCalledWith(expect.objectContaining({
      scope: "shop",
      targetReference: "loc-ybor",
      token: "signed-kiosk-session"
    }));
    expect(body.results[0]).toMatchObject({
      sourceBadge: "SQUARE",
      externalFinancialDataPrivate: true
    });
  });

  it("returns 201 for a new canonical check-in and 200 for an idempotent replay", async () => {
    checkInKioskAppointmentMock
      .mockResolvedValueOnce({
        duplicate: false,
        queue: { id: WAITLIST_ID },
        sourceProvider: "square",
        paymentOwner: "external:square"
      })
      .mockResolvedValueOnce({
        duplicate: true,
        queue: { id: WAITLIST_ID },
        sourceProvider: "square",
        paymentOwner: "external:square"
      });
    const body = {
      appointmentId: APPOINTMENT_ID,
      sourceProvider: "square",
      idempotencyKey: "square-checkin-jordan",
      operationalSmsConsent: true,
      contactPhone: "8135550199"
    };
    const context = { params: Promise.resolve({ shopId: "loc-ybor" }) };

    const created = await checkInAppointment(
      jsonRequest("https://example.test/api/kiosk/loc-ybor/appointments/check-in", body),
      context
    );
    const replayed = await checkInAppointment(
      jsonRequest("https://example.test/api/kiosk/loc-ybor/appointments/check-in", body),
      { params: Promise.resolve({ shopId: "loc-ybor" }) }
    );

    expect(created.status).toBe(201);
    expect(replayed.status).toBe(200);
    expect(checkInKioskAppointmentMock).toHaveBeenCalledWith(expect.objectContaining({
      shopId: "loc-ybor",
      sourceProvider: "square",
      idempotencyKey: "square-checkin-jordan",
      operationalSmsConsent: true
    }));
  });

  it("keeps ClientBridge optional and binds an accepted invitation to the kiosk shop", async () => {
    const rejected = await inviteClientBridge(
      jsonRequest("https://example.test/api/kiosk/loc-ybor/clientbridge", {
        waitlistEntryId: WAITLIST_ID,
        contactChannel: "sms",
        contactValue: "8135550199",
        consentGranted: false
      }),
      { params: Promise.resolve({ shopId: "loc-ybor" }) }
    );
    expect(rejected.status).toBe(400);
    expect(issueClientBridgeInvitationMock).not.toHaveBeenCalled();

    issueClientBridgeInvitationMock.mockResolvedValue({
      invitationId: "invite-1",
      status: "queued",
      expiresAt: "2026-07-31T12:00:00.000Z",
      suppressionReason: null
    });
    const accepted = await inviteClientBridge(
      jsonRequest("https://example.test/api/kiosk/loc-ybor/clientbridge", {
        waitlistEntryId: WAITLIST_ID,
        contactChannel: "sms",
        contactValue: "8135550199",
        consentGranted: true
      }),
      { params: Promise.resolve({ shopId: "loc-ybor" }) }
    );

    expect(accepted.status).toBe(202);
    expect(issueClientBridgeInvitationMock).toHaveBeenCalledWith(expect.objectContaining({
      shopId: "loc-ybor",
      waitlistEntryId: WAITLIST_ID,
      consentGranted: true
    }));
  });

  it("keeps activation reads private and requires a signed-in account to claim", async () => {
    getClientBridgeClaimMock.mockResolvedValue({
      invitationId: "invite-1",
      state: "claimable",
      maskedContact: "•••• 0199"
    });
    const read = await getClaim(
      new Request(`https://example.test/api/clientbridge/claim/${TOKEN}`),
      { params: Promise.resolve({ token: TOKEN }) }
    );
    expect(read.status).toBe(200);
    expect(read.headers.get("Cache-Control")).toBe("private, no-store");
    expect(read.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");

    getCurrentUserFromServerMock.mockResolvedValue({
      authenticated: false,
      user: { id: "guest-user" }
    });
    const unsigned = await claimHistory(
      new Request(`https://example.test/api/clientbridge/claim/${TOKEN}`, { method: "POST" }),
      { params: Promise.resolve({ token: TOKEN }) }
    );
    expect(unsigned.status).toBe(401);
    expect(claimClientBridgeHistoryMock).not.toHaveBeenCalled();
  });

  it("claims history once and preserves an explicit decline", async () => {
    const user = { id: "profile-client", role: "client_user", email: "client@example.test" };
    getCurrentUserFromServerMock.mockResolvedValue({ authenticated: true, user });
    claimClientBridgeHistoryMock.mockResolvedValue({
      status: "claimed",
      clientId: "client-1",
      appointmentsMerged: 1,
      queueEntriesMerged: 2
    });
    const claimed = await claimHistory(
      new Request(`https://example.test/api/clientbridge/claim/${TOKEN}`, { method: "POST" }),
      { params: Promise.resolve({ token: TOKEN }) }
    );
    expect(claimed.status).toBe(200);
    expect(claimClientBridgeHistoryMock).toHaveBeenCalledWith(TOKEN, user);

    declineClientBridgeInvitationMock.mockResolvedValue({ status: "declined" });
    const declined = await declineClaim(
      new Request(`https://example.test/api/clientbridge/claim/${TOKEN}`, { method: "DELETE" }),
      { params: Promise.resolve({ token: TOKEN }) }
    );
    expect(declined.status).toBe(200);
    expect(await declined.json()).toEqual({ status: "declined" });
  });

  it("returns distinct status codes for a new queue rejoin and its replay", async () => {
    rejoinPublicQueueMock
      .mockResolvedValueOnce({ waitlistEntryId: WAITLIST_ID, publicToken: TOKEN, duplicate: false })
      .mockResolvedValueOnce({ waitlistEntryId: WAITLIST_ID, publicToken: TOKEN, duplicate: true });
    const requestBody = { idempotencyKey: "rejoin-jordan-ellis" };

    const created = await rejoinQueue(
      jsonRequest(`https://example.test/api/queue/status/${TOKEN}/rejoin`, requestBody),
      { params: Promise.resolve({ token: TOKEN }) }
    );
    const replayed = await rejoinQueue(
      jsonRequest(`https://example.test/api/queue/status/${TOKEN}/rejoin`, requestBody),
      { params: Promise.resolve({ token: TOKEN }) }
    );

    expect(created.status).toBe(201);
    expect(replayed.status).toBe(200);
    expect(created.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
