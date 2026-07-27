import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KIOSK_SESSION_COOKIE, KioskSessionError } from "@/lib/kiosk/session-service";
import { resetRateLimits } from "@/lib/kiosk/rate-limit";

const { startKioskDeviceSessionMock, completeKioskDeviceSessionMock } = vi.hoisted(() => ({
  startKioskDeviceSessionMock: vi.fn(),
  completeKioskDeviceSessionMock: vi.fn()
}));

vi.mock("@/lib/kiosk/session-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/kiosk/session-service")>("@/lib/kiosk/session-service");
  return {
    ...actual,
    startKioskDeviceSession: startKioskDeviceSessionMock,
    completeKioskDeviceSession: completeKioskDeviceSessionMock
  };
});

const { DELETE: deleteKioskSession, POST: postKioskSession } = await import("@/app/api/kiosk/session/route");

function sessionRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://bvrb3r.demo/api/kiosk/session", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.10", ...headers },
    body: JSON.stringify(body)
  });
}

describe("kiosk session route", () => {
  beforeEach(() => {
    startKioskDeviceSessionMock.mockReset();
    completeKioskDeviceSessionMock.mockReset();
    completeKioskDeviceSessionMock.mockResolvedValue(undefined);
    resetRateLimits();
  });

  it("starts a session and returns the token only as an httpOnly cookie", async () => {
    startKioskDeviceSessionMock.mockResolvedValue({
      token: "a".repeat(64),
      expiresAt: "2026-07-27T20:00:00.000Z",
      scope: "shop",
      targetReference: "loc-ybor"
    });

    const response = await postKioskSession(sessionRequest({ scope: "shop", targetReference: "loc-ybor" }));
    const body = await response.json();
    const cookie = response.cookies.get(KIOSK_SESSION_COOKIE);

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ ok: true, scope: "shop", targetReference: "loc-ybor" });
    expect(JSON.stringify(body)).not.toContain("a".repeat(64));
    expect(cookie?.value).toBe("a".repeat(64));
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.maxAge).toBe(12 * 60 * 60);
  });

  it("rejects an invalid payload before touching the session service", async () => {
    const response = await postKioskSession(sessionRequest({ scope: "franchise", targetReference: "loc-ybor" }));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("invalid_payload");
    expect(startKioskDeviceSessionMock).not.toHaveBeenCalled();
  });

  it("passes session-service refusals through with their status and code", async () => {
    startKioskDeviceSessionMock.mockRejectedValue(
      new KioskSessionError("Only this shop's owner or staff can start its kiosk.", 403, "not_authorized")
    );

    const response = await postKioskSession(sessionRequest({ scope: "shop", targetReference: "loc-ybor" }));

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("not_authorized");
    expect(response.cookies.get(KIOSK_SESSION_COOKIE)).toBeUndefined();
  });

  it("rate limits repeated session-start attempts from one device", async () => {
    startKioskDeviceSessionMock.mockRejectedValue(new KioskSessionError("Nope.", 403, "not_authorized"));

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const allowed = await postKioskSession(sessionRequest({ scope: "shop", targetReference: "loc-ybor" }));
      expect(allowed.status).toBe(403);
    }

    const limited = await postKioskSession(sessionRequest({ scope: "shop", targetReference: "loc-ybor" }));

    expect(limited.status).toBe(429);
    expect((await limited.json()).code).toBe("rate_limited");
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  it("ends the server session and clears the cookie on deactivate", async () => {
    const response = await deleteKioskSession(new NextRequest("https://bvrb3r.demo/api/kiosk/session", {
      method: "DELETE",
      headers: { cookie: `${KIOSK_SESSION_COOKIE}=${"b".repeat(64)}` }
    }));

    expect(response.status).toBe(200);
    expect(completeKioskDeviceSessionMock).toHaveBeenCalledWith("b".repeat(64));
    expect(response.cookies.get(KIOSK_SESSION_COOKIE)?.value).toBe("");
    expect(response.cookies.get(KIOSK_SESSION_COOKIE)?.maxAge).toBe(0);
  });

  it("still clears the device cookie when ending the server session fails", async () => {
    completeKioskDeviceSessionMock.mockRejectedValue(new Error("supabase down"));

    const response = await deleteKioskSession(new NextRequest("https://bvrb3r.demo/api/kiosk/session", {
      method: "DELETE",
      headers: { cookie: `${KIOSK_SESSION_COOKIE}=${"c".repeat(64)}` }
    }));

    expect(response.status).toBe(200);
    expect(response.cookies.get(KIOSK_SESSION_COOKIE)?.maxAge).toBe(0);
  });
});
