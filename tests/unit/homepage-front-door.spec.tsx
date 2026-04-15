import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthEntryCard } from "@/components/home/auth-entry-card";
import { FinalCta } from "@/components/home/final-cta";
import { HomeHeader } from "@/components/home/home-header";
import { HomeHero } from "@/components/home/home-hero";
import { ValueStrip } from "@/components/home/value-strip";

const { replaceMock, signInWithOAuthMock, signInWithPasswordMock, createSupabaseBrowserClientMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  signInWithOAuthMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  createSupabaseBrowserClientMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock
  })
}));

vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: createSupabaseBrowserClientMock
}));

function renderHomeFrontDoor() {
  render(
    <>
      <HomeHeader />
      <HomeHero />
      <AuthEntryCard />
      <ValueStrip />
      <FinalCta />
    </>
  );
}

describe("homepage front door", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    signInWithOAuthMock.mockReset();
    signInWithPasswordMock.mockReset();
    createSupabaseBrowserClientMock.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    createSupabaseBrowserClientMock.mockReturnValue({
      auth: {
        signInWithOAuth: signInWithOAuthMock,
        signInWithPassword: signInWithPasswordMock
      }
    });
    signInWithOAuthMock.mockResolvedValue({ error: null });
    signInWithPasswordMock.mockResolvedValue({ error: null });
  });

  it("renders the locked mobile-first entry content without fake operating metrics", () => {
    renderHomeFrontDoor();

    expect(screen.getByLabelText("BVRB3R home")).toHaveTextContent("BVRB3R");
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/signup");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Run your chair, your shop, and your income — in one system."
    );
    expect(screen.getByText("Booking. Payments. Clients. All controlled.")).toBeInTheDocument();

    expect(screen.getByLabelText("Mobile number, email, or username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Apple" })).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Booking" })).toBeInTheDocument();
    expect(screen.getByText("Fast booking + walk-ins handled automatically")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Money" })).toBeInTheDocument();
    expect(screen.getByText("Payments, payouts, and splits handled for you")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Growth" })).toBeInTheDocument();
    expect(screen.getByText("Clients, loyalty, and referrals built in")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Barbershop-first. System-driven." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enter the Platform" })).toHaveAttribute("href", "/guest");

    expect(screen.queryByText(/revenue|live pulse|testimonials|pricing|fake|demo/i)).not.toBeInTheDocument();
  });

  it("keeps the header brand-only so the auth card is the only account entry surface", () => {
    render(<HomeHeader />);

    expect(screen.getByLabelText("BVRB3R home")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Create account" })).not.toBeInTheDocument();
  });

  it("starts Google OAuth through the canonical callback with account selection", async () => {
    render(<AuthEntryCard />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));

    await waitFor(() => {
      expect(signInWithOAuthMock).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: "select_account"
          }
        }
      });
    });
  });

  it("sends password login through post-auth resolution", async () => {
    render(<AuthEntryCard />);

    fireEvent.change(screen.getByLabelText("Mobile number, email, or username"), {
      target: { value: "owner@example.com" }
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-horse-battery-staple" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(signInWithPasswordMock).toHaveBeenCalledWith({
        email: "owner@example.com",
        password: "correct-horse-battery-staple"
      });
    });
    expect(replaceMock).toHaveBeenCalledWith("/post-auth");
  });
});
