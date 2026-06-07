import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKioskClientSearchQuery } from "@/lib/kiosk/client";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("kiosk client username search", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] })
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not search before two normalized username characters", async () => {
    renderHook(() => useKioskClientSearchQuery("@p"), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it("debounces and strips @ before searching", async () => {
    renderHook(() => useKioskClientSearchQuery("@ph"), { wrapper });

    expect(fetch).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetch).toHaveBeenCalledWith("/api/kiosk/client-search?q=ph", expect.any(Object));
  });
});
