import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountPrivacyWorkspace } from "@/components/trust/account-privacy-workspace";
import { BarberSetupChecklistWorkspace } from "@/components/trust/barber-setup-checklist-workspace";
import { CultureSafetyWorkspace } from "@/components/trust/culture-safety-workspace";
import { buildPr27BarberSetup } from "@/lib/trust/product-pr27-domain";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Product PR27 redesign surfaces", () => {
  it("renders the exact eight-step Barber setup hierarchy and server-owned go-live gate", () => {
    const setup = buildPr27BarberSetup({
      public_profile: "done",
      services_prices: "done",
      license_verification: "done",
      stripe_payouts: "done",
      shop_link_or_independent: "in_review"
    });
    render(<BarberSetupChecklistWorkspace initial={{
      ...setup,
      firstName: "Phil",
      live: false,
      demo: true
    }} />);

    expect(screen.getByRole("heading", { name: /let’s get your chair live/i })).toBeInTheDocument();
    expect(screen.getByText("Public profile")).toBeInTheDocument();
    expect(screen.getByText("Services & prices")).toBeInTheDocument();
    expect(screen.getByText("License verification")).toBeInTheDocument();
    expect(screen.getByText("Payouts (Stripe)")).toBeInTheDocument();
    expect(screen.getByText("Shop link or independent")).toBeInTheDocument();
    expect(screen.getByText(/ChairSync · optional/)).toBeInTheDocument();
    expect(screen.getByText(/Portfolio & Culture · optional/)).toBeInTheDocument();
    expect(screen.getByText(/Chair QR \/ NFC · optional/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify & activate →" })).toBeDisabled();
    expect(screen.getByRole("link", { name: /Profile photo & portfolio/i })).toHaveAttribute(
      "href",
      "/dashboard/barber/profile?section=portfolio"
    );
    expect(screen.getByRole("link", { name: /Bookable services/i })).toHaveAttribute(
      "href",
      "/dashboard/barber/services"
    );
    expect(screen.getByRole("link", { name: /Operational availability/i })).toHaveAttribute(
      "href",
      "/dashboard/barber/more?section=availability"
    );
    expect(screen.getByRole("link", { name: /Business visibility/i })).toHaveAttribute(
      "href",
      "/dashboard/barber/more?section=visibility"
    );
    expect(screen.getByText(/never marks you live by itself/i)).toBeInTheDocument();
  });

  it("does not claim live when the activation response lacks canonical Road confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ live: true, marketplaceProfileComplete: false })
    }));
    const setup = buildPr27BarberSetup({
      public_profile: "done",
      services_prices: "done",
      license_verification: "done",
      stripe_payouts: "done",
      shop_link_or_independent: "done"
    });
    render(<BarberSetupChecklistWorkspace initial={{
      ...setup,
      firstName: "Phil",
      live: false,
      demo: false,
      canRequestActivation: true,
      marketplaceProfileComplete: false
    }} />);

    fireEvent.click(screen.getByRole("button", { name: "Verify & activate →" }));

    expect(await screen.findByText(/Activation was not confirmed by canonical Road setup truth/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marketplace live ✓" })).not.toBeInTheDocument();
  });

  it("shows the Account Privacy export, deactivation, and open-booking deletion states", () => {
    render(<AccountPrivacyWorkspace initial={{
      demo: true,
      firstName: "Phil",
      memberSince: "2024",
      visitCount: 31,
      openBookingCount: 1,
      lifecycle: { status: "active", deletionGraceEndsAt: null, canRestore: false },
      exports: []
    }} />);

    expect(screen.getByRole("heading", { name: /privacy & account/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    expect(screen.getByRole("heading", { name: /what deletion means/i })).toBeInTheDocument();
    expect(screen.getByText(/1 upcoming appointment found/i)).toBeInTheDocument();
    expect(screen.getByText(/sealed legal money records only/i)).toBeInTheDocument();
  });

  it("submits a Culture report and presents the human-review receipt state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reference: "CUL-4471", status: "received", autoHidden: false })
    }));
    render(<CultureSafetyWorkspace
      initial={{
        demo: true,
        blockedAccounts: [],
        mutedAccounts: [],
        reports: [],
        appeals: [],
        standing: {
          activeStrikeCount: 0,
          enforcement: "clear",
          postingPausedUntil: null,
          bookingAndMoneyUnaffected: true
        }
      }}
      initialTargetProfileId="target-profile"
      initialPostId="post-1"
    />);

    expect(screen.getByRole("heading", { name: /say what’s wrong/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Harassment →" }));
    expect(await screen.findByRole("heading", { name: /we’re on it/i })).toBeInTheDocument();
    expect(screen.getByText(/Ref CUL-4471/i)).toBeInTheDocument();
    expect(screen.queryByText(/reviewed by a human/i)).not.toBeInTheDocument();
  });

  it("keeps the strike ladder explicitly separate from booking and money", () => {
    render(<CultureSafetyWorkspace
      initial={{
        demo: true,
        blockedAccounts: [],
        mutedAccounts: [],
        reports: [],
        appeals: [],
        standing: {
          activeStrikeCount: 2,
          enforcement: "posting_pause",
          postingPausedUntil: "2026-08-05T12:00:00.000Z",
          bookingAndMoneyUnaffected: true
        }
      }}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Strikes" }));
    expect(screen.getByText(/Strike 1: warning. Strike 2: 7-day posting pause. Strike 3: Culture ban/i)).toBeInTheDocument();
    expect(screen.getByText(/does not touch booking or money/i)).toBeInTheDocument();
  });
});
