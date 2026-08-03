import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerLaunchConsole } from "@/components/prelaunch/owner-launch-console";
import { PublicComingSoonShop } from "@/components/prelaunch/public-coming-soon-shop";
import type { Pr36OwnerLaunchConsole, Pr36PublicPrelaunch } from "@/lib/shops/pr36-prelaunch-domain";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

const publicPrelaunch: Pr36PublicPrelaunch = {
  shopId: "southside",
  slug: "southsidechophouse",
  name: "Southside Chop House",
  addressLine: "1204 S MacDill Ave, Tampa, FL",
  openingAt: "2026-08-15T14:00:00.000Z",
  bookingHeadStartAt: "2026-08-14T14:00:00.000Z",
  phase: "prelaunch",
  waitlistCount: 142,
  viewerPosition: null,
  foundingTeam: [{
    profileId: "profile-barber-1",
    name: "Marcus Fade",
    username: "fadegod_marcus",
    href: "/barber/fadegod_marcus"
  }],
  foundingChairCount: 1,
  chairCapacity: 6,
  joinChairHref: "/dashboard/barber/setup",
  publicShopHref: "/shop/southside",
  paymentAllowed: false
};

const ownerConsole: Pr36OwnerLaunchConsole = {
  configured: true,
  shopId: "southside",
  slug: "southsidechophouse",
  name: "Southside Chop House",
  openingAt: "2026-08-15T14:00:00.000Z",
  bookingHeadStartAt: "2026-08-14T14:00:00.000Z",
  status: "prelaunch",
  phase: "prelaunch",
  version: 2,
  waitlistCount: 142,
  foundingChairCount: 5,
  chairCapacity: 6,
  pageVisits: 1204,
  checks: [
    { key: "identity", label: "Shop identity & address verified", detail: "Verified", green: true, href: "/shop/verify", action: "View" },
    { key: "stripe", label: "Stripe connected", detail: "Ready", green: true, href: "/shop/money", action: "View" },
    { key: "policies", label: "Policies published", detail: "Stored", green: true, href: "/shop/policies", action: "View" },
    { key: "hours", label: "Opening hours set", detail: "Stored", green: true, href: "/shop/identity", action: "View" },
    { key: "team", label: "Founding team — 5 / 6 chairs claimed", detail: "1 founding chair still open.", green: false, href: "/shop/team", action: "Invite" },
    { key: "kiosk", label: "Kiosk paired & tested", detail: "Verified", green: true, href: "/shop/kiosk", action: "View" }
  ],
  allGreen: false,
  canGoLive: false,
  goLiveReason: "1 launch check still needs real evidence.",
  publicPageHref: "/s/southsidechophouse"
};

describe("Product PR36 shop prelaunch surfaces", () => {
  beforeEach(() => refreshMock.mockReset());

  it("shows real founding profile links, join order, and no preopening checkout", () => {
    render(<PublicComingSoonShop initial={publicPrelaunch} />);

    expect(screen.getByRole("heading", { name: "Southside Chop House" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "@fadegod_marcus" })).toHaveAttribute("href", "/barber/fadegod_marcus");
    expect(screen.getByRole("link", { name: /claim a founding chair/i })).toHaveAttribute("href", "/dashboard/barber/setup");
    expect(screen.getByText(/142 people on the opening waitlist/i)).toBeInTheDocument();
    expect(screen.getByText(/no payment before opening day, ever/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/card number/i)).not.toBeInTheDocument();
  });

  it("shows the exact stored position to an already waitlisted viewer", () => {
    render(<PublicComingSoonShop initial={{ ...publicPrelaunch, viewerPosition: 23 }} />);
    expect(screen.getByText("You’re 23rd in line.")).toBeInTheDocument();
    expect(screen.getByText(/exactly 24 hours before public opening/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /leave waitlist and revoke consent/i })).toBeEnabled();
  });

  it("keeps Go live disabled until every real check is green", () => {
    render(<OwnerLaunchConsole initial={ownerConsole} />);
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText("1,204")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Invite" })).toHaveAttribute("href", "/shop/team");
    expect(screen.getByRole("button", { name: "Go live — 1 item left" })).toBeDisabled();
    expect(screen.getByText(/payment authorization stays server-blocked/i)).toBeInTheDocument();
  });
});
