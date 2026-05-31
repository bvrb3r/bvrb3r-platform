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
    expect(screen.getByRole("heading", { name: "Public Profile" })).toBeInTheDocument();
    expect(screen.getByText("Culture profile settings")).toBeInTheDocument();
    expect(screen.getByText("Client public profiles are scoped to Culture and social interactions. They do not appear in barber or shop marketplace search.")).toBeInTheDocument();
    expect(screen.getByLabelText("Public display name")).toBeInTheDocument();
    expect(screen.getByLabelText("@username")).toBeInTheDocument();
    expect(screen.getByLabelText("Bio")).toBeInTheDocument();
    expect(screen.getByText("Media / posts")).toBeInTheDocument();
    expect(screen.getByText("Visibility")).toBeInTheDocument();
    expect(screen.queryByText(/services/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/booking profile/i)).not.toBeInTheDocument();
  });
});
