import { describe, expect, it } from "vitest";
import { buildDeepLinkPayload, buildDefaultDeepLinks, normalizeAppRoute } from "@/lib/mobile/links";

describe("mobile links", () => {
  it("builds deep-link payloads for app and web routing", () => {
    const payload = buildDeepLinkPayload("/booking/new?barberId=barber-wave", "Book Wave");

    expect(payload.route).toBe("/booking/new?barberId=barber-wave");
    expect(payload.webUrl).toContain("/booking/new?barberId=barber-wave");
    expect(payload.appUrl).toContain("bvrb3r://open?href=");
    expect(payload.webProtocolUrl).toContain("web+bvrb3r://open?href=");
    expect(payload.universalUrl).toContain("/booking/new?barberId=barber-wave");
  });

  it("returns role-specific deep links for client and owner flows", () => {
    const clientLinks = buildDefaultDeepLinks("client");
    const ownerLinks = buildDefaultDeepLinks("owner");

    expect(clientLinks.map((link) => link.route)).toContain("/referrals");
    expect(clientLinks.map((link) => link.route)).toContain("/dashboard/client");
    expect(ownerLinks.map((link) => link.route)).toContain("/dashboard/owner");
    expect(ownerLinks.map((link) => link.route)).toContain("/leaderboards");
  });

  it("normalizes unsafe external routes back to root", () => {
    expect(normalizeAppRoute("https://malicious.example/steal")).toBe("/");
    expect(normalizeAppRoute("/api/secrets")).toBe("/");
  });
});
