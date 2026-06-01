import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientPublicProfileEditor } from "@/components/client-experience/client-public-profile-editor";
import type { UserAccount } from "@/types/domain";

const {
  useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutationMock,
  uploadMediaAssetMock
} = vi.hoisted(() => ({
  useProfileMediaWorkspaceQueryMock: vi.fn(),
  useMutateProfileMediaMutationMock: vi.fn(),
  uploadMediaAssetMock: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode }) => (
    <a {...props} href={typeof href === "string" ? href : "#"}>{children}</a>
  )
}));

vi.mock("@/lib/profile/client", () => ({
  useProfileMediaWorkspaceQuery: useProfileMediaWorkspaceQueryMock,
  useMutateProfileMediaMutation: useMutateProfileMediaMutationMock
}));

vi.mock("@/lib/storage/media", () => ({
  uploadMediaAsset: uploadMediaAssetMock
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

  beforeEach(() => {
    useProfileMediaWorkspaceQueryMock.mockReset();
    useMutateProfileMediaMutationMock.mockReset();
    uploadMediaAssetMock.mockReset();
    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      data: {
        viewer: {
          role: "client_user",
          email: user.email,
          profilePhotoUrl: "https://cdn.example.com/client-avatar.jpg",
          profilePhotoPath: "profiles/client/avatar.jpg",
          notificationPreference: null
        },
        clientProfile: {
          profilePhotoUrl: "https://cdn.example.com/client-avatar.jpg",
          profilePhotoPath: "profiles/client/avatar.jpg",
          gallery: []
        },
        barberProfile: null,
        shops: []
      }
    });
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue({})
    });
    uploadMediaAssetMock.mockResolvedValue({
      path: "profiles/client/client-profile-1/posts/post.jpg",
      publicUrl: "https://cdn.example.com/post.jpg"
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
    expect(screen.getByRole("button", { name: "Update public profile photo" })).toBeInTheDocument();
    expect(screen.getByAltText("Jordan Ellis public image")).toHaveAttribute("src", "https://cdn.example.com/client-avatar.jpg");
    expect(screen.queryByRole("button", { name: "Posts" })).not.toBeInTheDocument();
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

  it("uploads client Culture posts through the media mutation", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync
    });

    render(<ClientPublicProfileEditor user={user} />);

    const file = new File(["post"], "post.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Add post upload input"), { target: { files: [file] } });

    await waitFor(() => expect(uploadMediaAssetMock).toHaveBeenCalledWith(expect.stringContaining("profiles/client/client-profile-1/posts"), file));
    expect(mutateAsync).toHaveBeenCalledWith({
      action: "add_client_gallery_image",
      storagePath: "profiles/client/client-profile-1/posts/post.jpg",
      imageUrl: "https://cdn.example.com/post.jpg"
    });
    expect(await screen.findByText("Post added.")).toBeInTheDocument();
  });

  it("removes client Culture posts through the media mutation", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    useMutateProfileMediaMutationMock.mockReturnValue({
      isPending: false,
      mutateAsync
    });
    useProfileMediaWorkspaceQueryMock.mockReturnValue({
      data: {
        viewer: {
          role: "client_user",
          email: user.email,
          profilePhotoUrl: "https://cdn.example.com/client-avatar.jpg",
          profilePhotoPath: "profiles/client/avatar.jpg",
          notificationPreference: null
        },
        clientProfile: {
          profilePhotoUrl: "https://cdn.example.com/client-avatar.jpg",
          profilePhotoPath: "profiles/client/avatar.jpg",
          gallery: [
            {
              id: "post-1",
              imageUrl: "https://cdn.example.com/post-1.jpg",
              storagePath: "profiles/client/post-1.jpg",
              caption: "Culture post",
              featured: false,
              createdAt: new Date().toISOString()
            }
          ]
        },
        barberProfile: null,
        shops: []
      }
    });

    render(<ClientPublicProfileEditor user={user} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove Culture post" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
      action: "remove_client_gallery_image",
      assetId: "post-1"
    }));
    expect(await screen.findByText("Post removed.")).toBeInTheDocument();
  });

  it("uses role-specific feedback for preview and share actions", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const assign = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    vi.stubGlobal("location", {
      origin: "https://www.bvrb3r.app",
      assign
    });

    render(<ClientPublicProfileEditor user={user} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Public preview" })[0]);
    expect(assign).toHaveBeenCalledWith("/client/jordanellis");

    fireEvent.click(screen.getAllByRole("button", { name: "Share profile" })[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/client/jordanellis")));
    expect(screen.getByText("Culture profile link copied.")).toBeInTheDocument();
  });
});
