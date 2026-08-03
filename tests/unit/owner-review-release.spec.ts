import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isOwnerReviewMode } from "@/lib/config/owner-review";

describe("owner-review production release", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults Vercel production to owner review unless explicitly opened", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("BVRB3R_OWNER_REVIEW_MODE", "");
    expect(isOwnerReviewMode()).toBe(true);

    vi.stubEnv("BVRB3R_OWNER_REVIEW_MODE", "false");
    expect(isOwnerReviewMode()).toBe(false);
  });

  it("blocks signup and makes owner-review production non-indexable", () => {
    const signupPage = readFileSync("app/(auth)/signup/page.tsx", "utf8");
    const layout = readFileSync("app/layout.tsx", "utf8");
    const home = readFileSync("app/page.tsx", "utf8");

    expect(signupPage).toContain('redirect("/login?owner_review=1")');
    expect(layout).toContain("robots: isOwnerReviewMode()");
    expect(layout).toContain("noimageindex: true");
    expect(home).toContain("signupEnabled={!isOwnerReviewMode()}");
  });
});
