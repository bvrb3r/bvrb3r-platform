import type { ReactNode } from "react";
import { Bookmark, Heart, ImageIcon, MessageCircle, MoreHorizontal, Scissors, Share2, ShieldCheck } from "lucide-react";
import type { CultureFeedItem } from "@/lib/culture/service";

function formatCultureDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "New";
  }

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "BV";
  }

  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function actionTitle(label: string, available: boolean) {
  if (available) {
    return `${label} is connected to the Culture backend foundation and will activate in the next interaction pass.`;
  }

  return `${label} is not available for this post yet.`;
}

function CultureActionButton({
  available,
  icon,
  label
}: {
  available: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled
      aria-label={actionTitle(label, available)}
      title={actionTitle(label, available)}
      className={[
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-3 text-xs font-black uppercase tracking-[0.12em]",
        available
          ? "border-white/12 bg-white/[0.05] text-white/58"
          : "border-white/8 bg-white/[0.03] text-white/32"
      ].join(" ")}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function CulturePostCard({ post }: { post: CultureFeedItem }) {
  const mediaUrl = post.media?.url ?? post.media?.thumbnailUrl ?? null;
  const hasAttachedContext = Boolean(post.serviceName || post.shopName);

  return (
    <article className="overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,16,16,0.92),rgba(6,6,6,0.96))] shadow-[0_22px_55px_rgba(0,0,0,0.24)]" data-testid="culture-post-card">
      <header className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-[#d7ffab]/18 bg-[#d7ffab]/10 text-[#d7ffab]">
            {post.authorAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.authorAvatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-black">
                {initialsFor(post.authorDisplayName)}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-black text-white">{post.authorDisplayName}</p>
              {post.authorVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[#d7ffab]/20 bg-[#d7ffab]/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#d7ffab]">
                  <ShieldCheck className="h-3 w-3" />
                  Verified
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-xs text-white/48">
              {[post.authorUsername, post.authorRoleLabel, post.shopName].filter(Boolean).join(" - ")}
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/34">{formatCultureDate(post.createdAt)}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white/42"
            aria-label="Follow is not active yet"
            title="Follow controls will activate when Culture relationships are wired."
          >
            Follow
          </button>
          <button
            type="button"
            disabled
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/42"
            aria-label="More Culture actions are not active yet"
            title="More Culture actions are not active yet."
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="mx-4 overflow-hidden rounded-[24px] border border-white/10 bg-black/40 sm:mx-5">
        <div className="aspect-[4/3] bg-[radial-gradient(circle_at_50%_28%,rgba(215,255,171,0.14),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(0,0,0,0.8))]">
          {mediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full border border-[#d7ffab]/18 bg-black/36 p-5 text-[#d7ffab]">
                <ImageIcon className="h-8 w-8" />
              </div>
              <p className="max-w-[16rem] text-sm leading-6 text-white/44">Media will appear here when the post includes approved Culture media.</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <CultureActionButton available={post.canLike} icon={<Heart className="h-4 w-4" />} label="Like" />
          <CultureActionButton available={post.canComment} icon={<MessageCircle className="h-4 w-4" />} label="Comment" />
          <CultureActionButton available={post.canShare} icon={<Share2 className="h-4 w-4" />} label="Share" />
          <CultureActionButton available={post.canSave} icon={<Bookmark className="h-4 w-4" />} label="Save" />
          {post.canBook ? (
            <button
              type="button"
              disabled
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#d7ffab]/28 bg-[#d7ffab] px-4 text-xs font-black uppercase tracking-[0.12em] text-[#050505]"
              aria-label="Book from Culture post is not active yet"
              title="Book-from-post will activate when Culture-to-booking routing is wired."
            >
              <Scissors className="h-4 w-4" />
              Book
            </button>
          ) : null}
        </div>

        {hasAttachedContext ? (
          <div className="mt-4 rounded-[18px] border border-[#d7ffab]/16 bg-[#d7ffab]/8 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#d7ffab]">{post.serviceName ? "Attached service" : "Culture context"}</p>
            <p className="mt-1 text-sm font-semibold text-white">{post.serviceName ?? "Shop culture"}</p>
            {post.shopName ? <p className="mt-1 text-xs text-white/46">{post.shopName}</p> : null}
          </div>
        ) : null}

        {post.caption ? <p className="mt-4 text-sm leading-6 text-white/74">{post.caption}</p> : null}
        {post.canComment ? (
          <p className="mt-4 text-xs text-white/42">Comments are available when real approved comments exist.</p>
        ) : null}
      </div>
    </article>
  );
}
