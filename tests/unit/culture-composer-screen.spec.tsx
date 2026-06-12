import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CultureComposerScreen } from "@/components/culture/culture-composer-screen";
import type { CultureMyPosts } from "@/lib/culture/service";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a"> & { children?: ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  )
}));

const emptyPosts: CultureMyPosts = {
  drafts: [],
  pendingReview: [],
  published: [],
  archived: []
};

function mockFetchSequence() {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, postId: "post-draft-1", post: { id: "post-draft-1" } })
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        posts: {
          drafts: [{ id: "post-draft-1", caption: "Fresh taper.", postType: "barber_cut", visibility: "private", moderationStatus: "pending", publishingStatus: "draft", createdAt: "2026-06-12T12:00:00.000Z" }],
          pendingReview: [],
          published: [],
          archived: []
        }
      })
    });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("CultureComposerScreen", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders barber composer fields and saves a draft through the Culture API", async () => {
    const fetchMock = mockFetchSequence();

    render(
      <CultureComposerScreen
        role="barber"
        postTypeOptions={[{ label: "Fresh Cut", value: "barber_cut" }]}
        initialPosts={emptyPosts}
      />
    );

    expect(screen.getByRole("heading", { name: "Create Barber Culture Post" })).toBeInTheDocument();
    expect(screen.getByLabelText("Post type")).toBeInTheDocument();
    expect(screen.getByLabelText("Caption")).toBeInTheDocument();
    expect(screen.getByText("Media slot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Submit for Review/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "Fresh taper." } });
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/culture/posts", expect.objectContaining({
      method: "POST"
    })));
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain("Fresh taper.");
    expect(await screen.findByText("Draft saved.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("Fresh taper.").length).toBeGreaterThan(1));
  });

  it("submits a saved draft for review", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, postId: "post-draft-1", post: { id: "post-draft-1" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, posts: emptyPosts })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, message: "Post submitted for review." })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, posts: { ...emptyPosts, pendingReview: [{ id: "post-draft-1", caption: "Ready.", postType: "barber_cut", visibility: "unlisted", moderationStatus: "pending", publishingStatus: "published", createdAt: "2026-06-12T12:00:00.000Z" }] } })
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CultureComposerScreen
        role="barber"
        postTypeOptions={[{ label: "Fresh Cut", value: "barber_cut" }]}
        initialPosts={emptyPosts}
      />
    );

    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "Ready." } });
    fireEvent.click(screen.getByRole("button", { name: /Submit for Review/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/culture/posts/post-draft-1/submit", expect.objectContaining({
      method: "POST"
    })));
    expect(await screen.findByText("Post submitted for review.")).toBeInTheDocument();
  });

  it("uploads selected image media to a saved draft", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, postId: "post-draft-1", post: { id: "post-draft-1" } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, posts: emptyPosts })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          media: {
            id: "media-1",
            url: "https://signed.bvrb3r.test/culture/work.jpg",
            thumbnailUrl: "https://signed.bvrb3r.test/culture/work.jpg",
            mediaType: "image",
            width: null,
            height: null,
            durationSeconds: null
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, posts: emptyPosts })
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CultureComposerScreen
        role="barber"
        postTypeOptions={[{ label: "Fresh Cut", value: "barber_cut" }]}
        initialPosts={emptyPosts}
      />
    );

    fireEvent.change(screen.getByLabelText("Culture image upload input"), {
      target: { files: [new File(["image"], "work.jpg", { type: "image/jpeg" })] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach Image" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/culture/posts/post-draft-1/media", expect.objectContaining({
      method: "POST",
      body: expect.any(FormData)
    })));
    expect(await screen.findByText("Image attached to draft.")).toBeInTheDocument();
  });

  it("renders owner copy without paid promotion controls", () => {
    render(
      <CultureComposerScreen
        role="owner"
        postTypeOptions={[{ label: "Shop Update", value: "shop_update" }]}
        initialPosts={emptyPosts}
      />
    );

    expect(screen.getByRole("heading", { name: "Create Shop Culture Post" })).toBeInTheDocument();
    expect(screen.getByText("Share shop updates, walk-ins, team moments, and local culture.")).toBeInTheDocument();
    expect(screen.getByText("This is organic shop posting only. Paid promotions remain locked.")).toBeInTheDocument();
    expect(screen.queryByText(/budget|paid promotion setup/i)).not.toBeInTheDocument();
  });

  it("shows a locked state and disables composer actions when access is blocked", () => {
    render(
      <CultureComposerScreen
        role="barber"
        postTypeOptions={[{ label: "Fresh Cut", value: "barber_cut" }]}
        initialPosts={emptyPosts}
        blockedReason="Culture posting opens after barber approval is complete."
      />
    );

    expect(screen.getByText("Posting locked")).toBeInTheDocument();
    expect(screen.getByText("Culture posting opens after barber approval is complete.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Submit for Review/i })).toBeDisabled();
  });

  it("keeps the composer open and shows an error when save fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: "Culture posting opens after barber approval is complete." })
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CultureComposerScreen
        role="barber"
        postTypeOptions={[{ label: "Fresh Cut", value: "barber_cut" }]}
        initialPosts={emptyPosts}
      />
    );

    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "Fresh taper." } });
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));

    expect(await screen.findByText("Culture posting opens after barber approval is complete.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create Barber Culture Post" })).toBeInTheDocument();
  });
});
