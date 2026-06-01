import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProfileStudioShell, type ProfileStudioViewModel } from "@/components/profile-studio/profile-studio-shell";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

const model: ProfileStudioViewModel = {
  role: "client",
  page: {
    title: "Public Profile",
    subtitle: "Manage your Culture profile",
    statusText: "Client public profiles appear in Culture and social interactions."
  },
  hero: {
    label: "Culture profile",
    title: "Public Profile",
    subtitle: "Shape the identity that appears in Culture.",
    publicName: "Jordan Ellis",
    username: "jordan",
    badge: "Culture profile",
    bio: "Public bio",
    contextLine: "Culture identity"
  },
  actions: {
    publicPreviewLabel: "Public preview",
    editProfileLabel: "Edit profile",
    mediaLabel: "Posts",
    shareLabel: "Share profile"
  },
  username: {
    title: "Public username",
    value: "jordan",
    helperText: "Lowercase letters, numbers, hyphens, or underscores.",
    canEdit: true,
    publicUrl: "/client/jordan"
  },
  stats: [
    { label: "Posts", value: 0 },
    { label: "Followers", value: 0 },
    { label: "Following", value: 0 }
  ],
  trustCards: [
    { title: "Culture activity", value: "0 Posts", helper: "Shared in Culture" },
    { title: "Social profile", value: "0 Followers", helper: "Community proof builds here" },
    { title: "Member status", value: "Active", helper: "BVRB3R Culture" }
  ],
  dashboardSummary: {
    title: "Your dashboard",
    text: "0 profile views, 0 post clicks."
  },
  secondaryActions: [
    { label: "Edit profile", intent: "edit_profile" },
    { label: "Share profile", intent: "share_profile" }
  ],
  highlights: [
    { label: "New", type: "new" },
    { label: "Culture", type: "collection" }
  ],
  work: {
    title: "Your posts",
    countLabel: "0 posts",
    manageLabel: "Manage",
    emptyCopy: "No fake media is shown.",
    items: []
  }
};

describe("ProfileStudioShell", () => {
  it("renders role-provided studio sections without hardcoded barber copy", () => {
    render(
      <ProfileStudioShell
        model={model}
        backHref="/dashboard/client/more"
        backLabel="Back to More"
        usernameValue="jordan"
      />
    );

    expect(screen.getByTestId("profile-studio-client")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Public Profile" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Culture profile").length).toBeGreaterThan(0);
    expect(screen.getByText("Public username")).toBeInTheDocument();
    const usernameInput = screen.getByLabelText("Public username");
    expect(usernameInput).toHaveAttribute("spellcheck", "false");
    expect(usernameInput).toHaveAttribute("autocapitalize", "none");
    expect(usernameInput).toHaveAttribute("autocorrect", "off");
    expect(usernameInput).toHaveAttribute("inputmode", "text");
    expect(screen.getByRole("button", { name: "Save handle" })).toBeDisabled();
    expect(screen.getByText("Handle is up to date.")).toBeInTheDocument();
    expect(screen.getByText("Culture activity")).toBeInTheDocument();
    expect(screen.getByText("Your dashboard")).toBeInTheDocument();
    expect(screen.getByText("Your posts")).toBeInTheDocument();
    expect(screen.queryByText("Public preview snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText(/public barber brand/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/starting price/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No file chosen/i)).not.toBeInTheDocument();
  });
});
