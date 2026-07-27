import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShopOwnerOnboardingWorkspace } from "@/components/onboarding/shop-owner-onboarding-workspace";
import type { ShopOwnerOnboardingDraft } from "@/lib/onboarding/shop-owner-path";

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

const readyDraft: ShopOwnerOnboardingDraft = {
  authenticated: true,
  role: "shop_owner_user",
  ownerName: "Avery Owner",
  email: "owner@example.com",
  phone: "8135550103",
  shopRecordId: "shop-private-record-id",
  shopName: "BVRB3R Ybor",
  shopDisplayName: "BVRB3R Ybor",
  shopUsername: "bvrb3r-ybor",
  usernameAvailable: true,
  ownerAuthorityType: "owner",
  addressLine1: "123 Main St",
  city: "Tampa",
  state: "FL",
  zipCode: "33602",
  locationCaptureMethod: "full_address",
  hoursType: "custom",
  availableDays: ["Monday"],
  startTime: "09:00",
  endTime: "18:00",
  timezone: "America/New_York",
  chairRange: "4_6",
  estimatedChairCount: 6,
  operatingModel: "mixed",
  bookingMode: "pick_barber",
  paymentModel: "setup_later",
  policiesChoice: "standard",
  policiesAccepted: true,
  verificationPosture: "pending"
};

describe("shop owner onboarding path UI", () => {
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

  it("renders Shop Owner preview without backend labels and routes to setup or Owner Home", () => {
    const { container } = render(<ShopOwnerOnboardingWorkspace step="preview" initialDraft={{}} />);

    expect(screen.getByRole("heading", { name: "Your shop path is ready." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set Up My Shop" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enter Home" })).toHaveAttribute("href", "/dashboard/owner");
    fireEvent.click(screen.getByRole("button", { name: "Set Up My Shop" }));
    expect(replaceMock).toHaveBeenCalledWith("/onboarding/owner?step=access");
    expect(container.textContent).not.toMatch(/shop_owner_user|guest_user|profiles\.role|auth\.uid|username_normalized|owner_profile_id|shop-private-record-id|payout_readiness_status|stripe_connect_status|relationship_type|booth_rent_barber|commission_barber|freelance_barber/);  // doctrine-allow
  });

  it("captures owner authority and flags manager authority for review copy-free", () => {
    render(<ShopOwnerOnboardingWorkspace step="authority" initialDraft={readyDraft} />);

    fireEvent.click(screen.getByRole("button", { name: "I manage this shop" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(replaceMock).toHaveBeenCalledWith("/onboarding/owner?step=identity");
  });

  it("claims a shop username only when a real shop record is connected", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ available: true, reason: null }))
      .mockResolvedValueOnce(jsonResponse({ viewer: {} }));

    render(<ShopOwnerOnboardingWorkspace step="identity" initialDraft={{ ...readyDraft, shopUsername: "" }} />);

    fireEvent.change(screen.getByLabelText("Shop name"), { target: { value: "BVRB3R Ybor" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Ybor Cuts" } });
    fireEvent.change(screen.getByLabelText("Shop username"), { target: { value: "Ybor!" } });
    fireEvent.click(screen.getByRole("button", { name: "Check Availability" }));

    expect(await screen.findByTestId("shop-username-status")).toHaveTextContent("Available");
    fireEvent.click(screen.getByRole("button", { name: "Use this shop identity" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/profile/username/availability?username=ybor&ownerType=shop&shopId=shop-private-record-id", expect.any(Object));
      expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/profile/media", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "set_shop_public_username",
          shopId: "shop-private-record-id",
          username: "ybor"
        })
      }));
      expect(replaceMock).toHaveBeenCalledWith("/onboarding/owner?step=shop_preview");
    });
  });

  it("allows public-safe shop preview without private owner or money data", () => {
    const { container } = render(<ShopOwnerOnboardingWorkspace step="shop_preview" initialDraft={readyDraft} />);

    expect(screen.getByRole("heading", { name: "Preview your shop." })).toBeInTheDocument();
    expect(screen.getByText("BVRB3R Ybor")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/owner_profile_id|stripe_customer_id|payment_intent|provider_payment_method_id|shop-private-record-id/);
  });

  it("drafts city-first location honestly and blocks full Shop Ready", () => {
    render(<ShopOwnerOnboardingWorkspace step="location" initialDraft={{ ...readyDraft, addressLine1: "", locationCaptureMethod: "" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Enter city first" }));
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Tampa" } });
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "FL" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(replaceMock).toHaveBeenCalledWith("/onboarding/owner?step=hours");
    expect(screen.getByTestId("onboarding-readiness-summary")).toHaveTextContent("Add shop location");
  });

  it("saves full location and hours through the existing owner shop onboarding route", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ nextPath: "/onboarding/owner/structure" }));

    render(<ShopOwnerOnboardingWorkspace step="hours" initialDraft={readyDraft} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/onboarding/owner/shop", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          shopName: "BVRB3R Ybor",
          phone: "8135550103",
          address: "123 Main St, Tampa, FL, 33602",
          publicDescription: "Shop profile started through BVRB3R onboarding.",
          hours: "Monday 09:00-18:00 America/New_York"
        })
      }));
      expect(replaceMock).toHaveBeenCalledWith("/onboarding/owner?step=chair_count");
    });
  });

  it("captures capacity and disables unsupported booking modes without faking kiosk readiness", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ nextPath: "/onboarding/owner/team" }));

    const { unmount } = render(<ShopOwnerOnboardingWorkspace step="chair_count" initialDraft={{ ...readyDraft, chairRange: "", estimatedChairCount: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "4 6" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(replaceMock).toHaveBeenCalledWith("/onboarding/owner?step=operating_model");

    unmount();
    render(<ShopOwnerOnboardingWorkspace step="booking_mode" initialDraft={readyDraft} />);
    expect(screen.getByRole("button", { name: /Next available/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Shop-controlled routing/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Pick a barber/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/onboarding/owner/structure", expect.objectContaining({ method: "POST" }));
      expect(screen.getByTestId("onboarding-readiness-summary")).toHaveTextContent("Kiosk Ready");
      expect(screen.getByTestId("onboarding-readiness-summary")).not.toHaveTextContent("Kiosk ReadyProof connectedReady");
    });
  });

  it("selects payment model without marking payout or money ready", () => {
    const { container } = render(<ShopOwnerOnboardingWorkspace step="payment_model" initialDraft={readyDraft} />);

    fireEvent.click(screen.getByRole("button", { name: /AutoBooth Rent through BVRB3R Pay/i }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(container.textContent).toContain("Needs review");
    expect(container.textContent).not.toMatch(/Payout Ready[^]*Ready[^]*No missing/);
    expect(replaceMock).toHaveBeenCalledWith("/onboarding/owner?step=policies");
  });

  it("handles policies, invite copy, QR unsupported, skip, and Owner Home handoff safely", async () => {
    clipboardWrite.mockResolvedValueOnce(undefined);
    const { unmount } = render(<ShopOwnerOnboardingWorkspace step="invite_first_barber" initialDraft={readyDraft} />);

    expect(screen.getByRole("link", { name: "Text invite" })).toHaveAttribute("href", expect.stringContaining("Join%20my%20BVRB3R%20shop%20team"));
    fireEvent.click(screen.getByRole("button", { name: "Copy invite" }));
    await waitFor(() => {
      expect(clipboardWrite).toHaveBeenCalledWith("http://localhost:3000/shop/bvrb3r-ybor/team");
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Show QR code" }));
    expect(screen.getByText("QR coming soon. Copy or text the invite link for now.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    expect(replaceMock).toHaveBeenCalledWith("/onboarding/owner?step=home_handoff");

    unmount();
    render(<ShopOwnerOnboardingWorkspace step="home_handoff" initialDraft={{
      ...readyDraft,
      paymentModel: "setup_later",
      inviteSkipped: true,
      verificationPosture: "pending"
    }} />);

    expect(screen.getByRole("link", { name: "Enter Owner Home" })).toHaveAttribute("href", "/dashboard/owner");
    expect(screen.getByText(/Invite your first barber/)).toBeInTheDocument();
    expect(screen.getByText(/Finish shop money setup/)).toBeInTheDocument();
    expect(screen.getByText(/Complete shop verification/)).toBeInTheDocument();
  });
});
