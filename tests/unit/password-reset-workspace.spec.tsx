import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  replaceMock,
  createSupabaseBrowserClientMock,
  exchangeCodeForSessionMock,
  getSessionMock,
  resetPasswordForEmailMock,
  setSessionMock,
  signOutMock,
  updateUserMock
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  createSupabaseBrowserClientMock: vi.fn(),
  exchangeCodeForSessionMock: vi.fn(),
  getSessionMock: vi.fn(),
  resetPasswordForEmailMock: vi.fn(),
  setSessionMock: vi.fn(),
  signOutMock: vi.fn(),
  updateUserMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock
  })
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock
}));

import {
  ForgotPasswordWorkspace,
  PasswordRecoveryRedirectGuard,
  ResetPasswordWorkspace
} from "@/components/auth/password-reset-workspace";

describe("password reset workspaces", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    createSupabaseBrowserClientMock.mockReset();
    exchangeCodeForSessionMock.mockReset();
    getSessionMock.mockReset();
    resetPasswordForEmailMock.mockReset();
    setSessionMock.mockReset();
    signOutMock.mockReset();
    updateUserMock.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/login");

    createSupabaseBrowserClientMock.mockReturnValue({
      auth: {
        exchangeCodeForSession: exchangeCodeForSessionMock,
        getSession: getSessionMock,
        resetPasswordForEmail: resetPasswordForEmailMock,
        setSession: setSessionMock,
        signOut: signOutMock,
        updateUser: updateUserMock
      }
    });
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    getSessionMock.mockResolvedValue({ data: { session: null } });
    resetPasswordForEmailMock.mockResolvedValue({ error: null });
    setSessionMock.mockResolvedValue({ error: null });
    signOutMock.mockResolvedValue({ error: null });
    updateUserMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends password recovery emails to the reset-password route", async () => {
    render(<ForgotPasswordWorkspace />);

    fireEvent.change(screen.getByLabelText("Account email"), {
      target: { value: "bvrb3r@icloud.com" }
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send reset link" }).closest("form")!);

    await waitFor(() => {
      expect(resetPasswordForEmailMock).toHaveBeenCalledWith("bvrb3r@icloud.com", {
        redirectTo: `${window.location.origin}/reset-password`
      });
    });
    expect(screen.getByText("Check your email for a secure password reset link.")).toBeInTheDocument();
  });

  it("exchanges recovery codes on reset-password and does not route to dashboards", async () => {
    window.history.replaceState({}, "", "/reset-password?code=recovery-code&type=recovery");

    render(<ResetPasswordWorkspace />);

    await waitFor(() => {
      expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("recovery-code");
      expect(screen.getByText("Enter a new password to finish the reset.")).toBeInTheDocument();
    });
    expect(replaceMock).not.toHaveBeenCalledWith("/post-auth");
    expect(replaceMock).not.toHaveBeenCalledWith("/architect");
  });

  it("saves a new password, signs out the recovery session, and returns to login", async () => {
    window.history.replaceState({}, "", "/reset-password?code=recovery-code&type=recovery");

    render(<ResetPasswordWorkspace />);

    await waitFor(() => {
      expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("recovery-code");
    });

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-secure-password" }
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-secure-password" }
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save new password" }).closest("form")!);

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith({ password: "new-secure-password" });
      expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
      expect(screen.getByText("Password updated. Return to login and sign in with the new password.")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/login?password_reset=1");
    }, { timeout: 2000 });
  });

  it("routes recovery hash fragments on protected pages into reset-password", async () => {
    window.history.replaceState(
      {},
      "",
      "/architect#access_token=recovery-token&refresh_token=recovery-refresh&type=recovery"
    );

    render(<PasswordRecoveryRedirectGuard />);

    await waitFor(() => {
      expect(setSessionMock).toHaveBeenCalledWith({
        access_token: "recovery-token",
        refresh_token: "recovery-refresh"
      });
      expect(window.location.pathname).toBe("/reset-password");
      expect(window.location.search).toBe("?recovery=1");
    });
  });
});
