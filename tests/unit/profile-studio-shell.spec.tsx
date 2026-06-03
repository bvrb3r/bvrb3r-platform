import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileImageEditButton } from "@/components/profile-studio/profile-image-edit-button";
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
    contextLine: "Culture identity",
    contextEditable: true,
    bioEmptyCopy: "Add a public bio.",
    bioModalTitle: "Edit public bio",
    bioModalHelper: "This bio appears on your Culture profile.",
    contextModalTitle: "Edit public location",
    contextModalHelper: "Choose the public city or area shown on your Culture profile."
  },
  actions: {
    publicPreviewLabel: "Public preview",
    mediaLabel: "Posts",
    shareLabel: "Share profile"
  },
  username: {
    title: "Public username",
    value: "jordan",
    helperText: "Lowercase letters, numbers, hyphens, or underscores.",
    canEdit: true,
    publicUrl: "/client/jordan",
    modalTitle: "Edit public username",
    modalHelper: "This is how people find your Culture profile."
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
  highlights: [
    { label: "New", type: "new" },
    { label: "Culture", type: "collection" }
  ],
  work: {
    title: "Your posts",
    countLabel: "1 post",
    addLabel: "Add post",
    emptyCopy: "No fake media is shown.",
    items: [
      {
        id: "post-1",
        imageUrl: "https://cdn.example.com/post-1.jpg",
        alt: "Culture post"
      }
    ]
  }
};

describe("ProfileStudioShell", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function mockUsernameAvailability(result: { available: boolean; reason: string | null } = { available: true, reason: null }) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(result)
    }));
  }

  it("renders role-provided studio sections without hardcoded barber copy", () => {
    render(
      <ProfileStudioShell
        model={model}
        backHref="/dashboard/client/more"
        backLabel="Back to More"
        usernameValue="jordan"
        photoControl={<ProfileImageEditButton label="Update public photo" onUnavailable={vi.fn()} />}
        onBioSave={vi.fn()}
        contextFields={[
          { name: "city", label: "City or area", value: "Tampa" },
          { name: "state", label: "State", value: "FL" }
        ]}
        onContextSave={vi.fn()}
      />
    );

    expect(screen.getByTestId("profile-studio-client")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Public Profile" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Culture profile").length).toBeGreaterThan(0);
    expect(screen.queryByText("Public username")).not.toBeInTheDocument();
    expect(screen.getByText("@jordan")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update public photo" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Public preview" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Share profile" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Posts" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit public username" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("This is how people find your Culture profile.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close username editor" })).toBeInTheDocument();
    const usernameInput = screen.getByLabelText("Public username");
    expect(usernameInput).toHaveAttribute("spellcheck", "false");
    expect(usernameInput).toHaveAttribute("autocapitalize", "none");
    expect(usernameInput).toHaveAttribute("autocorrect", "off");
    expect(usernameInput).toHaveAttribute("inputmode", "text");
    expect(screen.queryByRole("button", { name: "Save handle" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit public bio" }));
    expect(screen.getByRole("dialog", { name: "Edit public bio" })).toBeInTheDocument();
    expect(screen.getByText("This bio appears on your Culture profile.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close bio editor" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit public context" }));
    expect(screen.getByRole("dialog", { name: "Edit public location" })).toBeInTheDocument();
    expect(screen.getByText("Choose the public city or area shown on your Culture profile.")).toBeInTheDocument();
    expect(screen.getByLabelText("City or area")).toHaveValue("Tampa");
    expect(screen.getByRole("button", { name: "Close context editor" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Culture activity")).toBeInTheDocument();
    expect(screen.getByText("Your dashboard")).toBeInTheDocument();
    expect(screen.getByText("Your posts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add post" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Culture post to folder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Culture post" })).toBeInTheDocument();
    expect(screen.queryByText("Public preview snapshot")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit profile")).not.toBeInTheDocument();
    expect(screen.queryByText(/public barber brand/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/starting price/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No file chosen/i)).not.toBeInTheDocument();
  });

  it("creates folders and opens a premium folder viewer", () => {
    render(
      <ProfileStudioShell
        model={model}
        backHref="/dashboard/client/more"
        backLabel="Back to More"
        usernameValue="jordan"
        photoControl={<ProfileImageEditButton label="Update public photo" onUnavailable={vi.fn()} />}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /\+ New/ }));
    const createDialog = screen.getByRole("dialog", { name: "Create folder" });
    expect(within(createDialog).getByText("Group your Culture posts into a public folder.")).toBeInTheDocument();
    expect(within(createDialog).getByLabelText("Folder name")).toBeInTheDocument();
    expect(within(createDialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(createDialog).getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(within(createDialog).getByRole("button", { name: "Close folder creator" })).toBeInTheDocument();

    fireEvent.change(within(createDialog).getByLabelText("Folder name"), { target: { value: "Culture" } });
    fireEvent.click(within(createDialog).getByRole("button", { name: "Save" }));
    expect(screen.getByText("Folder name already exists.")).toBeInTheDocument();

    fireEvent.change(within(createDialog).getByLabelText("Folder name"), { target: { value: "Travel" } });
    fireEvent.click(within(createDialog).getByRole("button", { name: "Save" }));
    const highlights = screen.getByLabelText("Profile highlights");
    expect(within(highlights).getByRole("button", { name: /Travel/ })).toBeInTheDocument();

    fireEvent.click(within(highlights).getByRole("button", { name: /Travel/ }));
    expect(screen.getByRole("dialog", { name: "Travel folder viewer" })).toBeInTheDocument();
    expect(screen.getByText("No media in this folder yet. Add or move media into this folder.")).toBeInTheDocument();
  });

  it("renders the username editor as a top-layer portal with usable actions", async () => {
    mockUsernameAvailability();
    const onUsernameSave = vi.fn();
    const previousOverflow = document.body.style.overflow;

    render(
      <ProfileStudioShell
        model={model}
        backHref="/dashboard/client/more"
        backLabel="Back to More"
        usernameValue="jordan"
        photoControl={<ProfileImageEditButton label="Update public photo" onUnavailable={vi.fn()} />}
        onUsernameSave={onUsernameSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit public username" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveClass("z-[9999]");
    expect(dialog).not.toHaveClass("z-[80]");
    expect(dialog).toHaveClass("pb-[max(6rem,env(safe-area-inset-bottom))]");
    expect(document.body.style.overflow).toBe("hidden");

    const usernameInput = screen.getByLabelText("Public username");
    expect(usernameInput).toHaveAttribute("spellcheck", "false");
    expect(usernameInput).toHaveAttribute("autocapitalize", "none");
    expect(usernameInput).toHaveAttribute("autocorrect", "off");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Close username editor" })).toBeEnabled();

    fireEvent.change(usernameInput, { target: { value: "admin" } });
    expect(screen.getByText("This username is reserved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(usernameInput, { target: { value: "jordan-culture" } });
    expect(screen.getByText("Checking username...")).toBeInTheDocument();
    expect(await screen.findByText("Username available.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onUsernameSave).toHaveBeenCalledWith("jordan-culture");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe(previousOverflow);
  });

  it("keeps the username editor open briefly with saved confirmation before closing", async () => {
    mockUsernameAvailability();
    let resolveSave: (() => void) | undefined;
    const onUsernameSave = vi.fn(() => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));

    render(
      <ProfileStudioShell
        model={model}
        backHref="/dashboard/client/more"
        backLabel="Back to More"
        usernameValue="jordan"
        photoControl={<ProfileImageEditButton label="Update public photo" onUnavailable={vi.fn()} />}
        onUsernameSave={onUsernameSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit public username" }));
    const usernameInput = await screen.findByLabelText("Public username");
    fireEvent.change(usernameInput, { target: { value: "jordan-live" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(await screen.findByText("Username available.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(onUsernameSave).toHaveBeenCalledWith("jordan-live");

    await act(async () => {
      resolveSave?.();
      await Promise.resolve();
    });

    expect(screen.getByText("Username saved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saved" })).toBeDisabled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Public username saved. @jordan-live is live.")).toBeInTheDocument();
  });

  it("shows taken username availability and disables Save", async () => {
    mockUsernameAvailability({ available: false, reason: "taken" });

    render(
      <ProfileStudioShell
        model={model}
        backHref="/dashboard/client/more"
        backLabel="Back to More"
        usernameValue="jordan"
        photoControl={<ProfileImageEditButton label="Update public photo" onUnavailable={vi.fn()} />}
        onUsernameSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit public username" }));
    const usernameInput = await screen.findByLabelText("Public username");
    fireEvent.change(usernameInput, { target: { value: "taken-name" } });
    expect(screen.getByText("Checking username...")).toBeInTheDocument();

    expect(await screen.findByText("Username taken. Please choose a different username.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("keeps the username editor open and shows inline error after failed save", async () => {
    mockUsernameAvailability();
    render(
      <ProfileStudioShell
        model={model}
        backHref="/dashboard/client/more"
        backLabel="Back to More"
        usernameValue="jordan"
        photoControl={<ProfileImageEditButton label="Update public photo" onUnavailable={vi.fn()} />}
        onUsernameSave={vi.fn().mockRejectedValue(new Error("Unable to save public username."))}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit public username" }));
    const usernameInput = await screen.findByLabelText("Public username");
    fireEvent.change(usernameInput, { target: { value: "jordan-error" } });
    expect(await screen.findByText("Username available.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Unable to save public username.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("closes the username editor through Cancel and X actions", async () => {
    render(
      <ProfileStudioShell
        model={model}
        backHref="/dashboard/client/more"
        backLabel="Back to More"
        usernameValue="jordan"
        photoControl={<ProfileImageEditButton label="Update public photo" onUnavailable={vi.fn()} />}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit public username" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit public username" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close username editor" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the bio save footer usable and closes only after successful save", async () => {
    let resolveSave: (() => void) | undefined;
    const onBioSave = vi.fn(() => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));

    render(
      <ProfileStudioShell
        model={model}
        backHref="/dashboard/client/more"
        backLabel="Back to More"
        usernameValue="jordan"
        photoControl={<ProfileImageEditButton label="Update public photo" onUnavailable={vi.fn()} />}
        onBioSave={onBioSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit public bio" }));
    const dialog = screen.getByRole("dialog", { name: "Edit public bio" });
    expect(dialog.className).toContain("max-h-[calc(100dvh-3rem-env(safe-area-inset-bottom))]");
    fireEvent.change(screen.getByLabelText("Public bio"), { target: { value: "Saved public bio" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
    expect(onBioSave).toHaveBeenCalledWith("Saved public bio");
    resolveSave?.();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit public bio" })).not.toBeInTheDocument());
    expect(await screen.findByText("Saved public bio")).toBeInTheDocument();
  });

  it("keeps the bio modal open with inline error after failed save", async () => {
    render(
      <ProfileStudioShell
        model={model}
        backHref="/dashboard/client/more"
        backLabel="Back to More"
        usernameValue="jordan"
        photoControl={<ProfileImageEditButton label="Update public photo" onUnavailable={vi.fn()} />}
        onBioSave={vi.fn().mockRejectedValue(new Error("Unable to update public bio."))}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit public bio" }));
    fireEvent.change(screen.getByLabelText("Public bio"), { target: { value: "Failed bio" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Unable to update public bio.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit public bio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("keeps the context modal open briefly with saved confirmation before closing", async () => {
    let resolveSave: (() => void) | undefined;
    const onContextSave = vi.fn(() => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));

    render(
      <ProfileStudioShell
        model={model}
        backHref="/dashboard/client/more"
        backLabel="Back to More"
        usernameValue="jordan"
        photoControl={<ProfileImageEditButton label="Update public photo" onUnavailable={vi.fn()} />}
        contextFields={[
          { name: "city", label: "City or area", value: "Tampa" },
          { name: "state", label: "State", value: "FL" }
        ]}
        onContextSave={onContextSave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit public context" }));
    fireEvent.change(screen.getByLabelText("City or area"), { target: { value: "Orlando" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(onContextSave).toHaveBeenCalledWith({ city: "Orlando", state: "FL" });
    resolveSave?.();

    expect((await screen.findAllByText("Public location saved.")).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit public location" })).not.toBeInTheDocument());
    expect(screen.getByText("Orlando, FL")).toBeInTheDocument();
  });

  it("moves media into a folder and shows carousel controls", () => {
    render(
      <ProfileStudioShell
        model={model}
        backHref="/dashboard/client/more"
        backLabel="Back to More"
        usernameValue="jordan"
        photoControl={<ProfileImageEditButton label="Update public photo" onUnavailable={vi.fn()} />}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Move Culture post to folder" }));
    const moveDialog = screen.getByRole("dialog", { name: "Move to folder" });
    fireEvent.click(within(moveDialog).getByRole("button", { name: "Culture" }));

    fireEvent.click(within(screen.getByLabelText("Profile highlights")).getByRole("button", { name: /Culture/ }));
    const viewer = screen.getByRole("dialog", { name: "Culture folder viewer" });
    expect(within(viewer).getByRole("button", { name: "Previous image" })).toBeInTheDocument();
    expect(within(viewer).getByRole("button", { name: "Next image" })).toBeInTheDocument();
    expect(within(viewer).getAllByAltText("Culture post").length).toBeGreaterThan(0);
  });
});
