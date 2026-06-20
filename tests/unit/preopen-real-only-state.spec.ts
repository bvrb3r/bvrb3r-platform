import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createEmptyMarketplaceState,
  getHaircutNowMatch,
  getMapDiscoveryMarkers,
  getPublicBarberProfileByUsername,
  searchMarketplace
} from "@/lib/marketplace/engine";

describe("pre-open real-only platform state", () => {
  it("keeps guest discovery empty when no real marketplace rows exist", () => {
    const state = createEmptyMarketplaceState();

    expect(searchMarketplace(state, {})).toEqual([]);
    expect(getMapDiscoveryMarkers(state, {})).toEqual([]);
    expect(getPublicBarberProfileByUsername(state, "wave")).toBeNull();
    expect(getHaircutNowMatch(state, "client-jordan", "loc-ybor")).toBeNull();
  });

  it("does not fabricate discovery cards from partial listing rows without canonical barber records", () => {
    const state = createEmptyMarketplaceState();
    state.barberProfiles.push({
      id: "profile-orphan",
      barberId: "barber-wave",
      username: "wave",
      photoAccent: "#7CFF00",
      yearsExperience: 6,
      headline: "Orphan demo profile",
      specialties: ["Fades"],
      badges: [],
      nextAvailableAt: "2026-04-15T10:00:00.000Z",
      serviceAreaLabel: "Tampa Bay",
      visibilityState: "public"
    });
    state.visibilities.push({
      barberId: "barber-wave",
      visibilityState: "public",
      acceptsInstantBookings: true
    });

    expect(searchMarketplace(state, {})).toEqual([]);
    expect(getPublicBarberProfileByUsername(state, "wave")).toBeNull();
  });

  it("returns empty provider state instead of demo rows when Supabase is not configured", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "demo");

    const { getMarketplaceProvider } = await import("@/lib/marketplace/provider");
    const { getLiveOperationsProvider } = await import("@/lib/operations/live-provider");
    const { getEngagementProvider } = await import("@/lib/engagement/provider");
    const { getMarketplaceActivationProvider } = await import("@/lib/marketplace/activation-provider");
    const { getNotificationDeliveryProvider } = await import("@/lib/engagement/delivery-provider");
    const { getMobileProvider } = await import("@/lib/mobile/provider");
    const { getTrustProvider } = await import("@/lib/trust/provider");

    const marketplace = await getMarketplaceProvider();
    const marketplaceRuntime = await marketplace.readRuntime();
    expect(marketplaceRuntime.state.barbers).toEqual([]);
    expect(marketplaceRuntime.state.locations).toEqual([]);
    expect(marketplaceRuntime.state.shops).toEqual([]);
    expect(marketplaceRuntime.state.reviews).toEqual([]);

    const liveOps = await getLiveOperationsProvider();
    const snapshot = await liveOps.readSnapshot({ role: "public" });
    expect(snapshot.appointments).toEqual([]);
    expect(snapshot.clients).toEqual([]);
    expect(snapshot.walkIns).toEqual([]);

    const engagement = await getEngagementProvider();
    const engagementState = await engagement.readState();
    expect(engagementState.loyaltyAccounts).toEqual([]);
    expect(engagementState.referralEvents).toEqual([]);
    expect(engagementState.notifications).toEqual([]);

    const activation = await getMarketplaceActivationProvider();
    const activationState = await activation.readState();
    expect(activationState.boostCampaigns).toEqual([]);
    expect(activationState.featuredPlacements).toEqual([]);
    expect(activationState.cityRollouts).toEqual([]);

    const deliveries = await getNotificationDeliveryProvider();
    expect(await deliveries.readDeliveries()).toEqual([]);
    expect(await deliveries.readAttempts()).toEqual([]);

    const mobile = await getMobileProvider();
    const mobileState = await mobile.readState();
    expect(mobileState.devices).toEqual([]);
    expect(mobileState.deliveryAttempts).toEqual([]);

    const trust = await getTrustProvider();
    const trustState = await trust.readState();
    expect(trustState.barberVerifications).toEqual([]);
    expect(trustState.shopVerifications).toEqual([]);

    vi.unstubAllEnvs();
    vi.resetModules();
  });


  it("blocks empty provider fallback when production Supabase truth is required", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "demo");
    vi.stubEnv("VERCEL_ENV", "production");

    const { getEngagementProvider } = await import("@/lib/engagement/provider");
    const { getNotificationDeliveryProvider } = await import("@/lib/engagement/delivery-provider");
    const { getMobileProvider } = await import("@/lib/mobile/provider");

    await expect(getEngagementProvider()).rejects.toThrow("Engagement provider requires connected Supabase truth in production");
    await expect(getNotificationDeliveryProvider()).rejects.toThrow("Notification delivery provider requires connected Supabase truth in production");
    await expect(getMobileProvider()).rejects.toThrow("Mobile provider requires connected Supabase truth in production");

    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("prevents customer-facing surfaces from importing demo business fixtures", () => {
    const root = process.cwd();
    const customerFacingFiles = [
      "app/(platform)/appointments/page.tsx",
      "app/(platform)/clients/page.tsx",
      "components/dashboard/dashboard-shell.tsx",
      "components/marketplace/discovery-workspace.tsx",
      "components/operations/manager-overview.tsx",
      "components/operations/team-workspace.tsx",
      "components/operations/owner-settings-workspace.tsx",
      "components/operations/staff-profile-workspace.tsx",
      "app/api/engagement/barber/summary/route.ts"
    ];

    for (const file of customerFacingFiles) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).not.toContain("@/lib/data/demo");
      expect(source).not.toContain("demoBarbers");
      expect(source).not.toContain("demoClients");
      expect(source).not.toContain("demoAppointments");
      expect(source).not.toContain("demoLocations");
      expect(source).not.toContain("shop-bvrb3r");
      expect(source).not.toContain("loc-ybor");
      expect(source).not.toContain("barber-wave");
    }
  });

  it("keeps canonical booking and operations production paths free of demo fixture imports", () => {
    const root = process.cwd();
    const productionCoreFiles = [
      "lib/booking/canonical-booking.ts",
      "lib/operations/live-provider.ts",
      "lib/operations/persistence.ts",
      "lib/operations/metrics.ts"
    ];

    for (const file of productionCoreFiles) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).not.toContain("@/lib/data/demo");
      expect(source).not.toContain("demoAppointments");
      expect(source).not.toContain("demoBarbers");
      expect(source).not.toContain("demoClients");
      expect(source).not.toContain("boothRentLedger");
    }

    const liveStateSource = readFileSync(join(root, "lib/operations/live-state.ts"), "utf8");
    expect(liveStateSource).toContain("if (snapshot.mode === \"supabase\")");
  });

  it("uses required event writers for audit-critical domain transitions", () => {
    const root = process.cwd();
    const auditCriticalFiles = [
      "lib/payments/service.ts",
      "lib/fintech/service.ts",
      "lib/platform-admin/verification-service.ts",
      "lib/trust/provider.ts",
      "lib/points/engine.ts"
    ];

    for (const file of auditCriticalFiles) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).toMatch(/recordRequiredPlatformEvent|recordRequiredPlatformEvents/);
    }
  });

  it("routes client loyalty and membership summaries through canonical points readers", () => {
    const root = process.cwd();
    const canonicalReaderFiles = [
      "app/api/client/membership/route.ts",
      "app/api/engagement/client/summary/route.ts",
      "lib/booking/platform-service.ts"
    ];

    for (const file of canonicalReaderFiles) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).toContain("readPointsBalanceForClientReference");
    }
  });
});
