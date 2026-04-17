import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseBrowserClientMock,
  getSessionMock,
  setSessionMock
} = vi.hoisted(() => ({
  createSupabaseBrowserClientMock: vi.fn(),
  getSessionMock: vi.fn(),
  setSessionMock: vi.fn()
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock
}));

import { AuthSessionRecovery } from "@/components/auth/auth-session-recovery";

describe("auth session recovery", () => {
  const replaceStateMock = vi.spyOn(window.history, "replaceState");

  beforeEach(() => {
    createSupabaseBrowserClientMock.mockReset();
    getSessionMock.mockReset();
    setSessionMock.mockReset();
    replaceStateMock.mockClear();

    window.history.replaceState({}, "", "/auth/callback");
    window.sessionStorage.clear();

    createSupabaseBrowserClientMock.mockReturnValue({
      auth: {
        getSession: getSessionMock,
        setSession: setSessionMock
      }
    });
  });

  it("restores a session from the OAuth hash fragment and routes through post-auth", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    setSessionMock.mockResolvedValue({ error: null });
    window.history.replaceState({}, "", "/auth/callback#access_token=token-1&refresh_token=refresh-1");

    render(<AuthSessionRecovery mode="callback" />);

    await waitFor(() => {
      expect(setSessionMock).toHaveBeenCalledWith({
        access_token: "token-1",
        refresh_token: "refresh-1"
      });
      expect(window.location.pathname).toBe("/post-auth");
      expect(window.location.hash).toBe("");
    });
  });

  it("routes recovery hash fragments to reset-password instead of post-auth", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    setSessionMock.mockResolvedValue({ error: null });
    window.history.replaceState(
      {},
      "",
      "/auth/callback#access_token=recovery-token&refresh_token=recovery-refresh&type=recovery"
    );

    render(<AuthSessionRecovery mode="callback" />);

    await waitFor(() => {
      expect(setSessionMock).toHaveBeenCalledWith({
        access_token: "recovery-token",
        refresh_token: "recovery-refresh"
      });
      expect(window.location.pathname).toBe("/reset-password");
      expect(window.location.search).toBe("?recovery=1");
      expect(window.location.hash).toBe("");
    });
  });

  it("routes an existing browser session through post-auth on public surfaces", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "existing-session" } } });
    setSessionMock.mockResolvedValue({ error: null });

    render(<AuthSessionRecovery mode="public" />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/post-auth");
    });
  });

  it("routes OAuth query callbacks on public surfaces through the canonical callback page", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    window.history.replaceState({}, "", "/?code=oauth-code");

    render(<AuthSessionRecovery mode="public" />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/auth/callback");
      expect(window.location.search).toBe("?code=oauth-code");
    });
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("routes recovery query callbacks on public surfaces to reset-password", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    window.history.replaceState({}, "", "/?code=recovery-code&type=recovery");

    render(<AuthSessionRecovery mode="public" />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/reset-password");
      expect(window.location.search).toBe("?code=recovery-code&type=recovery");
    });
    expect(getSessionMock).not.toHaveBeenCalled();
  });
});
