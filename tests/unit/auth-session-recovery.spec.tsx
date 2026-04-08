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

  it("routes an existing browser session through post-auth on public surfaces", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "existing-session" } } });
    setSessionMock.mockResolvedValue({ error: null });

    render(<AuthSessionRecovery mode="public" />);

    await waitFor(() => {
      expect(window.location.pathname).toBe("/post-auth");
    });
  });
});
