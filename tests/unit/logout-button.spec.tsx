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

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalled();
    });
    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store"
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(replaceMock).toHaveBeenCalledWith("/login");
    expect(refreshMock).toHaveBeenCalled();
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
