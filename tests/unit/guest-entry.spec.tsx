import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/guest/route";
import { ClientAppShell } from "@/components/client-experience/client-app-shell";
import { createGuestSessionValue, GUEST_SESSION_COOKIE, isGuestSessionCookieValue } from "@/lib/guest/session";

describe("guest entry", () => {
  it("starts an ephemeral guest session and redirects to discovery without creating auth state", async () => {
    const response = await GET(new Request("https://www.bvrb3r.app/guest"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://www.bvrb3r.app/discover?entry=guest");

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${GUEST_SESSION_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie).not.toContain("sb-");
  });

  it("recognizes only guest-mode cookie values as guest sessions", () => {
    expect(isGuestSessionCookieValue(createGuestSessionValue("homepage"))).toBe(true);
    expect(isGuestSessionCookieValue("guest")).toBe(true);
    expect(isGuestSessionCookieValue(JSON.stringify({ mode: "client" }))).toBe(false);
    expect(isGuestSessionCookieValue(undefined)).toBe(false);
  });

  it("renders exploration-only navigation for guests instead of account-only areas", () => {
    render(
      <ClientAppShell activeTab="search" mode="guest">
        <div>Guest discovery body</div>
      </ClientAppShell>
    );

    expect(screen.getByRole("link", { name: "BV BVRB3R" })).toHaveAttribute("href", "/discover?entry=guest");
    expect(screen.getByRole("navigation", { name: "Guest mobile navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute("href", "/discover?entry=guest");
    expect(screen.getByRole("link", { name: "Book" })).toHaveAttribute("href", "/booking/new?source=guest_discovery");
    expect(screen.queryByRole("link", { name: "Rewards" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Open messages")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Open profile")).not.toBeInTheDocument();
  });
});
