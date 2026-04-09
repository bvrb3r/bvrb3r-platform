import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  routerReplaceMock,
  createSupabaseBrowserClientMock,
  useContactVerificationStatusMock,
  useOnboardingMeMock,
  useUpdateContactVerificationMutationMock,
  useSendPhoneVerificationMutationMock,
  useVerifyPhoneVerificationMutationMock
} = vi.hoisted(() => ({
  routerReplaceMock: vi.fn(),
  createSupabaseBrowserClientMock: vi.fn(),
  useContactVerificationStatusMock: vi.fn(),
  useOnboardingMeMock: vi.fn(),
  useUpdateContactVerificationMutationMock: vi.fn(),
  useSendPhoneVerificationMutationMock: vi.fn(),
  useVerifyPhoneVerificationMutationMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: routerReplaceMock
  })
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock
}));

vi.mock("@/lib/onboarding/client", () => ({
  useContactVerificationStatus: useContactVerificationStatusMock,
  useOnboardingMe: useOnboardingMeMock,
  useUpdateContactVerificationMutation: useUpdateContactVerificationMutationMock,
  useSendPhoneVerificationMutation: useSendPhoneVerificationMutationMock,
  useVerifyPhoneVerificationMutation: useVerifyPhoneVerificationMutationMock
}));

import { ContactVerificationWorkspace } from "@/components/auth/contact-verification-workspace";

describe("contact verification workspace", () => {
  const statusRefetchMock = vi.fn();
  const onboardingRefetchMock = vi.fn();
  const updateMutateAsyncMock = vi.fn();
  const sendMutateAsyncMock = vi.fn();
  const verifyMutateAsyncMock = vi.fn();

  beforeEach(() => {
    routerReplaceMock.mockReset();
    createSupabaseBrowserClientMock.mockReset();
    useContactVerificationStatusMock.mockReset();
    useOnboardingMeMock.mockReset();
    useUpdateContactVerificationMutationMock.mockReset();
    useSendPhoneVerificationMutationMock.mockReset();
    useVerifyPhoneVerificationMutationMock.mockReset();
    statusRefetchMock.mockReset();
    onboardingRefetchMock.mockReset();
    updateMutateAsyncMock.mockReset();
    sendMutateAsyncMock.mockReset();
    verifyMutateAsyncMock.mockReset();

    createSupabaseBrowserClientMock.mockReturnValue({
      auth: {
        resend: vi.fn()
      }
    });

    useContactVerificationStatusMock.mockReturnValue({
      data: {
        fullName: "Owner Lane",
        firstName: "Owner",
        lastName: "Lane",
        email: "owner@bvrb3r.app",
        phone: "+18135550100",
        emailVerified: true,
        phoneVerified: false,
        canContinue: false,
        requiresRoleSelection: false,
        onboardingState: "awaiting_contact_verification",
        missingFields: [],
        nextPath: "/verify-contact"
      },
      refetch: statusRefetchMock
    });

    useOnboardingMeMock.mockReturnValue({
      refetch: onboardingRefetchMock
    });

    useUpdateContactVerificationMutationMock.mockReturnValue({
      mutateAsync: updateMutateAsyncMock,
      isPending: false
    });

    useSendPhoneVerificationMutationMock.mockReturnValue({
      mutateAsync: sendMutateAsyncMock,
      isPending: false
    });

    useVerifyPhoneVerificationMutationMock.mockReturnValue({
      mutateAsync: verifyMutateAsyncMock,
      isPending: false
    });
  });

  it("continues immediately to the canonical next step after successful phone verification", async () => {
    verifyMutateAsyncMock.mockResolvedValue({
      fullName: "Owner Lane",
      firstName: "Owner",
      lastName: "Lane",
      email: "owner@bvrb3r.app",
      phone: "+18135550100",
      emailVerified: true,
      phoneVerified: true,
      canContinue: true,
      requiresRoleSelection: true,
      onboardingState: "awaiting_role_selection",
      missingFields: [],
      nextPath: "/role-select"
    });
    statusRefetchMock.mockResolvedValue({
      data: {
        canContinue: true,
        nextPath: "/role-select"
      }
    });
    onboardingRefetchMock.mockResolvedValue({
      data: {
        nextPath: "/role-select"
      }
    });

    render(<ContactVerificationWorkspace />);

    fireEvent.change(screen.getByPlaceholderText(/enter verification code/i), {
      target: { value: "123456" }
    });
    fireEvent.click(screen.getByRole("button", { name: /verify phone/i }));

    await waitFor(() => {
      expect(verifyMutateAsyncMock).toHaveBeenCalledWith({ code: "123456" });
      expect(routerReplaceMock).toHaveBeenCalledWith("/role-select");
    });
  });

  it("auto-forwards users when canonical contact state already has a next step", async () => {
    useContactVerificationStatusMock.mockReturnValue({
      data: {
        fullName: "Maya Lane",
        firstName: "Maya",
        lastName: "Lane",
        email: "maya@bvrb3r.app",
        phone: "+18135550122",
        emailVerified: true,
        phoneVerified: true,
        canContinue: true,
        requiresRoleSelection: false,
        onboardingState: "active",
        missingFields: [],
        nextPath: "/dashboard/owner"
      },
      refetch: statusRefetchMock
    });

    render(<ContactVerificationWorkspace />);

    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith("/dashboard/owner");
    });
  });
});
