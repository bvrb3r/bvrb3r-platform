import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  replaceMock,
  createSupabaseBrowserClientMock,
  exchangeCodeForSessionMock,
  getSessionMock,
  setSessionMock,
  signOutMock,
  updateUserMock
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  createSupabaseBrowserClientMock: vi.fn(),
  exchangeCodeForSessionMock: vi.fn(),
  getSessionMock: vi.fn(),
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
import {
  PASSWORD_RESET_GENERIC_FAILURE,
  PASSWORD_RESET_GENERIC_SUCCESS
} from "@/lib/auth/password-recovery";

describe("password reset workspaces", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    replaceMock.mockReset();
    createSupabaseBrowserClientMock.mockReset();
    exchangeCodeForSessionMock.mockReset();
    getSessionMock.mockReset();
    setSessionMock.mockReset();
    signOutMock.mockReset();
    updateUserMock.mockReset();
    fetchMock.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/login");
    vi.stubGlobal("fetch", fetchMock);

    createSupabaseBrowserClientMock.mockReturnValue({
      auth: {
        exchangeCodeForSession: exchangeCodeForSessionMock,
        getSession: getSessionMock,
        setSession: setSessionMock,
        signOut: signOutMock,
        updateUser: updateUserMock
      }
    });
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    getSessionMock.mockResolvedValue({ data: { session: null } });
    setSessionMock.mockResolvedValue({ error: null });
    signOutMock.mockResolvedValue({ error: null });
    updateUserMock.mockResolvedValue({ error: null });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, message: PASSWORD_RESET_GENERIC_SUCCESS })
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("submits password recovery identifiers through the server route", async () => {
    render(<ForgotPasswordWorkspace />);

    fireEvent.change(screen.getByLabelText("Email, mobile number, or username"), {
      target: { value: "  phillipmcgee813  " }
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send reset instructions" }).closest("form")!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ identifier: "phillipmcgee813" })
      });
    });
    expect(screen.getByText(PASSWORD_RESET_GENERIC_SUCCESS)).toBeInTheDocument();
  });

  it("shows the same generic forgot-password copy for unknown identifiers", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, message: PASSWORD_RESET_GENERIC_SUCCESS })
    });

    render(<ForgotPasswordWorkspace />);

    fireEvent.change(screen.getByLabelText("Email, mobile number, or username"), {
      target: { value: "nobody-in-production" }
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send reset instructions" }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText(PASSWORD_RESET_GENERIC_SUCCESS)).toBeInTheDocument();
    });
  });

  it("shows the generic failure only when the server cannot process recovery", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, message: PASSWORD_RESET_GENERIC_FAILURE })
    });

    render(<ForgotPasswordWorkspace />);

    fireEvent.change(screen.getByLabelText("Email, mobile number, or username"), {
      target: { value: "bvrb3r@icloud.com" }
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send reset instructions" }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText(PASSWORD_RESET_GENERIC_FAILURE)).toBeInTheDocument();
    });
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
      expect(screen.getByText("Password updated. Please log in with your new password.")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/login");
    }, { timeout: 2000 });
  });

  it("validates password length and matching confirmation before updating", async () => {
    window.history.replaceState({}, "", "/reset-password?code=recovery-code&type=recovery");

    render(<ResetPasswordWorkspace />);

    await waitFor(() => {
      expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("recovery-code");
    });

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "short" }
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "short" }
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save new password" }).closest("form")!);

    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-secure-password" }
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "different-secure-password" }
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save new password" }).closest("form")!);

    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("shows an invalid or expired reset link state when recovery exchange fails", async () => {
    exchangeCodeForSessionMock.mockResolvedValueOnce({ error: { message: "expired" } });
    window.history.replaceState({}, "", "/reset-password?code=expired-code&type=recovery");

    render(<ResetPasswordWorkspace />);

    await waitFor(() => {
      expect(screen.getByText("This reset link is invalid or expired. Please request a new one.")).toBeInTheDocument();
    });
    expect(updateUserMock).not.toHaveBeenCalled();
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
