import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ClientPublicProfileEditor } from "@/components/client-experience/client-public-profile-editor";
import type { UserAccount } from "@/types/domain";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

describe("ClientPublicProfileEditor", () => {
  const user: UserAccount = {
    id: "client-profile-1",
    role: "client_user",
    email: "client@example.com",
    password: "",
    name: "Jordan Ellis",
    canonicalFullName: "Jordan Ellis",
    title: "Client",
    locationIds: []
  };

  it("renders a Culture-scoped public profile studio without marketplace language", () => {
    render(<ClientPublicProfileEditor user={user} />);

    expect(screen.getByTestId("client-public-profile-editor")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Public Profile" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Manage your Culture profile")).toBeInTheDocument();
    expect(screen.getByText("Shape the identity that appears in Culture, comments, likes, follows, and message context.")).toBeInTheDocument();
    expect(screen.getByText("Client public profiles appear in Culture and social interactions. They do not appear in barber or shop marketplace search.")).toBeInTheDocument();
    expect(screen.getByText("Public username")).toBeInTheDocument();
    expect(screen.getAllByText("Profile readiness").length).toBeGreaterThan(0);
    expect(screen.getByText("Culture posts and profile media")).toBeInTheDocument();
    expect(screen.getByLabelText("Public display name")).toBeInTheDocument();
    expect(screen.getByLabelText("@username")).toBeInTheDocument();
    expect(screen.getByLabelText("Public bio")).toBeInTheDocument();
    expect(screen.getByText("Public preview snapshot")).toBeInTheDocument();
    expect(screen.queryByText(/services/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/starting price/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/next opening/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^book$/i })).not.toBeInTheDocument();
  });
});
