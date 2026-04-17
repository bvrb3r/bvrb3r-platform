import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock, signInWithOAuthMock, createSupabaseBrowserClientMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  signInWithOAuthMock: vi.fn(),
  createSupabaseBrowserClientMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock
  }),
  useSearchParams: () => new URLSearchParams()
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock
}));

import { AuthEntryWorkspace } from "@/components/auth/auth-entry-workspace";

describe("auth entry workspace", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    signInWithOAuthMock.mockReset();
    createSupabaseBrowserClientMock.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    createSupabaseBrowserClientMock.mockReturnValue({
      auth: {
        signInWithOAuth: signInWithOAuthMock
      }
    });
    signInWithOAuthMock.mockResolvedValue({ error: null });
  });

  it("starts Google OAuth with account selection and no stale browser auth state", async () => {
    render(<AuthEntryWorkspace mode="login" />);
    window.localStorage.setItem("sb-project-auth-token", "previous-owner-token");
    window.sessionStorage.setItem("bvrb3r-marketplace-cta:owner", "1");

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(signInWithOAuthMock).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: "select_account"
          }
        }
      });
    });
    expect(window.localStorage.getItem("sb-project-auth-token")).toBeNull();
    expect(window.sessionStorage.getItem("bvrb3r-marketplace-cta:owner")).toBeNull();
  });

  it("shows the forgot password entry point on the login screen", () => {
    render(<AuthEntryWorkspace mode="login" />);

    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
  });
});
