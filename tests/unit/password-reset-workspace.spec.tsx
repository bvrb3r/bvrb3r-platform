import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  replaceMock,
  createSupabaseBrowserClientMock,
  exchangeCodeForSessionMock,
  getSessionMock,
  setSessionMock,
  signOutMock,
  signInWithPasswordMock,
  updateUserMock
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  createSupabaseBrowserClientMock: vi.fn(),
  exchangeCodeForSessionMock: vi.fn(),
  getSessionMock: vi.fn(),
  setSessionMock: vi.fn(),
  signOutMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
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
  PASSWORD_RESET_GENERIC_FAILURE
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
    signInWithPasswordMock.mockReset();
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
        signInWithPassword: signInWithPasswordMock,
        updateUser: updateUserMock
      }
    });
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    getSessionMock.mockResolvedValue({ data: { session: null } });
    setSessionMock.mockResolvedValue({ error: null });
    signOutMock.mockResolvedValue({ error: null });
    signInWithPasswordMock.mockResolvedValue({ error: null });
    updateUserMock.mockResolvedValue({ error: null });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        challengeId: "11111111-1111-4111-8111-111111111111",
        maskedDestination: "p•••@example.test",
        expiresInSeconds: 600
      })
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("requests a six-digit email recovery code through the server route", async () => {
    render(<ForgotPasswordWorkspace />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "  phillip@example.test  " }
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send six-digit code" }).closest("form")!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/recovery/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          channel: "email",
          destination: "phillip@example.test"
        })
      });
    });
    expect(screen.getByText(/Enter the six digits sent to p•••@example.test/)).toBeInTheDocument();
  });

  it("supports the SMS recovery branch", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        challengeId: "11111111-1111-4111-8111-111111111111",
        maskedDestination: "••• ••• 0100",
        expiresInSeconds: 600
      })
    });

    render(<ForgotPasswordWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "SMS" }));

    fireEvent.change(screen.getByLabelText("Mobile number"), {
      target: { value: "(813) 555-0100" }
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send six-digit code" }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText(/Enter the six digits sent to ••• ••• 0100/)).toBeInTheDocument();
    });
  });

  it("shows an honest server recovery failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: PASSWORD_RESET_GENERIC_FAILURE })
    });

    render(<ForgotPasswordWorkspace />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "bvrb3r@icloud.com" }
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send six-digit code" }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText(PASSWORD_RESET_GENERIC_FAILURE)).toBeInTheDocument();
    });
  });

  it("verifies six digits, saves the password, and automatically signs in", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          challengeId: "11111111-1111-4111-8111-111111111111",
          maskedDestination: "c•••@bvrb3r.demo",
          expiresInSeconds: 600,
          demoCode: "246810"
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          resetToken: "reset-token-with-more-than-thirty-two-characters",
          expiresInSeconds: 500
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          completed: true,
          signInEmail: "client@bvrb3r.demo"
        })
      });

    render(<ForgotPasswordWorkspace />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "client@bvrb3r.demo" }
    });
    fireEvent.submit(screen.getByRole("button", { name: "Send six-digit code" }).closest("form")!);

    await screen.findByText("Demo code: 246810");
    fireEvent.change(screen.getByLabelText("Six-digit code"), {
      target: { value: "246810" }
    });
    fireEvent.submit(screen.getByRole("button", { name: "Verify code" }).closest("form")!);

    await screen.findByText(/Set a fresh key/);
    fireEvent.change(screen.getByLabelText("New recovery password"), {
      target: { value: "new-secure-password" }
    });
    fireEvent.change(screen.getByLabelText("Confirm recovery password"), {
      target: { value: "new-secure-password" }
    });
    fireEvent.submit(screen.getByRole("button", { name: "Save password & sign in" }).closest("form")!);

    await waitFor(() => {
      expect(signInWithPasswordMock).toHaveBeenCalledWith({
        email: "client@bvrb3r.demo",
        password: "new-secure-password"
      });
      expect(screen.getByText(/You’re back in/)).toBeInTheDocument();
    });
  });

  it("provides a no-access support handoff with an identity checklist", () => {
    render(<ForgotPasswordWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "I can’t access either one" }));

    expect(screen.getByText("Have this ready")).toBeInTheDocument();
    expect(screen.getByText(/A recent appointment, shop, or barber/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start support handoff" }))
      .toHaveAttribute("href", "/contact?subject=account-recovery");
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
