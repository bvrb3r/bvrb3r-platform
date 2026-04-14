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

    const payload = await getOnboardingState({
      ...pendingClient,
      primaryOnboardingRole: "client"
    });

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

    const canonicalClient = {
      ...pendingClient,
      primaryOnboardingRole: "client" as const
    };
    const destination = await resolvePostAuthDestination(canonicalClient);
    const activation = await getActivationStatusForUser(canonicalClient);

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
      canonicalFullName: "Fresh User",
      title: "Client",
      phone: "+18135550100",
      locationIds: [],
      accountStatus: "profile_only",
      onboardingState: "awaiting_contact_verification",
      emailVerified: true,
      phoneVerified: true
    };

    const destination = await resolvePostAuthDestination(freshUser);

    expect(destination).toBe("/role-select");
  });

  it("keeps a primary-role-null user on role-select even when stale lane rows exist", async () => {
    const staleClient: UserAccount = {
      ...resolveDemoUser("client@bvrb3r.demo"),
      id: "fresh-with-stale-lane-row",
      role: "client",
      firstName: "Fresh",
      lastName: "Stale",
      canonicalFullName: "Fresh Stale",
      phone: "+18135550140",
      accountStatus: "active",
      primaryOnboardingRole: undefined,
      onboardingState: "active",
      emailVerified: true,
      phoneVerified: true,
      clientId: "client-stale-row"
    };

    await initializeUserRole(staleClient, "client");

    const destination = await resolvePostAuthDestination(staleClient);

    expect(destination).toBe("/role-select");
  });

  it("routes a saved client lane directly to the client dashboard", async () => {
    const destination = await resolvePostAuthDestination({
      ...resolveDemoUser("client@bvrb3r.demo"),
      canonicalFullName: "Saved Client",
      phone: "+18135550141",
      accountStatus: "active",
      primaryOnboardingRole: "client",
      onboardingState: "active",
      emailVerified: true,
      phoneVerified: true,
      clientId: "client-saved"
    });

    expect(destination).toBe("/dashboard/client");
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
    const manager: UserAccount = {
      ...resolveDemoUser("manager@bvrb3r.demo"),
      canonicalFullName: "Manager User",
      phone: "+18135550135",
      accountStatus: "active",
      emailVerified: true,
      phoneVerified: true
    };

    await expect(
      initializeUserRole(manager, "shop_owner")
    ).rejects.toThrow("ACTIVE_LANE_LOCKED");
  });

  it("allows a verified user with stale client runtime role to launch the barber lane", async () => {
    const client = resolveDemoUser("client@bvrb3r.demo");
    const staleClient: UserAccount = {
      ...client,
      id: "stale-client-runtime",
      role: "client",
      firstName: "Stale",
      lastName: "Runtime",
      canonicalFullName: "Stale Runtime",
      phone: "+18135550133",
      accountStatus: "profile_only",
      primaryOnboardingRole: undefined,
      onboardingState: "awaiting_role_selection",
      emailVerified: true,
      phoneVerified: true,
      clientId: "client-stale"
    };

    await initializeUserRole(staleClient, "client");
    const result = await initializeUserRole(staleClient, "barber");
    const payload = await getOnboardingState({
      ...staleClient,
      primaryOnboardingRole: "barber"
    });

    expect(result.state.role).toBe("barber");
    expect(result.state.status).toBe("in_progress");
    expect(result.state.profileData.barberSubtype).toBeUndefined();
    expect(payload.nextPath).toBe("/onboarding/barber-type");
  });

  it("allows a verified user with stale client runtime role to launch the owner lane", async () => {
    const client = resolveDemoUser("client@bvrb3r.demo");
    const staleClient: UserAccount = {
      ...client,
      id: "stale-owner-runtime",
      role: "client",
      firstName: "Owner",
      lastName: "Runtime",
      canonicalFullName: "Owner Runtime",
      phone: "+18135550134",
      accountStatus: "profile_only",
      primaryOnboardingRole: undefined,
      onboardingState: "awaiting_role_selection",
      emailVerified: true,
      phoneVerified: true,
      clientId: "client-stale-owner"
    };

    await initializeUserRole(staleClient, "client");
    const result = await initializeUserRole(staleClient, "shop_owner", {
      shopName: "Owner Runtime Shop"
    });

    expect(result.state.role).toBe("shop_owner");
    expect(result.state.status).toBe("in_progress");
    expect(result.state.profileData.shopName).toBe("Owner Runtime Shop");
  });

  it("allows a contact-complete user with active stale client state and no official lane to choose barber", async () => {
    const client = resolveDemoUser("client@bvrb3r.demo");
    const staleClient: UserAccount = {
      ...client,
      id: "active-stale-client-runtime",
      role: "client",
      firstName: "Active",
      lastName: "Stale",
      canonicalFullName: "Active Stale",
      phone: "+18135550139",
      accountStatus: "active",
      primaryOnboardingRole: undefined,
      onboardingState: "active",
      emailVerified: true,
      phoneVerified: true,
      clientId: "client-active-stale"
    };

    await initializeUserRole(staleClient, "client");
    const result = await initializeUserRole(staleClient, "barber");

    expect(result.state.role).toBe("barber");
    expect(result.state.status).toBe("in_progress");
  });

  it("recovers a stale incomplete official client lane when a verified user chooses barber", async () => {
    const client = resolveDemoUser("client@bvrb3r.demo");
    const staleOfficialClient: UserAccount = {
      ...client,
      id: "stale-official-client-barber",
      role: "client",
      firstName: "Stale",
      lastName: "Official",
      canonicalFullName: "Stale Official",
      phone: "+18135550137",
      accountStatus: "profile_only",
      primaryOnboardingRole: "client",
      onboardingState: "role_selected",
      emailVerified: true,
      phoneVerified: true,
      clientId: "client-stale-official"
    };

    await initializeUserRole(staleOfficialClient, "client");
    const result = await initializeUserRole(staleOfficialClient, "barber");
    const payload = await getOnboardingState({
      ...staleOfficialClient,
      primaryOnboardingRole: "barber"
    });

    expect(result.state.role).toBe("barber");
    expect(result.state.status).toBe("in_progress");
    expect(payload.nextPath).toBe("/onboarding/barber-type");
  });

  it("recovers a stale incomplete official client lane when a verified user chooses shop owner", async () => {
    const client = resolveDemoUser("client@bvrb3r.demo");
    const staleOfficialClient: UserAccount = {
      ...client,
      id: "stale-official-client-owner",
      role: "client",
      firstName: "Stale",
      lastName: "Owner",
      canonicalFullName: "Stale Owner",
      phone: "+18135550138",
      accountStatus: "profile_only",
      primaryOnboardingRole: "client",
      onboardingState: "role_selected",
      emailVerified: true,
      phoneVerified: true,
      clientId: "client-stale-owner-official"
    };

    await initializeUserRole(staleOfficialClient, "client");
    const result = await initializeUserRole(staleOfficialClient, "shop_owner", {
      shopName: "Recovered Owner Shop"
    });

    expect(result.state.role).toBe("shop_owner");
    expect(result.state.status).toBe("in_progress");
    expect(result.state.profileData.shopName).toBe("Recovered Owner Shop");
  });

  it("keeps an active completed user inside the lane they already selected", async () => {
    const client = resolveDemoUser("client@bvrb3r.demo");
    const activeClient: UserAccount = {
      ...client,
      canonicalFullName: "Active Client",
      phone: "+18135550136",
      accountStatus: "active",
      primaryOnboardingRole: "client",
      onboardingState: "active",
      emailVerified: true,
      phoneVerified: true,
      clientId: "client-active"
    };

    await initializeUserRole(activeClient, "client");

    await expect(
      markOnboardingStepComplete(activeClient, "shop_owner", "owner_shop", { shopName: "Cross-lane test" })
    ).rejects.toThrow("ACTIVE_LANE_LOCKED");
  });
});
