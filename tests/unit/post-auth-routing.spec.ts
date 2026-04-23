import { beforeEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_PLATFORM_ADMIN_EMAIL } from "@/lib/auth/demo-auth";
import type { UserAccount } from "@/types/domain";

const {
  createSupabaseAdminClientMock,
  getVerificationMePayloadMock
} = vi.hoisted(() => ({
  createSupabaseAdminClientMock: vi.fn(),
  getVerificationMePayloadMock: vi.fn()
}));

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return {
    ...actual,
    isSupabaseEnabled: () => true,
    isDemoMode: () => false
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock
}));

vi.mock("@/lib/trust/verification-service", () => ({
  getVerificationMePayload: getVerificationMePayloadMock
}));

import { resolvePostAuthDestination, resolvePostAuthRecoveryDestination } from "@/lib/onboarding/service";

function buildUser(overrides: Partial<UserAccount> = {}): UserAccount {
  return {
    id: "auth-post-auth-user",
    role: "client",
    email: "post-auth@bvrb3r.app",
    password: "",
    name: "Post Auth User",
    canonicalFullName: "Post Auth User",
    title: "Client",
    phone: "+18135550155",
    locationIds: [],
    accountStatus: "active",
    emailVerified: true,
    phoneVerified: true,
    ...overrides
  };
}

function createEmptyOnboardingClient() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn()
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockResolvedValue({
    data: [],
    error: null
  });

  return {
    from: vi.fn((table: string) => {
      expect(table).toBe("user_onboarding_states");
      return query;
    })
  };
}

describe("post-auth routing", () => {
  beforeEach(() => {
    createSupabaseAdminClientMock.mockReset();
    getVerificationMePayloadMock.mockReset();
    getVerificationMePayloadMock.mockResolvedValue({
      profiles: [],
      warnings: []
    });
  });

  it("routes the platform admin straight to /architect", async () => {
    const destination = await resolvePostAuthDestination(buildUser({
      role: "platform_admin",
      email: CANONICAL_PLATFORM_ADMIN_EMAIL,
      accountStatus: "active",
      primaryOnboardingRole: "platform_admin"
    }));

    expect(destination).toBe("/architect");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("routes incomplete contact states to /verify-contact", async () => {
    const destination = await resolvePostAuthDestination(buildUser({
      phoneVerified: false
    }));

    expect(destination).toBe("/verify-contact");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("routes canonical client roles to the client dashboard without reading onboarding state tables", async () => {
    const destination = await resolvePostAuthDestination(buildUser({
      role: "client",
      primaryOnboardingRole: "client",
      clientId: "client-phillip"
    }));

    expect(destination).toBe("/dashboard/client");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("routes canonical barber roles to the barber dashboard without reading onboarding state tables", async () => {
    const destination = await resolvePostAuthDestination(buildUser({
      role: "booth_rent_barber",
      primaryOnboardingRole: "barber",
      barberId: "barber-phillip"
    }));

    expect(destination).toBe("/dashboard/barber");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("routes canonical owner roles to the owner dashboard without reading onboarding state tables", async () => {
    const destination = await resolvePostAuthDestination(buildUser({
      role: "owner",
      primaryOnboardingRole: "shop_owner",
      ownedShopId: "shop-phillip"
    }));

    expect(destination).toBe("/dashboard/owner");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("routes selected lanes with missing optional linked rows into safe setup paths instead of crashing", async () => {
    createSupabaseAdminClientMock.mockReturnValue(createEmptyOnboardingClient());

    const destination = await resolvePostAuthDestination(buildUser({
      role: "booth_rent_barber",
      primaryOnboardingRole: "barber",
      onboardingState: "role_selected",
      barberId: undefined
    }));

    expect(destination).toBe("/onboarding/barber/profile");
    expect(createSupabaseAdminClientMock).toHaveBeenCalledTimes(1);
  });

  it("routes legacy users with no usable canonical role truth to /role-select", async () => {
    const destination = await resolvePostAuthDestination(buildUser({
      primaryOnboardingRole: undefined,
      clientId: undefined,
      barberId: undefined,
      ownedShopId: undefined
    }));

    expect(destination).toBe("/role-select");
    expect(createSupabaseAdminClientMock).not.toHaveBeenCalled();
  });

  it("keeps the recovery destination deterministic for partial onboarding states", () => {
    const destination = resolvePostAuthRecoveryDestination(buildUser({
      role: "owner",
      primaryOnboardingRole: "shop_owner",
      onboardingState: "role_selected",
      ownedShopId: undefined
    }));

    expect(destination).toBe("/onboarding/owner/shop");
  });
});
