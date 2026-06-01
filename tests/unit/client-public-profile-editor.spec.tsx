import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getAllByText(/Culture profile/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Shape the identity that appears in Culture, comments, likes, follows, and message context.")).toBeInTheDocument();
    expect(screen.getByText("Client public profiles appear in Culture and social interactions. They do not appear in barber or shop marketplace search.")).toBeInTheDocument();
    expect(screen.queryByText("Public username")).not.toBeInTheDocument();
    expect(screen.getByText("@jordanellis")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit public username" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("This is how people find your Culture profile.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getAllByText("Posts").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Followers").length).toBeGreaterThan(0);
    expect(screen.getByText("Following")).toBeInTheDocument();
    expect(screen.getAllByText("Posts").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Followers").length).toBeGreaterThan(0);
    expect(screen.getByText("Member status")).toBeInTheDocument();
    expect(screen.getByText("Your dashboard")).toBeInTheDocument();
    expect(screen.getByText("Your posts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add post" })).toBeInTheDocument();
    expect(screen.getByText("No Culture posts yet. Add real media when Culture publishing is connected.")).toBeInTheDocument();
    expect(screen.queryByText("Profile readiness")).not.toBeInTheDocument();
    expect(screen.queryByText("Public identity")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit profile")).not.toBeInTheDocument();
    expect(screen.queryByText("/client/jordanellis")).not.toBeInTheDocument();
    expect(screen.queryByText("Public preview snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText(/services/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/starting price/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/next opening/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/best booking fit/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^book$/i })).not.toBeInTheDocument();
  });

  it("uses role-specific feedback for preview and share actions", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    render(<ClientPublicProfileEditor user={user} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Public preview" })[0]);
    expect(screen.getByText("Culture public preview opens when client profile routing is connected.")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Share profile" })[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/client/jordanellis")));
    expect(screen.getByText("Culture profile link copied.")).toBeInTheDocument();
  });
});
