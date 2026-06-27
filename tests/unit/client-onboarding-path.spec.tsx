import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ClientOnboardingWorkspace } from "@/components/onboarding/client-onboarding-workspace";

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

describe("client onboarding path UI", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    replaceMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("renders Client setup copy without backend role or username authority labels", () => {
    const { container } = render(<ClientOnboardingWorkspace step="client_profile" />);

    expect(screen.getByText("Client")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Claim your BVRB3R name." })).toBeInTheDocument();
    expect(screen.getByText(/Verification is not faked here/i)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/client_user|guest_user|username_normalized|profiles\.role|auth\.uid/);
  });

  it("shows username availability states and blocks protected names", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      available: false,
      reason: "reserved"
    }));

    render(<ClientOnboardingWorkspace step="client_profile" />);

    fireEvent.change(screen.getByLabelText("BVRB3R name"), {
      target: { value: "admin" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Check Availability" }));

    expect(await screen.findByTestId("username-status")).toHaveTextContent("This name is protected");
    expect(fetchMock).toHaveBeenCalledWith("/api/profile/username/availability?username=admin&ownerType=client", expect.any(Object));
  });

  it("claims username through the canonical profile route before saving onboarding profile", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ available: true, reason: null }))
      .mockResolvedValueOnce(jsonResponse({ viewer: {} }))
      .mockResolvedValueOnce(jsonResponse({ nextPath: "/onboarding/client/preferences", state: { status: "in_progress" } }));

    render(<ClientOnboardingWorkspace step="client_profile" />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Jordan Ellis" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jordan@example.com" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "8135550101" } });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Tampa" } });
    fireEvent.change(screen.getByLabelText("BVRB3R name"), { target: { value: "jordan" } });
    fireEvent.click(screen.getByRole("button", { name: "Check Availability" }));
    expect(await screen.findByTestId("username-status")).toHaveTextContent("Available");
    fireEvent.click(screen.getByLabelText(/I accept the BVRB3R trust rules/i));
    fireEvent.click(screen.getByRole("button", { name: "Continue to preferences" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/profile/media", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "set_client_public_username",
          username: "jordan"
        })
      }));
      expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/onboarding/client/profile", expect.objectContaining({
        method: "POST"
      }));
      expect(replaceMock).toHaveBeenCalledWith("/onboarding/client/preferences");
    });
  });

  it("renders client preference branch and routes Find My First Cut through discovery", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      nextPath: "/discover?entry=client_onboarding&source=client_onboarding&type=barbers&category=haircuts&availability=today",
      state: { status: "completed" }
    }));

    render(<ClientOnboardingWorkspace step="client_preferences" />);

    expect(screen.getByRole("heading", { name: "Need. Timing. Search priority." })).toBeInTheDocument();
    expect(screen.getByText(/Browsing never requires a card/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Service Interest"), { target: { value: "haircut" } });
    fireEvent.change(screen.getByLabelText("Booking Timing"), { target: { value: "today" } });
    fireEvent.change(screen.getByLabelText("Search Priority"), { target: { value: "soonest_available" } });
    fireEvent.change(screen.getByLabelText("First Booking Mission"), { target: { value: "find_first_cut" } });
    fireEvent.click(screen.getByRole("button", { name: "Find My First Cut" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/onboarding/client/preferences", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          serviceInterest: "haircut",
          bookingTiming: "today",
          searchPriority: "soonest_available",
          firstBookingMission: "find_first_cut",
          preferredServices: "Haircut",
          bookingCadence: "Today",
          notifications: "booking_updates"
        })
      }));
      expect(replaceMock).toHaveBeenCalledWith("/discover?entry=client_onboarding&source=client_onboarding&type=barbers&category=haircuts&availability=today");
    });
  });

  it("renders Client Home handoff without creating a dead action", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      nextPath: "/dashboard/client",
      state: { status: "completed" }
    }));

    render(<ClientOnboardingWorkspace step="client_preferences" />);

    fireEvent.change(screen.getByLabelText("Service Interest"), { target: { value: "not_sure_yet" } });
    fireEvent.change(screen.getByLabelText("Booking Timing"), { target: { value: "just_browsing" } });
    fireEvent.change(screen.getByLabelText("Search Priority"), { target: { value: "closest_to_me" } });
    fireEvent.change(screen.getByLabelText("First Booking Mission"), { target: { value: "enter_client_home" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter Client Home" }));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/dashboard/client");
    });
  });
});
