import { render, screen } from "@testing-library/react";
import type { ComponentProps, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useArchitectVerificationQueueQueryMock,
  useArchitectVerificationDetailQueryMock,
  useArchitectVerificationActionMutationMock,
  useVerificationDocumentSignedUrlMutationMock
} = vi.hoisted(() => ({
  useArchitectVerificationQueueQueryMock: vi.fn(),
  useArchitectVerificationDetailQueryMock: vi.fn(),
  useArchitectVerificationActionMutationMock: vi.fn(),
  useVerificationDocumentSignedUrlMutationMock: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    onClick,
    href,
    ...props
  }: ComponentProps<"a"> & {
    children?: ReactNode;
    onClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      {...props}
      href={typeof href === "string" ? href : "#"}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  )
}));

vi.mock("@/lib/platform-admin/client", () => ({
  useArchitectVerificationQueueQuery: useArchitectVerificationQueueQueryMock,
  useArchitectVerificationDetailQuery: useArchitectVerificationDetailQueryMock,
  useArchitectVerificationActionMutation: useArchitectVerificationActionMutationMock,
  useVerificationDocumentSignedUrlMutation: useVerificationDocumentSignedUrlMutationMock
}));

import { ArchitectVerificationQueueWorkspace } from "@/components/operations/architect-verification-queue-workspace";
import { ArchitectVerificationDetailWorkspace } from "@/components/operations/architect-verification-detail-workspace";

describe("architect verification workspaces", () => {
  beforeEach(() => {
    useArchitectVerificationQueueQueryMock.mockReset();
    useArchitectVerificationDetailQueryMock.mockReset();
    useArchitectVerificationActionMutationMock.mockReset();
    useVerificationDocumentSignedUrlMutationMock.mockReset();

    useArchitectVerificationActionMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });

    useVerificationDocumentSignedUrlMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn()
    });
  });

  it("renders queue warnings, status filters, and a safe empty state", () => {
    const initialData = {
      items: [],
      warnings: ["Verification review data is partially unavailable. Core architect access is still active."]
    };

    useArchitectVerificationQueueQueryMock.mockReturnValue({
      data: initialData,
      error: null
    });

    render(
      <ArchitectVerificationQueueWorkspace
        initialData={initialData}
        initialFilters={{ role: "all", overallStatus: "all", submittedOnly: false }}
      />
    );

    expect(screen.getByText("Architect Verifications")).toBeInTheDocument();
    expect(screen.getByText("Verification review data is partially unavailable. Core architect access is still active.")).toBeInTheDocument();
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Payout")).toBeInTheDocument();
    expect(screen.getByText("Everything is caught up")).toBeInTheDocument();
  });

  it("renders provider status and safe empty states in the detail workspace", () => {
    const initialData = {
      profile: {
        profileId: "vprof-barber-fade",
        source: "profile" as const,
        userId: "user-fade",
        subjectName: "Fade Monroe",
        subjectEmail: "fade@bvrb3r.demo",
        role: "barber" as const,
        barberId: "barber-fade",
        overallStatus: "submitted" as const,
        canonicalOverallStatus: "submitted" as const,
        identityStatus: "submitted" as const,
        licenseStatus: "approved" as const,
        businessStatus: "not_started" as const,
        payoutStatus: "not_started" as const,
        complianceStatus: "approved" as const,
        publicVerified: false,
        canAcceptBookings: false,
        canReceivePayouts: false,
        canCreateShopListing: false,
        currentRequirements: ["Verify identity", "Connect payouts"],
        updatedAt: "2026-03-31T12:00:00.000Z",
        documents: [],
        reviews: [],
        providerLinks: [],
        auditTrail: []
      },
      warnings: []
    };

    useArchitectVerificationDetailQueryMock.mockReturnValue({
      data: initialData,
      error: null
    });

    render(<ArchitectVerificationDetailWorkspace profileId="vprof-barber-fade" initialData={initialData} />);

    expect(screen.getByText("Verification Detail")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Account Debug" })).toHaveAttribute("href", "/architect/users/user-fade");
    expect(screen.getByText("Provider status")).toBeInTheDocument();
    expect(screen.getByText("No provider-linked verification state has been recorded for this profile yet.")).toBeInTheDocument();
    expect(screen.getByText("No verification documents are currently linked to this profile.")).toBeInTheDocument();
    expect(screen.getByText("No verification review actions have been recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("No architect audit entries are linked to this verification profile yet.")).toBeInTheDocument();
  });

  it("renders a safe unavailable state when the detail payload is empty", () => {
    const initialData = {
      profile: null,
      warnings: []
    };

    useArchitectVerificationDetailQueryMock.mockReturnValue({
      data: initialData,
      error: null
    });

    render(<ArchitectVerificationDetailWorkspace profileId="missing-profile" initialData={initialData} />);

    expect(screen.getByText("Verification profile unavailable")).toBeInTheDocument();
  });
});
