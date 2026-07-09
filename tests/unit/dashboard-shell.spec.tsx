import { fireEvent, render, screen } from "@testing-library/react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDefaultRouteForUser, resolveDemoUser } from "@/lib/auth/demo-auth";

describe("dashboard shell identity and navigation", () => {
  it.each([
    ["owner@bvrb3r.demo", "Owner account", ["Home", "Schedule", "Money", "Messages", "More"]],
    ["manager@bvrb3r.demo", "Shop manager workspace", ["Dashboard", "Schedule", "Team", "Queue", "Profile"]],
    ["frontdesk@bvrb3r.demo", "Front desk workspace", ["Check-in", "Waitlist", "Schedule", "Barbers", "Profile"]],
    ["wave@bvrb3r.demo", "Barber manager workspace", ["Dashboard", "Schedule", "Team", "Queue", "Profile"]],
    ["blaze@bvrb3r.demo", "Professional account", ["Home", "Checkout", "Profile", "Messages", "More"]],
    ["lux@bvrb3r.demo", "Professional account", ["Home", "Checkout", "Profile", "Messages", "More"]],
    ["client@bvrb3r.demo", "Search, book, and manage visits", ["Home", "Search", "Culture", "Messages", "Account"]]
  ])("renders the platform shell identity for %s", (email, expectedSubtitle, navLabels) => {
    const user = resolveDemoUser(email);
    const activeHref = getDefaultRouteForUser(user);

    render(
      <DashboardShell user={user} activeHref={activeHref} title="Workspace" subtitle="Testing shell identity.">
        <div>Workspace body</div>
      </DashboardShell>
    );

    expect(screen.getByTestId("shell-business-name")).toHaveTextContent("BVRB3R");
    expect(screen.getByTestId("shell-identity-name")).toHaveTextContent(expectedSubtitle);
    expect(screen.getByTestId("shell-identity-title")).toHaveTextContent("Unified dashboard");
    expect(screen.queryByTestId("shell-identity-role")).not.toBeInTheDocument();

    navLabels.forEach((label, index) => {
      const links = screen.getAllByRole("link", { name: new RegExp(label, "i") });
      expect(links.length).toBeGreaterThan(0);
      if (index === 0) {
        expect(links.some((link) => link.getAttribute("href") === activeHref && link.getAttribute("aria-current") === "page")).toBe(true);
      }
    });

    expect(screen.queryByText("Brandon Rivers")).not.toBeInTheDocument();
  });

  it("keeps owner shop identity out of the global shell header", () => {
    const user = {
      ...resolveDemoUser("owner@bvrb3r.demo"),
      name: "Phillip Mcgee",
      canonicalFullName: "Phillip Mcgee",
      title: "Shop Owner",
      ownedShopId: "shop-phillip",
      ownedShopName: "Phillip's Fresh Cuts",
      locationIds: ["shop-phillip"]
    };

    render(
      <DashboardShell user={user} activeHref="/dashboard/owner" title="Phillip's Fresh Cuts" subtitle="Testing owner identity.">
        <div>Workspace body</div>
      </DashboardShell>
    );

    expect(screen.getByTestId("shell-business-name")).toHaveTextContent("BVRB3R");
    expect(screen.getByTestId("shell-identity-name")).toHaveTextContent("Owner account");
    expect(screen.queryByTestId("shell-identity-role")).not.toBeInTheDocument();
    expect(screen.getByTestId("shell-mobile-business-name")).toHaveTextContent("Owner account");
  });

  it("locks barber primary navigation to five tabs only", () => {
    const user = resolveDemoUser("blaze@bvrb3r.demo");

    render(
      <DashboardShell user={user} activeHref="/dashboard/barber" title="Calendar" subtitle="Testing barber tabs.">
        <div>Workspace body</div>
      </DashboardShell>
    );

    ["Home", "Checkout", "Profile", "Messages", "More"].forEach((label) => {
      expect(screen.getAllByRole("link", { name: new RegExp(label, "i") }).length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole("link", { name: /calendar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /command/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /earnings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /clients/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /appointments/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /availability/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /services/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /payouts/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /reviews/i })).not.toBeInTheDocument();
    expect(screen.getByText("5 tabs")).toBeInTheDocument();
    expect(screen.queryByText("5 barber tabs")).not.toBeInTheDocument();
    expect(screen.queryByText("Operating as")).not.toBeInTheDocument();
    expect(screen.queryByText("Barber operating lane")).not.toBeInTheDocument();
    expect(screen.queryByText("Chair territory")).not.toBeInTheDocument();
  });

  it("locks owner primary navigation to five tabs only", () => {
    const user = resolveDemoUser("owner@bvrb3r.demo");

    render(
      <DashboardShell user={user} activeHref="/dashboard/owner" title="Overview" subtitle="Testing owner tabs.">
        <div>Workspace body</div>
      </DashboardShell>
    );

    ["Home", "Schedule", "Money", "Messages", "More"].forEach((label) => {
      expect(screen.getAllByRole("link", { name: new RegExp(label, "i") }).length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /overview/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /finance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /staff/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^team$/i })).not.toBeInTheDocument();
    expect(screen.getByText("5 tabs")).toBeInTheDocument();
    expect(screen.getByText("5 owner tabs")).toBeInTheDocument();
  });

  it("renders owner header actions with messages and More routes", () => {
    const user = resolveDemoUser("owner@bvrb3r.demo");

    render(
      <DashboardShell user={user} activeHref="/dashboard/owner" title="Home" subtitle="Testing owner header.">
        <div>Workspace body</div>
      </DashboardShell>
    );

    const actions = Array.from(screen.getByRole("group", { name: "Header actions" }).querySelectorAll("button,a"));
    expect(actions.map((action) => action.getAttribute("aria-label"))).toEqual([
      "Open notifications",
      "Open messages",
      "Open profile"
    ]);
    expect(screen.getByTestId("shell-mobile-business-name")).toHaveTextContent("Owner account");
    expect(screen.queryByTestId("shell-mobile-identity-name")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shell-mobile-identity-role")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open messages" })).toHaveAttribute("href", "/dashboard/owner/messages");
    expect(screen.getByRole("link", { name: "Open profile" })).toHaveAttribute("href", "/dashboard/owner/more");
  });

  it("renders barber header actions with messages and More routes", () => {
    const user = resolveDemoUser("blaze@bvrb3r.demo");

    render(
      <DashboardShell user={user} activeHref="/dashboard/barber" title="Home" subtitle="Testing barber header.">
        <div>Workspace body</div>
      </DashboardShell>
    );

    const actions = Array.from(screen.getByRole("group", { name: "Header actions" }).querySelectorAll("button,a"));
    expect(actions.map((action) => action.getAttribute("aria-label"))).toEqual([
      "Open notifications",
      "Open messages",
      "Open profile"
    ]);
    expect(screen.getByTestId("shell-mobile-business-name")).toHaveTextContent("Professional account");
    expect(screen.getByRole("link", { name: "Open messages" })).toHaveAttribute("href", "/dashboard/barber/messages");
    expect(screen.getByRole("link", { name: "Open profile" })).toHaveAttribute("href", "/dashboard/barber/more");
  });

  it("renders client, barber, and owner platform subtitles without business-card copy", () => {
    const client = resolveDemoUser("client@bvrb3r.demo");
    const barber = resolveDemoUser("blaze@bvrb3r.demo");
    const owner = {
      ...resolveDemoUser("owner@bvrb3r.demo"),
      name: "Phillip Mcgee",
      ownedShopName: "The BVRB3R™ Shop (University Mall)"
    };

    const { rerender } = render(
      <DashboardShell user={client} activeHref="/dashboard/client" title="Home" subtitle="Testing client header.">
        <div>Workspace body</div>
      </DashboardShell>
    );

    expect(screen.getByTestId("shell-mobile-business-name")).toHaveTextContent("Search, book, and manage visits");

    rerender(
      <DashboardShell user={barber} activeHref="/dashboard/barber" title="Home" subtitle="Testing barber header.">
        <div>Workspace body</div>
      </DashboardShell>
    );

    expect(screen.getByTestId("shell-mobile-business-name")).toHaveTextContent("Professional account");
    expect(screen.getByTestId("shell-mobile-business-name")).not.toHaveTextContent("Freelance barber workspace");
    expect(screen.getByTestId("shell-mobile-business-name")).not.toHaveTextContent("Shop barber workspace");

    rerender(
      <DashboardShell user={owner} activeHref="/dashboard/owner" title="Home" subtitle="Testing owner header.">
        <div>Workspace body</div>
      </DashboardShell>
    );

    expect(screen.getByTestId("shell-mobile-business-name")).toHaveTextContent("Owner account");
    expect(screen.getByTestId("shell-mobile-business-name")).not.toHaveTextContent("The BVRB3R™ Shop (University Mall)");
    expect(screen.queryByTestId("shell-mobile-identity-name")).not.toBeInTheDocument();
    expect(screen.queryByTestId("shell-mobile-identity-role")).not.toBeInTheDocument();
  });

  it("routes persistent approval warnings into the Bell and More attention dots", () => {
    const user = {
      ...resolveDemoUser("blaze@bvrb3r.demo"),
      appApprovalStatus: "pending" as const
    };

    render(
      <DashboardShell user={user} activeHref="/dashboard/barber" title="Home" subtitle="Testing barber header.">
        <div>Workspace body</div>
      </DashboardShell>
    );

    expect(screen.getByLabelText("1 unread notifications")).toHaveClass("bg-[#ffd166]");
    expect(screen.getByLabelText("1 account attention items")).toHaveClass("bg-[#ffd166]");

    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    expect(screen.getByText("VERIFICATION")).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
    expect(screen.getByText("This barber account is not publicly live yet.")).toBeInTheDocument();
  });

  it("routes supplied Stripe payout warnings into the Bell as yellow notifications", () => {
    const user = resolveDemoUser("blaze@bvrb3r.demo");

    render(
      <DashboardShell
        user={user}
        activeHref="/dashboard/barber/more"
        title="More"
        subtitle="Testing barber notifications."
        headerNotificationItems={[
          {
            id: "stripe-test-mode-payouts",
            category: "PAYOUTS",
            severity: "warning",
            title: "Payout setup",
            body: "Stripe is in test mode. Live payouts are not active yet.",
            action: {
              label: "View payout setup",
              href: "/dashboard/barber/more#payouts"
            }
          }
        ]}
      >
        <div>Workspace body</div>
      </DashboardShell>
    );

    expect(screen.getByLabelText("1 unread notifications")).toHaveClass("bg-[#ffd166]");

    fireEvent.click(screen.getByRole("button", { name: "Open notifications" }));

    expect(screen.getByText("PAYOUTS")).toBeInTheDocument();
    expect(screen.getByText("warning")).toBeInTheDocument();
    expect(screen.getByText("Payout setup")).toBeInTheDocument();
    expect(screen.getByText("Stripe is in test mode. Live payouts are not active yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View payout setup" })).toHaveAttribute("href", "/dashboard/barber/more#payouts");
  });

  it("locks client primary navigation to five tabs only", () => {
    const user = resolveDemoUser("client@bvrb3r.demo");

    render(
      <DashboardShell user={user} activeHref="/dashboard/client" title="Home" subtitle="Testing client tabs.">
        <div>Workspace body</div>
      </DashboardShell>
    );

    ["Home", "Search", "Culture", "Messages", "Account"].forEach((label) => {
      expect(screen.getAllByRole("link", { name: new RegExp(label, "i") }).length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole("link", { name: /activity/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^profile$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /wallet/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /rewards/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /referrals/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /bookings/i })).not.toBeInTheDocument();
    expect(screen.getByText("5 tabs")).toBeInTheDocument();
    expect(screen.getByText("5 client tabs")).toBeInTheDocument();
  });

});
