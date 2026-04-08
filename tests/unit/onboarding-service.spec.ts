import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config/runtime")>("@/lib/config/runtime");
  return {
    ...actual,
    isSupabaseEnabled: () => false,
    isDemoMode: () => true
  };
});

import { resolveDemoUser } from "@/lib/auth/demo-auth";
import {
  getActivationStatusForUser,
  getOnboardingState,
  initializeUserRole,
  markOnboardingStepComplete,
  resolvePostAuthDestination
} from "@/lib/onboarding/service";
import { resetOnboardingStateStore } from "@/lib/onboarding/state";
import { getTrustState, resetTrustState, setTrustState } from "@/lib/trust/state";
import type { UserAccount } from "@/types/domain";

describe("onboarding service", () => {
  beforeEach(() => {
    resetOnboardingStateStore();
    resetTrustState();
  });

  it("initializes a new role and resumes at the first onboarding step", async () => {
    const client = resolveDemoUser("client@bvrb3r.demo");
    const pendingClient: UserAccount = {
      ...client,
      firstName: "Jordan",
      lastName: "Ellis",
      phone: "+18135550110",
      accountStatus: "profile_only",
      clientId: undefined,
      onboardingState: "awaiting_role_selection",
      emailVerified: true,
      phoneVerified: true
    };
    await initializeUserRole(pendingClient, "client");

    const payload = await getOnboardingState(pendingClient);

    expect(payload.selectedRole).toBe("client");
    expect(payload.nextPath).toBe("/onboarding/client/profile");
    expect(payload.lanes[0]?.currentStep).toBe("client_profile");
  });

  it("routes completed client onboarding to the client dashboard", async () => {
    const client = resolveDemoUser("client@bvrb3r.demo");
    const pendingClient: UserAccount = {
      ...client,
      firstName: "Jordan",
      lastName: "Ellis",
      phone: "+18135550110",
      accountStatus: "active",
      clientId: "client-jordan",
      onboardingState: "active",
      emailVerified: true,
      phoneVerified: true
    };

    await initializeUserRole(pendingClient, "client");
    await markOnboardingStepComplete(pendingClient, "client", "client_profile", {
      fullName: "Jordan Ellis",
      phone: "(813) 555-0100",
      city: "Tampa"
    });
    await markOnboardingStepComplete(pendingClient, "client", "client_preferences", {
      preferredServices: "Signature cut"
    });

    const destination = await resolvePostAuthDestination(pendingClient);
    const activation = await getActivationStatusForUser(pendingClient);

    expect(destination).toBe("/dashboard/client");
    expect(activation.lanes[0]?.activationState).toBe("active");
  });

  it("routes a verified fresh user with no selected lane to role-select", async () => {
    const freshUser: UserAccount = {
      id: "auth-fresh-user",
      role: "client",
      email: "fresh@bvrb3r.demo",
      password: "",
      name: "Fresh User",
      firstName: "Fresh",
      lastName: "User",
      title: "Client",
      phone: "+18135550100",
      locationIds: [],
      accountStatus: "profile_only",
      onboardingState: "awaiting_role_selection",
      emailVerified: true,
      phoneVerified: true
    };

    const destination = await resolvePostAuthDestination(freshUser);

    expect(destination).toBe("/role-select");
  });

  it("routes an existing barber with no subtype to the barber type step", async () => {
    const barber = resolveDemoUser("lux@bvrb3r.demo");
    const pendingBarber: UserAccount = {
      ...barber,
      firstName: "Lux",
      lastName: "Reed",
      phone: "+18135550111",
      accountStatus: "profile_only",
      primaryOnboardingRole: "barber",
      onboardingState: "role_selected",
      emailVerified: true,
      phoneVerified: true,
      barberSubtype: undefined,
      barberId: undefined
    };

    const destination = await resolvePostAuthDestination(pendingBarber);

    expect(destination).toBe("/onboarding/barber-type");
  });

  it("routes a completed barber lane with subtype to the barber dashboard", async () => {
    const barber = resolveDemoUser("lux@bvrb3r.demo");
    const activeBarber: UserAccount = {
      ...barber,
      firstName: "Lux",
      lastName: "Reed",
      phone: "+18135550111",
      accountStatus: "active",
      primaryOnboardingRole: "barber",
      onboardingState: "active",
      emailVerified: true,
      phoneVerified: true,
      barberSubtype: "freelance",
      barberId: "barber-lux"
    };

    const destination = await resolvePostAuthDestination(activeBarber);

    expect(destination).toBe("/dashboard/barber");
  });

  it("routes owner and shop_owner lanes safely into the owner dashboard", async () => {
    const owner = resolveDemoUser("owner@bvrb3r.demo");
    const activeOwner: UserAccount = {
      ...owner,
      firstName: "Maya",
      lastName: "Lane",
      phone: "+18135550112",
      accountStatus: "active",
      primaryOnboardingRole: "shop_owner",
      onboardingState: "active",
      emailVerified: true,
      phoneVerified: true,
      ownedShopId: "shop-maya"
    };

    const destination = await resolvePostAuthDestination(activeOwner);

    expect(destination).toBe("/dashboard/owner");
  });

  it("keeps onboarding verification payloads subject-safe", async () => {
    const barber = resolveDemoUser("fade@bvrb3r.demo");
    const pendingBarber: UserAccount = {
      ...barber,
      firstName: "Fade",
      lastName: "Garner",
      phone: "+18135550113",
      accountStatus: "profile_only",
      emailVerified: true,
      phoneVerified: true,
      onboardingState: "awaiting_role_selection"
    };
    const current = getTrustState();

    setTrustState({
      ...current,
      verificationProviderLinks: [
        ...(current.verificationProviderLinks ?? []),
        {
          id: "vprovider-safe-check",
          verificationProfileId: "vprof-barber-fade",
          userId: barber.id,
          provider: "stripe",
          providerSubject: "connect_account",
          providerReferenceId: "acct_secret_reference",
          providerStatus: "requirements_due",
          metadata: { disabledReason: "requirements.past_due" },
          createdAt: "2026-04-01T10:00:00.000Z",
          updatedAt: "2026-04-01T10:00:00.000Z"
        }
      ]
    });

    await initializeUserRole(pendingBarber, "barber");
    const payload = await getOnboardingState(pendingBarber);

    expect(payload.lanes[0]?.verificationProfile?.providerStatuses[0]).not.toHaveProperty("providerReferenceId");
    expect(payload.lanes[0]?.verificationProfile?.providerStatuses[0]).not.toHaveProperty("metadata");
  });

  it("blocks an active manager from launching the owner onboarding lane", async () => {
    const manager: UserAccount = { ...resolveDemoUser("manager@bvrb3r.demo"), accountStatus: "active" };

    await expect(
      initializeUserRole(manager, "shop_owner")
    ).rejects.toThrow("onboarding_role_forbidden");
  });

  it("keeps a profile-only user inside the lane they already selected", async () => {
    const client = resolveDemoUser("client@bvrb3r.demo");
    const pendingClient: UserAccount = { ...client, accountStatus: "profile_only", clientId: undefined };

    await initializeUserRole(pendingClient, "client");

    await expect(
      markOnboardingStepComplete(pendingClient, "shop_owner", "owner_shop", { shopName: "Cross-lane test" })
    ).rejects.toThrow("onboarding_role_mismatch");
  });
});
