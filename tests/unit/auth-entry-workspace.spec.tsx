import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { replaceMock, searchParamsMock, signInWithOAuthMock, signUpMock, createSupabaseBrowserClientMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
  signInWithOAuthMock: vi.fn(),
  signUpMock: vi.fn(),
  createSupabaseBrowserClientMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock
  }),
  useSearchParams: () => searchParamsMock()
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock
}));

import { AuthEntryWorkspace } from "@/components/auth/auth-entry-workspace";

describe("auth entry workspace", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    searchParamsMock.mockReset();
    searchParamsMock.mockReturnValue(new URLSearchParams());
    signInWithOAuthMock.mockReset();
    signUpMock.mockReset();
    createSupabaseBrowserClientMock.mockReset();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    window.sessionStorage.clear();
    createSupabaseBrowserClientMock.mockReturnValue({
      auth: {
        signInWithOAuth: signInWithOAuthMock,
        signUp: signUpMock
      }
    });
    signInWithOAuthMock.mockResolvedValue({ error: null });
    signUpMock.mockResolvedValue({ data: { session: null }, error: null });
  });

  it("preserves a safe protected-route redirect in the OAuth callback next parameter", async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams({ redirect: "/dashboard/barber" }));
    render(<AuthEntryWorkspace mode="login" />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(signInWithOAuthMock).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=%2Fdashboard%2Fbarber`,
          queryParams: {
            prompt: "select_account"
          }
        }
      });
    });
  });

  it("drops unsafe external redirect values before starting OAuth", async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams({ redirect: "https://www.bvrb3r.app/dashboard/client" }));
    render(<AuthEntryWorkspace mode="login" />);

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

  it("does not clear browser auth storage merely by mounting the login workspace", () => {
    window.localStorage.setItem("sb-project-auth-token-code-verifier", "pkce-verifier");

    render(<AuthEntryWorkspace mode="login" />);

    expect(window.localStorage.getItem("sb-project-auth-token-code-verifier")).toBe("pkce-verifier");
  });

  it("shows the forgot password entry point on the login screen", () => {
    render(<AuthEntryWorkspace mode="login" />);

    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
  });

  it("requires a signup role and sends it in email signup metadata", async () => {
    render(<AuthEntryWorkspace mode="signup" />);

    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Fresh Barber" } });
    fireEvent.change(screen.getByPlaceholderText("Phone number"), { target: { value: "(813) 555-0199" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "fresh@bvrb3r.app" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "safe-password-1" } });
    fireEvent.click(screen.getByLabelText(/Barber/i));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(signUpMock).toHaveBeenCalledWith({
        email: "fresh@bvrb3r.app",
        password: "safe-password-1",
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: "Fresh Barber",
            phone: "(813) 555-0199",
            signup_role_intent: "barber",
            primary_onboarding_role: "barber"
          }
        }
      });
    });
  });

  it("persists signup role intent before starting Google OAuth from signup", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthEntryWorkspace mode="signup" />);

    fireEvent.click(screen.getByLabelText(/Shop Owner/i));
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/signup-intent", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ role: "shop_owner" })
      }));
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
  });
});
