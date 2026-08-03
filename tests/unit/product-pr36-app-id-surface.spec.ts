import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const page = source("app/id/page.tsx");
const screen = source("components/app-id/app-identity-screen.tsx");
const service = source("lib/app-id/service.server.ts");

describe("Product PR36 App ID surface", () => {
  it("uses one canonical /id route for the owner card and public scan resolution", () => {
    expect(page).toContain("resolveAppIdentityScan(token)");
    expect(page).toContain('getAuthorizedUser(["client_user", "barber_user", "shop_owner_user"])');
    expect(page.indexOf("if (token)")).toBeLessThan(page.indexOf("const user = await getAuthorizedUser"));
    expect(page).toContain("ProtectedSessionBoundary");
  });

  it("renders real QR, privacy, regeneration, and pause states", () => {
    expect(service).toContain("encodeKioskQr(scanUrl)");
    expect(service).toContain("verifyAppIdentityToken(token, secret, now)");
    expect(service).toContain("card.code_version !== payload.codeVersion");
    expect(service).toContain("if (card.paused_at)");
    expect(screen).toContain('data-app-id-qr={paused ? "paused" : "active"}');
    expect(screen).toContain("Regenerate code");
    expect(screen).toContain("Resume card");
    expect(screen).toContain("Pause card");
    expect(screen).toContain("every older signed scan dies immediately");
  });

  it("honestly gates wallet issuance unless a signed-pass issuer is configured", () => {
    expect(service).toContain("APP_ID_APPLE_WALLET_ISSUER_URL_TEMPLATE");
    expect(service).toContain("APP_ID_GOOGLE_WALLET_ISSUER_URL_TEMPLATE");
    expect(service).toContain('status: "setup_required"');
    expect(service).toContain("signed-pass issuer is not configured");
    expect(screen).toContain('provider.status === "paused" ? "dark" : "setup"');
    expect(screen).not.toContain("fake wallet");
  });

  it("keeps scan resolution public-safe", () => {
    expect(service).toContain('.select("full_name, public_username, profile_photo_url, created_at")');
    expect(service).toContain('.eq("role", role === "barber_user" ? "barber" : "shop_owner")');
    expect(service).not.toMatch(/\.select\([^\n]*(email|phone|payout|bank)/);
    expect(screen).toContain("Only public profile data was resolved");
    expect(screen).toContain("Phone, email, documents, and money stay private");
  });
});
