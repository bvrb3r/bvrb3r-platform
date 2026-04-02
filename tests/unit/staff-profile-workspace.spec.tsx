import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutationMock,
  useBarberTrustSummaryMock,
  useBarberFintechReadinessQueryMock
} = vi.hoisted(() => ({
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useMutateProfileMediaMutationMock: vi.fn(),
  useBarberTrustSummaryMock: vi.fn(),
  useBarberFintechReadinessQueryMock: vi.fn()
}));

vi.mock("@/lib/profile/client", () => ({
  useProfileMediaWorkspaceQuery: useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutation: useMutateProfileMediaMutationMock
}));

vi.mock("@/lib/trust/client", () => ({
  useBarberTrustSummary: useBarberTrustSummaryMock
}));

vi.mock("@/lib/fintech/client", () => ({
  useBarberFintechReadinessQuery: useBarberFintechReadinessQueryMock
}));

vi.mock("@/lib/storage/media", () => ({
  uploadMediaAsset: vi.fn()
}));

import { StaffProfileWorkspace } from "@/components/operations/staff-profile-workspace";

describe("staff profile workspace", () => {
  beforeEach(() => {
    useProfileMediaWorkspaceQueryMock.mockReset();
    useMutateProfileMediaMutationMock.mockReset();
    useBarberTrustSummaryMock.mockReset();
    useBarberFintechReadinessQueryMock.mockReset();

    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      data: {
        viewer: {
          role: "booth_rent_barber",
          email: "blaze@bvrb3r.demo",
          profilePhotoUrl: null,
          profilePhotoPath: null,
          notificationPreference: {
            inAppEnabled: true,
            smsEnabled: true,
            emailEnabled: true,
            pushEnabled: true
          }
        },
        barberProfile: {
          barberId: "barber-blaze",
          profilePhotoUrl: null,
          profilePhotoPath: null,
          gallery: []
        },
        shops: []
      }
    });
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      error: null,
      mutateAsync: vi.fn()
    });
    useBarberTrustSummaryMock.mockReturnValue({
      data: {
        barberId: "barber-blaze",
        overallStatus: "verified",
        canonicalOverallStatus: "approved",
        verificationProgress: 100,
        trustScore: 94,
        completionRate: 97,
        publicBadgePreview: ["Verified license"],
        verificationItems: [],
        openReports: 0,
        openDisputes: 0,
        activeRiskFlags: [],
        reminders: [],
        verificationDecision: {
          canonicalOverallStatus: "approved",
          gates: {
            badge: { gate: "badge", allowed: true, codes: [], reasons: [], degraded: false },
            payout: { gate: "payout", allowed: true, codes: [], reasons: [], degraded: false }
          }
        }
      }
    });
    useBarberFintechReadinessQueryMock.mockReturnValue({
      data: {
        barberId: "barber-blaze",
        barberName: "Blaze King",
        connectedAccount: {
          operationalStatus: "payout_ready",
          payoutsEnabled: true
        },
        routingSummary: {
          blockedPaymentsCount: 0
        }
      }
    });
  });

  it("shows verified account health for barber profiles", () => {
    render(
      <StaffProfileWorkspace
        user={{
          id: "user-blaze",
          role: "booth_rent_barber",
          email: "blaze@bvrb3r.demo",
          password: "demo",
          name: "Blaze King",
          title: "Booth-Rent Barber",
          locationIds: ["loc-ybor"],
          barberId: "barber-blaze"
        }}
      />
    );

    expect(screen.getByText("Account health")).toBeInTheDocument();
    expect(screen.getByText("Verified barber account")).toBeInTheDocument();
    expect(screen.getByText("Payout ready")).toBeInTheDocument();
    expect(screen.getByText("Verified license")).toBeInTheDocument();
    expect(screen.getByText("4 channels enabled")).toBeInTheDocument();
  });

  it("shows canonical blocker reasons when verification gates are closed", () => {
    useBarberTrustSummaryMock.mockReturnValue({
      data: {
        barberId: "barber-blaze",
        overallStatus: "pending",
        canonicalOverallStatus: "needs_update",
        verificationProgress: 68,
        trustScore: 72,
        completionRate: 91,
        publicBadgePreview: [],
        verificationItems: [],
        openReports: 0,
        openDisputes: 0,
        activeRiskFlags: [],
        reminders: [],
        verificationDecision: {
          canonicalOverallStatus: "needs_update",
          gates: {
            badge: {
              gate: "badge",
              allowed: false,
              codes: ["license_verification_required"],
              reasons: ["License verification must be approved for this barber lane."],
              degraded: false
            },
            payout: {
              gate: "payout",
              allowed: false,
              codes: ["payout_verification_required"],
              reasons: ["Payout verification must be approved for this barber lane."],
              degraded: false
            }
          }
        }
      }
    });
    useBarberFintechReadinessQueryMock.mockReturnValue({
      data: {
        barberId: "barber-blaze",
        barberName: "Blaze King",
        connectedAccount: {
          operationalStatus: "action_required",
          payoutsEnabled: false
        },
        routingSummary: {
          blockedPaymentsCount: 2
        }
      }
    });

    render(
      <StaffProfileWorkspace
        user={{
          id: "user-blaze",
          role: "booth_rent_barber",
          email: "blaze@bvrb3r.demo",
          password: "demo",
          name: "Blaze King",
          title: "Booth-Rent Barber",
          locationIds: ["loc-ybor"],
          barberId: "barber-blaze"
        }}
      />
    );

    expect(screen.getByText("Verification still needs action")).toBeInTheDocument();
    expect(screen.getAllByText("License verification must be approved for this barber lane.").length).toBeGreaterThan(0);
    expect(screen.getByText("Verification restricted")).toBeInTheDocument();
    expect(screen.queryByText("Payout ready")).not.toBeInTheDocument();
  });
});
