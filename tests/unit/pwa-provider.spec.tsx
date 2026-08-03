import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PwaProvider, usePwa } from "@/components/pwa/pwa-provider";

let mockPathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname
}));

function PushIntentTrigger() {
  const { requestPushPrimer } = usePwa();

  return (
    <button type="button" onClick={() => requestPushPrimer("booking")}>
      Enable booking alerts
    </button>
  );
}

function renderWithProviders(children: React.ReactNode = <div>child</div>) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PwaProvider>
        {children}
      </PwaProvider>
    </QueryClientProvider>
  );
}

describe("pwa provider", () => {
  beforeEach(() => {
    mockPathname = "/";
    window.localStorage.clear();
    window.sessionStorage.clear();
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

  it("never opens push permission or a primer on first dashboard load", async () => {
    mockPathname = "/dashboard/client";
    renderWithProviders();

    expect(await screen.findByText("child")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /booking|alerts/i })).not.toBeInTheDocument();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("shows the shared value primer before requesting browser permission", async () => {
    vi.mocked(Notification.requestPermission).mockResolvedValue("granted");
    renderWithProviders(<PushIntentTrigger />);

    act(() => {
      screen.getByRole("button", { name: "Enable booking alerts" }).click();
    });

    expect(await screen.findByRole("dialog", { name: "Keep every booking on time." })).toBeInTheDocument();
    expect(screen.getByText("Appointment reminders")).toBeInTheDocument();
    expect(screen.getByText("Your barber says you’re up")).toBeInTheDocument();
    expect(screen.getByText("Payout landed")).toBeInTheDocument();
    expect(Notification.requestPermission).not.toHaveBeenCalled();

    act(() => {
      screen.getByRole("button", { name: "Enable" }).click();
    });

    await waitFor(() => {
      expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
    });
  });

  it("honors Not now for the rest of the browser session", async () => {
    renderWithProviders(<PushIntentTrigger />);

    act(() => {
      screen.getByRole("button", { name: "Enable booking alerts" }).click();
    });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    act(() => {
      screen.getByRole("button", { name: "Not now" }).click();
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(window.sessionStorage.getItem("bvrb3r-push-primer-session-decision")).toBe("deferred");

    act(() => {
      screen.getByRole("button", { name: "Enable booking alerts" }).click();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("shows platform-specific recovery after browser permission is denied", async () => {
    vi.mocked(Notification.requestPermission).mockResolvedValue("denied");
    renderWithProviders(<PushIntentTrigger />);

    act(() => {
      screen.getByRole("button", { name: "Enable booking alerts" }).click();
    });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    act(() => {
      screen.getByRole("button", { name: "Enable" }).click();
    });

    expect(await screen.findByText("Permission is blocked in device settings")).toBeInTheDocument();
    expect(screen.getByText(/In Chrome or Edge, select the site controls beside the address/i)).toBeInTheDocument();
    expect(window.sessionStorage.getItem("bvrb3r-push-primer-session-decision")).toBe("denied");

    act(() => {
      screen.getByRole("button", { name: "Not now" }).click();
      screen.getByRole("button", { name: "Enable booking alerts" }).click();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
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

  it("treats missing browser Supabase configuration as demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    mockPathname = "/dashboard/barber";

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

    expect(await screen.findByText("child")).toBeInTheDocument();
    expect(screen.queryByText(/Install the BVRB3R app/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("keeps unsupported desktop browsers free of fake install or push CTAs", async () => {
    Reflect.deleteProperty(window, "Notification");
    Reflect.deleteProperty(navigator, "serviceWorker");
    mockPathname = "/dashboard/client";

    renderWithProviders();

    expect(await screen.findByText("child")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/Install the BVRB3R app/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

  it("does not add an unsolicited push primer behind the install prompt", async () => {
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
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(Notification.requestPermission).not.toHaveBeenCalled();
    });
  });
});
