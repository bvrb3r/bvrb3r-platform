import { render, screen } from "@testing-library/react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDefaultRouteForUser, resolveDemoUser } from "@/lib/auth/demo-auth";

describe("dashboard shell identity and navigation", () => {
  it.each([
    ["owner@bvrb3r.demo", "Brandon Rivers", "Shop Owner", "Active role: Shop owner", ["Dashboard", "Team", "Schedule", "Money", "Settings"]],
    ["manager@bvrb3r.demo", "Mia Torres", "Shop Manager", "Active role: Shop manager", ["Dashboard", "Schedule", "Team", "Queue", "Profile"]],
    ["frontdesk@bvrb3r.demo", "Kayla Brooks", "Front Desk / Kiosk Ops", "Active role: Front desk", ["Check-in", "Waitlist", "Schedule", "Barbers", "Profile"]],
    ["wave@bvrb3r.demo", "Wave Carter", "Barber Manager", "Active role: Barber manager", ["Dashboard", "Schedule", "Team", "Queue", "Profile"]],
    ["blaze@bvrb3r.demo", "Blaze King", "Booth-Rent Barber", "Active role: Booth-rent barber", ["Home", "Command", "Earnings", "Clients", "Profile", "Settings"]],
    ["lux@bvrb3r.demo", "Luxe Reed", "Freelance Barber", "Active role: Freelance barber", ["Home", "Command", "Earnings", "Clients", "Profile", "Settings"]],
    ["client@bvrb3r.demo", "Jordan Ellis", "Client", "Active role: Client", ["Home", "Search", "Bookings", "Rewards", "Profile", "Settings"]]
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
    expect(screen.getByTestId("shell-identity-role")).toHaveTextContent(roleLabel);

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

});
