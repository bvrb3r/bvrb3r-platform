import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PwaProvider } from "@/components/pwa/pwa-provider";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname
}));

function renderWithProviders() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PwaProvider>
        <div>child</div>
      </PwaProvider>
    </QueryClientProvider>
  );
}

describe("pwa provider", () => {
  beforeEach(() => {
    mockPathname = "/";
    window.localStorage.clear();
    delete (window as Window & { Capacitor?: unknown }).Capacitor;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
    });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: "(display-mode: standalone)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        permission: "default",
        requestPermission: vi.fn().mockResolvedValue("default")
      }
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        register: vi.fn().mockResolvedValue(undefined),
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: vi.fn().mockResolvedValue(null)
          }
        })
      }
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ summary: {}, devices: [], subscriptions: [] })
    }) as unknown as typeof fetch;
  });

  it("shows an offline banner when connectivity drops", async () => {
    renderWithProviders();

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(await screen.findByText(/Offline mode/i)).toBeInTheDocument();
    expect(screen.getByText(/booking, checkout, and live operational writes/i)).toBeInTheDocument();
  });

  it("surfaces the install prompt when the browser raises beforeinstallprompt", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt");
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" })
    });

    renderWithProviders();

    act(() => {
      window.dispatchEvent(event);
    });

    expect(await screen.findByText(/Install the BVRB3R app/i)).toBeInTheDocument();

    act(() => {
      screen.getByRole("button", { name: /Install app/i }).click();
    });

    await waitFor(() => {
      expect(prompt).toHaveBeenCalledTimes(1);
    });
  });

  it("shows a mobile alerts prompt on role surfaces when push is not enabled", async () => {
    mockPathname = "/dashboard/client";
    renderWithProviders();

    expect(await screen.findByText(/Activate mobile alerts/i)).toBeInTheDocument();
    expect(screen.getByText(/booking confirmations, marketplace momentum/i)).toBeInTheDocument();
  });

  it("does not emit a failed device-presence write in demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "demo");
    mockPathname = "/dashboard/owner";

    renderWithProviders();

    await screen.findByText("child");
    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
    });
    vi.unstubAllEnvs();
  });

  it("suppresses the install prompt inside a wrapped native runtime", async () => {
    mockPathname = "/dashboard/client";
    (window as Window & { Capacitor?: { isNativePlatform: () => boolean; getPlatform: () => string } }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "ios"
    };

    const event = new Event("beforeinstallprompt");
    Object.assign(event, {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "dismissed", platform: "ios" })
    });

    renderWithProviders();

    act(() => {
      window.dispatchEvent(event);
    });

    expect(screen.queryByText(/Install the BVRB3R app/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/Activate mobile alerts/i)).toBeInTheDocument();
  });

  it("keeps unsupported desktop browsers free of fake install or push CTAs", async () => {
    Reflect.deleteProperty(window, "Notification");
    Reflect.deleteProperty(navigator, "serviceWorker");
    mockPathname = "/dashboard/client";

    renderWithProviders();

    expect(await screen.findByText("child")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/Install the BVRB3R app/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Activate mobile alerts/i)).not.toBeInTheDocument();
    });
  });

  it("uses honest iOS install copy without a fake browser install button", async () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
    });

    renderWithProviders();

    expect(await screen.findByText("Install the BVRB3R app")).toBeInTheDocument();
    expect(screen.getByText(/use Share then Add to Home Screen/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Install app/i })).not.toBeInTheDocument();
  });

  it("does not stack push and install prompts over the mobile dock", async () => {
    mockPathname = "/dashboard/client";
    const event = new Event("beforeinstallprompt");
    Object.assign(event, {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" })
    });

    renderWithProviders();

    act(() => {
      window.dispatchEvent(event);
    });

    expect(await screen.findByText(/Install the BVRB3R app/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/Activate mobile alerts/i)).not.toBeInTheDocument();
    });
  });
});
