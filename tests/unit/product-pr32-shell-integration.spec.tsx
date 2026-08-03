import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GlobalSafetyState } from "@/components/ui/global-safety-state";

function source(relativePath: string) {
  return readFileSync(relativePath, "utf8");
}

describe("Product PR32 shell integration", () => {
  it("serves private Road summaries from authenticated server truth", () => {
    const route = source("app/api/road/summary/route.ts");
    const widget = source("components/road/road-home-widget.tsx");

    expect(route).toContain("getCurrentUserFromServer");
    expect(route).toContain("isRoadRole(session.user.role)");
    expect(route).toContain("loadRoadSnapshot(session.user)");
    expect(route).toContain('"Cache-Control": "private, no-store, max-age=0"');
    expect(route).toContain('Vary: "Cookie"');
    expect(widget).toContain('fetch("/api/road/summary"');
    expect(widget).toContain('cache: "no-store"');
    expect(widget).toContain("No progress was guessed");
  });

  it("places the Road widget on all three role homes after their primary truth", () => {
    const client = source("components/client-experience/client-home-screen.tsx");
    const barber = source("components/operations/barber-schedule-workspace.tsx");
    const owner = source("components/operations/owner-operations-workspace.tsx");

    expect(client).toContain("<RoadHomeWidget compact={Boolean(nextAppointment)} />");
    expect(barber).toContain("<RoadHomeWidget compact={Boolean(currentOrNextAppointmentId)} />");
    expect(owner).toContain('<RoadHomeWidget tone="gold" className="mt-4" />');
    expect(barber).toContain("<KioskLaunchAction");
    expect(barber).toContain("Kiosk Mode");
  });

  it("deep-links the exact client appointment and exposes the real referral route", () => {
    const home = source("components/client-experience/client-home-screen.tsx");
    const activity = source("components/client-experience/client-bookings-screen.tsx");
    const more = source("components/client-experience/client-profile-screen.tsx");
    const road = source("components/road/road-screen.tsx");

    expect(home).toContain("query: { appointment: nextAppointment.id }");
    expect(home).toContain("View details");
    expect(activity).toContain('searchParams.get("appointment")');
    expect(activity).toContain("upcomingAppointments.some");
    expect(activity).toContain("data-focused-appointment");
    expect(more).toContain('href: "/road#road-referrals"');
    expect(more).toContain('title: "Invite friends"');
    expect(road).toContain('id="road-referrals"');
  });

  it("connects owner team controls to live rent and settle-first relationship paths", () => {
    const owner = source("components/operations/owner-operations-workspace.tsx");
    const rent = source("components/rent/rent-operations-workspace.tsx");
    const page = source("app/(platform)/dashboard/owner/rent/page.tsx");

    expect(owner).toContain("new URLSearchParams({ shopId: data.scope.shopId })");
    expect(owner).toContain('fetch(`/api/rent?${query.toString()}`');
    expect(owner).toContain('cache: "no-store"');
    expect(owner).toContain('role="switch"');
    expect(owner).toContain("Kiosk and walk-ins skip this chair. Booked appointments are honored. Rent is unchanged.");
    expect(owner).toContain("Adjust terms");
    expect(owner).toContain("Message");
    expect(owner).toContain("Remove barber");
    expect(owner).toContain("Settle-first is enforced by the server");
    expect(rent).toContain("preferredBarberId");
    expect(page).toContain("preferredBarberId={rawBarberId ?? null}");
  });

  it("keeps future doors visible and honest while recognizing live gift cards", () => {
    const gates = source("components/road/road-future-gates.tsx");
    const client = source("components/client-experience/client-profile-screen.tsx");
    const barber = source("components/barber-experience/barber-settings-screen.tsx");
    const owner = source("components/operations/owner-settings-workspace.tsx");

    expect(gates).toContain("FeatureGateTease");
    expect(gates).toContain('data-future-door-graduated="owner.gift-cards"');
    expect(gates).toMatch(/href=(?:\"\\/gift-cards\"|\\{\"\\/gift-cards\" as Route\\})/);
    expect(client).toContain('<RoadFutureGates role="client_user" />');
    expect(barber).toContain('<RoadFutureGates role="barber_user" />');
    expect(owner).toContain('<RoadFutureGates role="shop_owner_user" />');
  });

  it("renders reusable access-denied truth with a one-tap safe return", () => {
    render(<GlobalSafetyState state="access_denied" actionHref="/dashboard/client" />);

    expect(screen.getByRole("heading", { name: "This isn't your door." })).toBeInTheDocument();
    expect(screen.getByText(/row-level security remains enforced/i)).toBeInTheDocument();
    expect(screen.getByText(/denied attempt was logged/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Return to your home/ })).toHaveAttribute("href", "/dashboard/client");
  });

  it("audits wrong-role denials and preserves shell safety affordances", () => {
    const guard = source("lib/auth/guards.ts");
    const denied = source("app/access-denied/page.tsx");
    const messages = source("components/messages/messaging-inbox-screen.tsx");
    const clientHeader = source("components/client-experience/client-app-header.tsx");

    expect(guard).toContain('action: "wrong_role_access_denied"');
    expect(guard).toContain('outcome: "denied"');
    expect(guard).toContain('redirect("/access-denied")');
    expect(denied).toContain("getDefaultRouteForUser(session.user)");
    expect(messages).toContain('className="max-h-28 min-h-10 min-w-0 flex-1');
    expect(clientHeader).toContain('notificationsHref="/notifications"');
    expect(clientHeader).toContain('fetch("/api/notifications"');
    expect(clientHeader).toContain("notificationUnreadCount={notificationItems.filter");
  });
});
