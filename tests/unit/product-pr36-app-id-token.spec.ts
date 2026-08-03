import { describe, expect, it } from "vitest";
import { buildAppIdentityScanActions } from "@/lib/app-id/catalog";
import { AppIdentityTokenError, signAppIdentityToken, verifyAppIdentityToken } from "@/lib/app-id/token.server";
import { encodeKioskQr } from "@/lib/kiosk/qr";

const secret = "pr36-test-signing-secret-with-more-than-32-characters";
const now = new Date("2026-08-03T12:00:00.000Z");
const payload = {
  cardIdentifier: "00000000-0000-4000-8000-000000000036",
  codeVersion: 7,
  expiresAt: Math.floor(new Date("2026-09-02T12:00:00.000Z").getTime() / 1000)
};

describe("Product PR36 signed App ID", () => {
  it("signs a compact, expiring payload and verifies it with constant-authority inputs", () => {
    const token = signAppIdentityToken(payload, secret);
    expect(token).not.toContain(payload.cardIdentifier);
    expect(verifyAppIdentityToken(token, secret, now)).toEqual(payload);

    const symbol = encodeKioskQr(`https://bvrb3r.app/id?scan=${encodeURIComponent(token)}`);
    expect(symbol).not.toBeNull();
    expect(symbol?.modules.flat().filter(Boolean).length).toBeGreaterThan(100);
  });

  it("rejects tampered, expired, and under-keyed codes", () => {
    const token = signAppIdentityToken(payload, secret);
    const replacement = token.endsWith("A") ? "B" : "A";
    expect(() => verifyAppIdentityToken(`${token.slice(0, -1)}${replacement}`, secret, now)).toThrow(AppIdentityTokenError);

    const expired = signAppIdentityToken({ ...payload, expiresAt: Math.floor(now.getTime() / 1000) }, secret);
    expect(() => verifyAppIdentityToken(expired, secret, now)).toThrowError(expect.objectContaining({ code: "expired" }));
    expect(() => signAppIdentityToken(payload, "too-short")).toThrowError(expect.objectContaining({ code: "configuration" }));
  });

  it("maps all four role-specific scan actions without exposing private data", () => {
    const client = buildAppIdentityScanActions("client_user", { username: "phil", barberId: null, shopId: null });
    const barber = buildAppIdentityScanActions("barber_user", { username: "phillip", barberId: "barber-1", shopId: null });
    const owner = buildAppIdentityScanActions("shop_owner_user", { username: "lounge", barberId: null, shopId: "shop-1" });

    expect(client.map((action) => action.title)).toEqual(["Follow & connect", "Check in", "Claim your visit", "Referral credit"]);
    expect(barber.map((action) => action.title)).toEqual(["Book this chair", "Follow the work", "Verify the license", "Join the waitlist"]);
    expect(owner.map((action) => action.title)).toEqual(["Walk in", "See the shop", "Join the team", "Verify the business"]);
    expect(JSON.stringify({ client, barber, owner })).not.toMatch(/phone|email|bank|payout/i);
    expect(client.at(-1)).toMatchObject({ href: null, availability: "requires_setup" });
  });
});
