import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BarberOnboardingWorkspace } from "@/components/onboarding/barber-onboarding-workspace";
import type { BarberOnboardingDraft } from "@/lib/onboarding/barber-path";

const { replaceMock } = vi.hoisted(() => ({
  replaceMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock
  })
}));

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

const readyDraft: BarberOnboardingDraft = {
  authenticated: true,
  role: "barber_user",
  barberRecordId: "barber-private-record-id",
  displayName: "Wave Carter",
  publicUsername: "wave",
  usernameAvailable: true,
  email: "wave@example.com",
  phone: "8135550102",
  specialties: ["fades"],
  firstServiceName: "Signature Cut",
  servicePriceCents: 4500,
  serviceDurationMinutes: 45,
  availableDays: ["Monday"],
  startTime: "09:00",
  endTime: "17:00",
  timezone: "America/New_York",
  bookingMode: "instant",
  paymentLane: "setup_later",
  providerTruthConnected: false
};

describe("barber onboarding path UI", () => {
  const fetchMock = vi.fn();
  const clipboardWrite = vi.fn();

  beforeEach(() => {
    replaceMock.mockReset();
    fetchMock.mockReset();
    clipboardWrite.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWrite }
    });
  });

  it("renders Barber preview and compact readiness without backend labels", () => {
    const { container } = render(<BarberOnboardingWorkspace step="preview" initialDraft={{}} />);

    expect(screen.getByRole("heading", { name: "Your chair path is ready." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set Up My Barber Profile" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enter Home" })).toHaveAttribute("href", "/dashboard/barber");
    expect(container.textContent).not.toMatch(/barber_user|freelance_barber|booth_rent_barber|commission_barber|profiles\.role|username_normalized|stripe_connect_status|payment_routing_records|barber-private-record-id/);
  });

  it("claims a clean public username before saving identity", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ available: true, reason: null }))
      .mockResolvedValueOnce(jsonResponse({ viewer: {} }))
      .mockResolvedValueOnce(jsonResponse({ nextPath: "/onboarding/barber/services" }));

    render(<BarberOnboardingWorkspace step="identity" initialDraft={{ phone: "8135550102" }} />);

    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Wave Carter" } });
    fireEvent.change(screen.getByLabelText("Public username"), { target: { value: "Wave!" } });
    fireEvent.click(screen.getByRole("button", { name: "Check Availability" }));

    expect(await screen.findByTestId("barber-username-status")).toHaveTextContent("Available");
    fireEvent.click(screen.getByRole("button", { name: "Use this identity" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/profile/username/availability?username=wave&ownerType=barber", expect.any(Object));
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/profile/media", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "set_barber_public_username",
          username: "wave"
        })
      }));
      expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/onboarding/barber/profile", expect.objectContaining({ method: "POST" }));
      expect(replaceMock).toHaveBeenCalledWith("/onboarding/barber?step=specialty");
    });
  });

  it("keeps work setup optional and routes skipped work to first service", () => {
    render(<BarberOnboardingWorkspace step="work_setup" initialDraft={readyDraft} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));

    expect(replaceMock).toHaveBeenCalledWith("/onboarding/barber?step=first_service");
  });

  it("saves service price and duration through the existing Barber service route", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ nextPath: "/onboarding/barber/availability" }));

    render(<BarberOnboardingWorkspace step="price_duration" initialDraft={{
      ...readyDraft,
      firstServiceName: "Signature Cut",
      servicePriceCents: null,
      serviceDurationMinutes: null
    }} />);

    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("Duration minutes"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/onboarding/barber/services", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          primaryServices: "Signature Cut",
          startingPrice: "45",
          averageDuration: "45 min"
        })
      }));
      expect(replaceMock).toHaveBeenCalledWith("/onboarding/barber?step=schedule");
    });
  });

  it("requires valid schedule metadata before continuing", async () => {
    render(<BarberOnboardingWorkspace step="schedule" initialDraft={{ ...readyDraft, availableDays: [], startTime: "17:00", endTime: "09:00" }} />);

    fireEvent.click(screen.getByText("Monday"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Choose days, a valid time range, and timezone before continuing.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables unsupported booking modes and only allows connected setup to advance", () => {
    render(<BarberOnboardingWorkspace step="booking_mode" initialDraft={readyDraft} />);

    expect(screen.getByRole("button", { name: /Request to book/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Shop-controlled flow/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Instant booking/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(replaceMock).toHaveBeenCalledWith("/onboarding/barber?step=payment_lane");
  });

  it("selects payment lanes without marking payout ready", () => {
    const { container } = render(<BarberOnboardingWorkspace step="payment_lane" initialDraft={readyDraft} />);

    fireEvent.click(screen.getByRole("button", { name: /BVRB3R Pay/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(container.textContent).toContain("Needs review");
    expect(container.textContent).not.toMatch(/Payout Ready[^]*Pass/);
    expect(replaceMock).toHaveBeenCalledWith("/onboarding/barber?step=booking_link");
  });

  it("shows only the public booking link and copies it after a successful clipboard write", async () => {
    clipboardWrite.mockResolvedValueOnce(undefined);
    const { container } = render(<BarberOnboardingWorkspace step="booking_link" initialDraft={readyDraft} />);

    expect(screen.getByText("/barber/wave")).toBeInTheDocument();
    expect(container.textContent).not.toContain("barber-private-record-id");
    fireEvent.click(screen.getByRole("button", { name: "Copy Link" }));

    await waitFor(() => {
      expect(clipboardWrite).toHaveBeenCalledWith("http://localhost:3000/barber/wave");
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
  });

  it("keeps invite and Home handoff safe when optional proof is skipped", () => {
    const { unmount } = render(<BarberOnboardingWorkspace step="invite_first_client" initialDraft={readyDraft} />);

    expect(screen.getByRole("link", { name: "Text message" })).toHaveAttribute("href", expect.stringContaining("Book%20with%20me%20on%20BVRB3R"));
    fireEvent.click(screen.getByRole("button", { name: "Show QR code" }));
    expect(screen.getByText("QR coming soon. Copy or text the booking link for now.")).toBeInTheDocument();

    unmount();
    render(<BarberOnboardingWorkspace step="home_handoff" initialDraft={{
      ...readyDraft,
      workSetupPreference: "skip_for_now",
      paymentLane: "setup_later",
      inviteSkipped: true,
      identityVerified: false
    }} />);

    expect(screen.getByRole("link", { name: "Enter Barber Home" })).toHaveAttribute("href", "/dashboard/barber");
    expect(screen.getByText(/Add your first work/)).toBeInTheDocument();
    expect(screen.getByText(/Finish payout\/payment setup/)).toBeInTheDocument();
    expect(screen.getByText(/Invite your first client/)).toBeInTheDocument();
  });
});
