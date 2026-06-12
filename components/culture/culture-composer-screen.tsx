"use client";

import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, ImagePlus, Lock, Send, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader, StatusBadge } from "@/design/components";
import type {
  CultureComposerPostTypeOption,
  CultureComposerRole,
  CultureMyPosts
} from "@/lib/culture/service";

type ComposerState = "idle" | "saving" | "submitting" | "success" | "error";

type CultureComposerScreenProps = {
  role: CultureComposerRole;
  postTypeOptions: CultureComposerPostTypeOption[];
  initialPosts: CultureMyPosts;
  blockedReason?: string | null;
};

const emptyPosts: CultureMyPosts = {
  drafts: [],
  pendingReview: [],
  published: [],
  archived: []
};

function roleCopy(role: CultureComposerRole) {
  if (role === "barber") {
    return {
      eyebrow: "Barber Culture",
      title: "Create Barber Culture Post",
      subtitle: "Share your work, attach a service, and turn content into bookings.",
      backHref: "/dashboard/barber/culture" as Route,
      backLabel: "Cancel",
      postTypeLabel: "Post type",
      mediaTitle: "Media slot",
      mediaCopy: "Image upload is coming next. This v1 composer saves text drafts against the canonical Culture post table.",
      selectorTitle: "Optional service selector",
      selectorCopy: "Service attachment will activate after Culture-to-service selection is wired.",
      ctaTitle: "Book button",
      ctaCopy: "Book buttons require a valid bookable service. This toggle stays locked until service selection is available.",
      submitLabel: "Submit for Review"
    };
  }

  return {
    eyebrow: "Shop Owner Culture",
    title: "Create Shop Culture Post",
    subtitle: "Share shop updates, walk-ins, team moments, and local culture.",
    backHref: "/dashboard/owner/culture" as Route,
    backLabel: "Cancel",
    postTypeLabel: "Post type",
    mediaTitle: "Media slot",
    mediaCopy: "Image upload is coming next. This v1 composer saves text drafts against the canonical Culture post table.",
    selectorTitle: "CTA selector",
    selectorCopy: "View Shop is planned as the first supported CTA. Unsupported paid promotion controls are not active here.",
    ctaTitle: "Promotion status",
    ctaCopy: "This is organic shop posting only. Paid promotions remain locked.",
    submitLabel: "Submit for Review"
  };
}

function MyCulturePostsPanel({ posts }: { posts: CultureMyPosts }) {
  const sections = [
    ["Drafts", posts.drafts, "No drafts yet."],
    ["Pending Review", posts.pendingReview, "No posts pending review."],
    ["Published", posts.published, "No published posts yet."],
    ["Archived", posts.archived, "No archived posts."]
  ] as const;

  return (
    <Card className="rounded-[28px] border-white/10 bg-black/24 p-5">
      <p className="bvr-section-label">My Culture Posts</p>
      <div className="mt-4 space-y-4">
        {sections.map(([label, values, empty]) => (
          <section key={label} className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white/76">{label}</h2>
              <StatusBadge tone={values.length ? "green" : "neutral"}>{values.length}</StatusBadge>
            </div>
            <div className="mt-3 space-y-2">
              {values.length ? values.map((post) => (
                <div key={post.id} className="rounded-[16px] border border-white/8 bg-black/24 px-3 py-3">
                  <p className="text-sm font-semibold text-white">{post.caption}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/42">
                    {post.postType} - {post.publishingStatus} - {post.moderationStatus}
                  </p>
                </div>
              )) : (
                <p className="text-sm text-white/48">{empty}</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}

export function CultureComposerScreen({
  role,
  postTypeOptions,
  initialPosts,
  blockedReason
}: CultureComposerScreenProps) {
  const copy = roleCopy(role);
  const [postType, setPostType] = useState(postTypeOptions[0]?.value ?? "");
  const [caption, setCaption] = useState("");
  const [tags, setTags] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [posts, setPosts] = useState<CultureMyPosts>(initialPosts ?? emptyPosts);
  const [state, setState] = useState<ComposerState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isBusy = state === "saving" || state === "submitting";
  const canSubmit = Boolean(caption.trim()) && !blockedReason && !isBusy;
  const tagValues = useMemo(
    () => tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    [tags]
  );

  async function reloadMyPosts() {
    const response = await fetch(`/api/culture/my-posts?role=${role}`, { method: "GET" });
    const payload = await response.json().catch(() => null) as { ok?: boolean; posts?: CultureMyPosts } | null;
    if (response.ok && payload?.ok && payload.posts) {
      setPosts(payload.posts);
    }
  }

  async function saveDraft() {
    setState("saving");
    setError(null);
    setMessage(null);

    const response = await fetch("/api/culture/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        postType,
        caption,
        tags: tagValues
      })
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; postId?: string; error?: string } | null;

    if (!response.ok || !payload?.ok || !payload.postId) {
      setState("error");
      setError(payload?.error ?? "Unable to save Culture draft.");
      return null;
    }

    setDraftId(payload.postId);
    setState("success");
    setMessage("Draft saved.");
    await reloadMyPosts();
    return payload.postId;
  }

  async function submitForReview() {
    setState("submitting");
    setError(null);
    setMessage(null);

    const nextDraftId = draftId ?? await saveDraft();
    if (!nextDraftId) {
      return;
    }

    setState("submitting");
    const response = await fetch(`/api/culture/posts/${encodeURIComponent(nextDraftId)}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role })
    });
    const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string; error?: string } | null;

    if (!response.ok || !payload?.ok) {
      setState("error");
      setError(payload?.error ?? "Unable to submit Culture post.");
      return;
    }

    setState("success");
    setMessage(payload.message ?? "Post submitted for review.");
    await reloadMyPosts();
  }

  return (
    <div className="space-y-4" data-testid={`${role}-culture-composer`}>
      <Card className="rounded-[34px] border-white/10 bg-[linear-gradient(180deg,rgba(17,17,17,0.96),rgba(6,6,6,0.98))] p-5 shadow-[0_26px_60px_rgba(0,0,0,0.24)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeader label={copy.eyebrow} title={copy.title} subtitle={copy.subtitle} />
          <Link
            href={copy.backHref}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white/74 transition hover:border-white/20"
          >
            {copy.backLabel}
          </Link>
        </div>
      </Card>

      {blockedReason ? (
        <Card className="rounded-[28px] border-[#ffcf73]/20 bg-[#ffcf73]/8 p-5">
          <Lock className="h-5 w-5 text-[#ffcf73]" />
          <p className="mt-4 text-lg font-semibold text-white">Posting locked</p>
          <p className="mt-2 text-sm leading-6 text-white/62">{blockedReason}</p>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card className="rounded-[30px] border-white/10 bg-black/22 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="bvr-section-label">Composer</p>
              <h2 className="mt-2 text-2xl font-extrabold text-white">Post details</h2>
            </div>
            <StatusBadge tone={blockedReason ? "danger" : "green"}>
              {blockedReason ? "Locked" : "Draft ready"}
            </StatusBadge>
          </div>

          <div className="mt-5 space-y-5">
            <label className="block">
              <span className="text-sm font-semibold text-white/76">{copy.postTypeLabel}</span>
              <select
                value={postType}
                onChange={(event) => setPostType(event.target.value)}
                disabled={Boolean(blockedReason) || isBusy}
                className="mt-2 w-full rounded-[14px] border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none focus:border-[#d7ffab]/45"
              >
                {postTypeOptions.map((option) => (
                  <option key={`${option.label}-${option.value}`} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-white/76">Caption</span>
              <textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                disabled={Boolean(blockedReason) || isBusy}
                maxLength={2200}
                rows={7}
                placeholder={role === "barber" ? "Tell clients what makes this cut worth booking." : "Tell the community what is happening in the shop."}
                className="mt-2 w-full resize-none rounded-[18px] border border-white/10 bg-black/50 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-[#d7ffab]/45"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-white/76">Style tags</span>
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                disabled={Boolean(blockedReason) || isBusy}
                placeholder="fade, beard, ybor"
                className="mt-2 w-full rounded-[14px] border border-white/10 bg-black/50 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#d7ffab]/45"
              />
              <span className="mt-2 block text-xs text-white/42">Comma-separated tags. Invalid or duplicate tags are ignored server-side.</span>
            </label>

            <div className="rounded-[22px] border border-dashed border-white/12 bg-white/[0.03] p-4">
              <ImagePlus className="h-5 w-5 text-[#d7ffab]" />
              <p className="mt-3 text-sm font-semibold text-white">{copy.mediaTitle}</p>
              <p className="mt-2 text-sm leading-6 text-white/54">{copy.mediaCopy}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">{copy.selectorTitle}</p>
                <p className="mt-2 text-sm leading-6 text-white/54">{copy.selectorCopy}</p>
              </div>
              <div className="rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-semibold text-white">{copy.ctaTitle}</p>
                <p className="mt-2 text-sm leading-6 text-white/54">{copy.ctaCopy}</p>
              </div>
            </div>

            {message ? (
              <div className="flex items-center gap-2 rounded-[18px] border border-[#d7ffab]/20 bg-[#d7ffab]/10 px-4 py-3 text-sm text-[#d7ffab]">
                <CheckCircle2 className="h-4 w-4" />
                {message}
              </div>
            ) : null}
            {error ? (
              <div className="rounded-[18px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:justify-end">
              <Link
                href={copy.backHref}
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/5 px-5 text-sm font-black text-white/70"
              >
                Cancel
              </Link>
              <button
                type="button"
                onClick={saveDraft}
                disabled={Boolean(blockedReason) || isBusy}
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-white/8 px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {state === "saving" ? "Saving..." : "Save Draft"}
              </button>
              <button
                type="button"
                onClick={submitForReview}
                disabled={!canSubmit}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[#d7ffab]/35 bg-[#A3FF12] px-5 text-sm font-black text-[#050505] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Send className="h-4 w-4" />
                {state === "submitting" ? "Submitting..." : copy.submitLabel}
              </button>
            </div>
          </div>
        </Card>

        <aside className="space-y-4">
          <Card className="rounded-[28px] border-white/10 bg-black/24 p-5">
            <Sparkles className="h-5 w-5 text-[#d7ffab]" />
            <p className="mt-4 text-lg font-semibold text-white">Preview card</p>
            <div className="mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-black/30">
              <div className="aspect-[4/3] bg-[linear-gradient(135deg,rgba(124,255,0,0.16),rgba(255,255,255,0.06)_42%,rgba(0,0,0,0.78))]" />
              <div className="p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-white/42">
                  {role === "barber" ? "Barber" : "Shop Owner"} - draft
                </p>
                <p className="mt-3 text-sm leading-6 text-white/72">
                  {caption.trim() || "Your post caption preview will appear here before you save."}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-white/42">
              Drafts and submitted posts are private to the author until moderation publishes a safe public post.
            </p>
          </Card>
          <MyCulturePostsPanel posts={posts} />
        </aside>
      </section>
    </div>
  );
}
