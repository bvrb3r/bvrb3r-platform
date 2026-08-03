import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppMarketingPage from "@/app/app/page";
import ForBarbersPage from "@/app/for-barbers/page";
import ForShopsPage from "@/app/for-shops/page";
import PricingPage from "@/app/(marketing)/pricing/page";
import { CinematicEffects } from "@/components/public-site/cinematic-effects";
import { CinematicHome } from "@/components/public-site/cinematic-home";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PR 21 public site", () => {
  it("renders crawler-visible cinematic copy and canonical conversion links", () => {
    render(<CinematicHome />);

    expect(screen.getByRole("heading", { level: 1, name: "Every great cut starts with a spin." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The BVRB3R app just hit the industry." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Everything the shop runs on." })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Book a cut" })).toHaveLength(2);
    for (const link of screen.getAllByRole("link", { name: "Book a cut" })) {
      expect(link).toHaveAttribute("href", "/booking/new");
    }
    expect(screen.getAllByRole("link", { name: "Enter as guest" }).at(-1)).toHaveAttribute(
      "href",
      "/discover?entry=guest"
    );
    expect(screen.getByText("Client Standard $0 · Nothing to install · Guest browsing stays open")).toBeInTheDocument();
  });

  it("does not start the scroll animation when reduced motion is requested", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      })
    });
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame");

    const { container } = render(<CinematicEffects />);

    expect(container.firstElementChild).toHaveAttribute("data-reduced-motion", "true");
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("limits owner-review mode to the closing action without replacing public closing copy", () => {
    render(<CinematicHome signupEnabled={false} />);

    expect(screen.getByRole("heading", { name: "Your next cut is already waiting." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Owner review sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByText("Private production review · Approved test accounts only")).toBeInTheDocument();
  });

  it("keeps the client marketing route connected to guest discovery and booking", () => {
    render(<AppMarketingPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("The cut you want. The chair that’s ready.");
    expect(screen.getAllByRole("link", { name: "Book a cut" })[0]).toHaveAttribute("href", "/booking/new");
    expect(screen.getAllByRole("link", { name: "Enter as guest" })[0]).toHaveAttribute("href", "/discover?entry=guest");
    expect(screen.getByText("Find. Book. Sit.")).toBeInTheDocument();
    expect(screen.getByText("Client Standard is $0. Guests can also explore barbers, shops, and Culture before creating a saved client lane.")).toBeInTheDocument();
  });

  it("keeps barber and owner conversion lanes explicit and doctrine-aligned", () => {
    const barber = render(<ForBarbersPage />);

    expect(screen.getAllByRole("link", { name: "Sign up as a barber" })[0]).toHaveAttribute(
      "href",
      "/signup?lane=barber"
    );
    expect(screen.getByText(/Full Booth Rent and AutoBooth Rent are the only supported models/)).toBeInTheDocument();
    expect(screen.getAllByText(/5% of eligible transactions/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/100% of the client-confirmed tip belongs to the barber/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Payout timing depends on Stripe Connect account eligibility, settlement, payout schedule, risk holds, weekends, and bank timing/)).toBeInTheDocument();
    barber.unmount();

    render(<ForShopsPage />);

    expect(screen.getAllByRole("link", { name: "Sign up as a shop owner" })[0]).toHaveAttribute(
      "href",
      "/signup?lane=shop_owner"
    );
    expect(screen.getByText(/Full Booth Rent and AutoBooth Rent are the only financial models/)).toBeInTheDocument();
    expect(screen.getByText(/Owner money reports show booth rent billed, paid, and outstanding/)).toBeInTheDocument();
    expect(screen.getByText("Owner money reports exclude barber service proceeds and tips")).toBeInTheDocument();
  });

  it("publishes Standard $0 and qualified transaction disclosures on pricing", () => {
    render(<PricingPage />);

    expect(screen.getByText(/Client Standard is \$0\. Barber Standard and Shop Owner Standard are also \$0/)).toBeInTheDocument();
    expect(screen.getAllByText("$0")).toHaveLength(3);
    expect(screen.getByText(/The BVRB3R platform fee is 5% of eligible transactions/)).toBeInTheDocument();
    expect(screen.getByText(/100% of the client-confirmed tip belongs to the barber/)).toBeInTheDocument();
    expect(screen.getByText(/Payout timing depends on Stripe Connect account eligibility, settlement, payout schedule, risk holds, weekends, and bank timing/)).toBeInTheDocument();
  });
});
