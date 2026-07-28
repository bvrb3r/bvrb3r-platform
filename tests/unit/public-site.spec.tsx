import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppMarketingPage from "@/app/app/page";
import ForBarbersPage from "@/app/for-barbers/page";
import ForShopsPage from "@/app/for-shops/page";
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
    expect(screen.getByRole("link", { name: "Book a cut" })).toHaveAttribute("href", "/booking/new");
    expect(screen.getByRole("link", { name: "Join as a client" })).toHaveAttribute("href", "/signup?lane=client");
    expect(screen.getByRole("link", { name: "Sign up as a barber" })).toHaveAttribute("href", "/signup?lane=barber");
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

  it("keeps the client marketing route connected to guest discovery and booking", () => {
    render(<AppMarketingPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("The cut you want. The chair that’s ready.");
    expect(screen.getAllByRole("link", { name: "Book a cut" })[0]).toHaveAttribute("href", "/booking/new");
    expect(screen.getAllByRole("link", { name: "Enter as guest" })[0]).toHaveAttribute("href", "/discover?entry=guest");
    expect(screen.getByText("Find. Book. Sit.")).toBeInTheDocument();
  });

  it("keeps barber and owner conversion lanes explicit and doctrine-aligned", () => {
    const barber = render(<ForBarbersPage />);

    expect(screen.getAllByRole("link", { name: "Sign up as a barber" })[0]).toHaveAttribute(
      "href",
      "/signup?lane=barber"
    );
    expect(screen.getByText(/Full Booth Rent and AutoBooth Rent are the complete supported model set/)).toBeInTheDocument();
    barber.unmount();

    render(<ForShopsPage />);

    expect(screen.getAllByRole("link", { name: "Sign up as a shop owner" })[0]).toHaveAttribute(
      "href",
      "/signup?lane=shop_owner"
    );
    expect(screen.getByText(/Full Booth Rent and AutoBooth Rent are the only financial models/)).toBeInTheDocument();
  });
});
