import { render, screen } from "@testing-library/react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDefaultRouteForUser, resolveDemoUser } from "@/lib/auth/demo-auth";

describe("dashboard shell identity and navigation", () => {
  it.each([
    ["owner@bvrb3r.demo", "Brandon Rivers", "Shop Owner", "Active role: Shop owner", ["Overview", "Team", "Schedule", "Money", "Settings"]],
    ["manager@bvrb3r.demo", "Mia Torres", "Shop Manager", "Active role: Shop manager", ["Dashboard", "Schedule", "Team", "Queue", "Profile"]],
    ["frontdesk@bvrb3r.demo", "Kayla Brooks", "Front Desk / Kiosk Ops", "Active role: Front desk", ["Check-in", "Waitlist", "Schedule", "Barbers", "Profile"]],
    ["wave@bvrb3r.demo", "Wave Carter", "Barber Manager", "Active role: Barber manager", ["Dashboard", "Schedule", "Team", "Queue", "Profile"]],
    ["blaze@bvrb3r.demo", "Blaze King", "Booth-Rent Barber", null, ["Calendar", "Checkout", "Profile", "Messages", "More"]],
    ["lux@bvrb3r.demo", "Luxe Reed", "Freelance Barber", null, ["Calendar", "Checkout", "Profile", "Messages", "More"]],
    ["client@bvrb3r.demo", "Jordan Ellis", "Client", "Active role: Client", ["Home", "Search", "Activity", "Messages", "Profile"]]
  ])("renders the selected identity for %s", (email, name, title, roleLabel, navLabels) => {
    const user = resolveDemoUser(email);
    const activeHref = getDefaultRouteForUser(user);

    render(
      <DashboardShell user={user} activeHref={activeHref} title="Workspace" subtitle="Testing shell identity.">
        <div>Workspace body</div>
      </DashboardShell>
    );

    expect(screen.getByTestId("shell-identity-name")).toHaveTextContent(name);
    expect(screen.getByTestId("shell-identity-title")).toHaveTextContent(title);
    if (roleLabel) {
      expect(screen.getByTestId("shell-identity-role")).toHaveTextContent(roleLabel);
    } else {
      expect(screen.queryByTestId("shell-identity-role")).not.toBeInTheDocument();
    }

    navLabels.forEach((label, index) => {
      const links = screen.getAllByRole("link", { name: new RegExp(label, "i") });
      expect(links.length).toBeGreaterThan(0);
      if (index === 0) {
        expect(links.some((link) => link.getAttribute("href") === activeHref && link.getAttribute("aria-current") === "page")).toBe(true);
      }
    });

    if (email !== "owner@bvrb3r.demo") {
      expect(screen.queryByText("Money")).not.toBeInTheDocument();
      expect(screen.queryByText("Brandon Rivers")).not.toBeInTheDocument();
    }
  });

  it("shows the canonical saved shop name as the owner business identity", () => {
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

    expect(screen.getByTestId("shell-business-name")).toHaveTextContent("Phillip's Fresh Cuts");
    expect(screen.getByTestId("shell-identity-name")).toHaveTextContent("Phillip Mcgee");
    expect(screen.getByTestId("shell-identity-role")).toHaveTextContent("Active role: Shop owner");
    expect(screen.getAllByText("Phillip's Fresh Cuts").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("shell-business-name")).not.toHaveTextContent("BVRB3R Platform");
  });

  it("locks barber primary navigation to five tabs only", () => {
    const user = resolveDemoUser("blaze@bvrb3r.demo");

    render(
      <DashboardShell user={user} activeHref="/dashboard/barber" title="Calendar" subtitle="Testing barber tabs.">
        <div>Workspace body</div>
      </DashboardShell>
    );

    ["Calendar", "Checkout", "Profile", "Messages", "More"].forEach((label) => {
      expect(screen.getAllByRole("link", { name: new RegExp(label, "i") }).length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole("link", { name: /home/i })).not.toBeInTheDocument();
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

    ["Overview", "Team", "Schedule", "Money", "Settings"].forEach((label) => {
      expect(screen.getAllByRole("link", { name: new RegExp(label, "i") }).length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /finance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /staff/i })).not.toBeInTheDocument();
    expect(screen.getByText("5 tabs")).toBeInTheDocument();
    expect(screen.getByText("5 owner tabs")).toBeInTheDocument();
  });

  it("locks client primary navigation to five tabs only", () => {
    const user = resolveDemoUser("client@bvrb3r.demo");

    render(
      <DashboardShell user={user} activeHref="/dashboard/client" title="Home" subtitle="Testing client tabs.">
        <div>Workspace body</div>
      </DashboardShell>
    );

    ["Home", "Search", "Activity", "Messages", "Profile"].forEach((label) => {
      expect(screen.getAllByRole("link", { name: new RegExp(label, "i") }).length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole("link", { name: /wallet/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /rewards/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /referrals/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /bookings/i })).not.toBeInTheDocument();
    expect(screen.getByText("5 tabs")).toBeInTheDocument();
    expect(screen.getByText("5 client tabs")).toBeInTheDocument();
  });

});
