import { describe, expect, it } from "vitest";
import { buildNativeBootstrapSummary } from "@/lib/mobile/native";

describe("native bootstrap", () => {
  it("returns launch metadata and start links for a role", () => {
    const summary = buildNativeBootstrapSummary("owner");

    expect(summary.appName).toBe("BVRB3R Platform");
    expect(summary.scheme).toBe("bvrb3r");
    expect(summary.startLinks.some((link) => link.route === "/dashboard/owner")).toBe(true);
    expect(summary.tokenBridge.registrationApi).toBe("/api/mobile/native/tokens");
    expect(summary.deliveryProviders).toHaveProperty("webPushConfigured");
    expect(summary.releaseCandidate.certificationDocs).toContain("/RELEASE_CANDIDATE_CERTIFICATION.md");
    expect(summary.launchAssets.some((asset) => asset.path === "/.well-known/assetlinks.json")).toBe(true);
    expect(summary.launchAssets.some((asset) => asset.path === "/apple-app-site-association")).toBe(true);
  });
});
