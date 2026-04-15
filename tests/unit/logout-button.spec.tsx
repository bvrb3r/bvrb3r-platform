import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  replaceMock,
  refreshMock,
  signOutMock,
  createSupabaseBrowserClientMock
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  refreshMock: vi.fn(),
  signOutMock: vi.fn(),
  createSupabaseBrowserClientMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
    refresh: refreshMock
  })
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock
}));

import { LogoutButton } from "@/components/auth/logout-button";

describe("logout button", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    refreshMock.mockReset();
    signOutMock.mockReset();
    createSupabaseBrowserClientMock.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = "sb-project-auth-token=token; path=/";
    document.cookie = "bvrb3r-demo-email=owner@bvrb3r.demo; path=/";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));
    createSupabaseBrowserClientMock.mockReturnValue({
      auth: {
        signOut: signOutMock
      }
    });
    signOutMock.mockResolvedValue({ error: null });
  });

  function renderWithClient() {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["owner-dashboard"], { revenue: 99 });

    render(
      <QueryClientProvider client={queryClient}>
        <LogoutButton />
      </QueryClientProvider>
    );

    return queryClient;
  }

  it("clears the Supabase session, client cache, and redirects to login", async () => {
    const queryClient = renderWithClient();
    window.localStorage.setItem("sb-project-auth-token", "owner-token");
    window.localStorage.setItem("bvrb3r-booking-draft:v1", JSON.stringify({ owner: true }));
    window.sessionStorage.setItem("bvrb3r-marketplace-cta:owner", "1");

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
    });
    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store"
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(window.localStorage.getItem("sb-project-auth-token")).toBeNull();
    expect(window.localStorage.getItem("bvrb3r-booking-draft:v1")).toBeNull();
    expect(window.sessionStorage.getItem("bvrb3r-marketplace-cta:owner")).toBeNull();
    expect(document.cookie).not.toContain("sb-project-auth-token");
    expect(replaceMock).toHaveBeenCalledWith("/login?logged_out=1");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("still clears cached account state when browser sign-out sees an already-cleared session", async () => {
    signOutMock.mockResolvedValue({ error: new Error("Auth session missing") });
    const queryClient = renderWithClient();
    queryClient.setQueryData(["barber-dashboard"], { appointments: ["old-owner"] });
    window.localStorage.setItem("sb-project-auth-token", "owner-token");
    window.sessionStorage.setItem("bvrb3r-marketplace-cta:owner", "1");

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/login?logged_out=1");
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(window.localStorage.getItem("sb-project-auth-token")).toBeNull();
    expect(window.sessionStorage.getItem("bvrb3r-marketplace-cta:owner")).toBeNull();
  });

  it("surfaces logout errors without redirecting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "LOGOUT_FAILED",
      message: "Unable to clear auth cookies."
    }), { status: 500 })));
    renderWithClient();

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to clear auth cookies.");
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
