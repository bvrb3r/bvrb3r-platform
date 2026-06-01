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
  stats: [{ label: "Posts", value: 0 }],
  readiness: {
    title: "Profile readiness",
    subtitle: "Culture-facing identity",
    description: "Keep your public Culture profile clean.",
    cards: [{ title: "Public photo", value: "Setup", helper: "Add a photo." }]
  },
  identity: {
    title: "Public identity",
    subtitle: "What the community sees",
    description: "Your public photo, username, bio, and Culture posts appear across social interactions.",
    cards: [{ title: "Culture posts", value: 0, helper: "Only real posts appear." }]
  },
  media: {
    title: "Culture posts and profile media",
    subtitle: "Upload real photos or videos.",
    addButtonLabel: "Add post",
    emptyCopy: "No fake media is shown.",
    items: []
  },
  preview: {
    title: "Client Culture preview",
    subtitle: "This is what other users see.",
    enabled: true,
    actions: ["Follow", "Message", "Share"]
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
    expect(screen.getAllByText("Profile readiness").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Public identity").length).toBeGreaterThan(0);
    expect(screen.getByText("Culture posts and profile media")).toBeInTheDocument();
    expect(screen.getByText("Public preview snapshot")).toBeInTheDocument();
    expect(screen.queryByText(/public barber brand/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/starting price/i)).not.toBeInTheDocument();
  });
});
