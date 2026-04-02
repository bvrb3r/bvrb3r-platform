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
    await initializeUserRole({ ...client, accountStatus: "profile_only", clientId: undefined }, "client");

    const payload = await getOnboardingState({ ...client, accountStatus: "profile_only", clientId: undefined });

    expect(payload.selectedRole).toBe("client");
    expect(payload.nextPath).toBe("/onboarding/client/profile");
    expect(payload.lanes[0]?.currentStep).toBe("client_profile");
  });

  it("routes completed client onboarding to the client dashboard", async () => {
    const client = resolveDemoUser("client@bvrb3r.demo");
    const pendingClient: UserAccount = { ...client, accountStatus: "profile_only", clientId: undefined };

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

  it("routes a completed barber onboarding lane to activation until verification is live", async () => {
    const barber = resolveDemoUser("lux@bvrb3r.demo");
    const pendingBarber = { ...barber, accountStatus: "profile_only" as const };

    await initializeUserRole(pendingBarber, "barber");
    await markOnboardingStepComplete(pendingBarber, "barber", "barber_profile", {
      fullName: barber.name,
      phone: "(813) 555-0100",
      city: "Tampa",
      professionalType: "Barber",
      yearsExperience: "7",
      bio: "Precision barber with premium repeat clients.",
      compensationModel: "booth_rent"
    });
    await markOnboardingStepComplete(pendingBarber, "barber", "barber_services", {
      primaryServices: "Cuts",
      startingPrice: "45",
      averageDuration: "45"
    });
    await markOnboardingStepComplete(pendingBarber, "barber", "barber_availability", {
      weeklySchedule: "Tue-Sat 9a-6p",
      acceptsSameDay: true,
      serviceMode: "In-shop"
    });
    await markOnboardingStepComplete(pendingBarber, "barber", "barber_verification", {});

    const destination = await resolvePostAuthDestination(pendingBarber);
    const activation = await getActivationStatusForUser(pendingBarber);

    expect(destination).toBe("/activation-status");
    expect(activation.lanes[0]?.activationState).toBe("verification");
  });

  it("keeps onboarding verification payloads subject-safe", async () => {
    const barber = resolveDemoUser("fade@bvrb3r.demo");
    const pendingBarber = { ...barber, accountStatus: "profile_only" as const };
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
