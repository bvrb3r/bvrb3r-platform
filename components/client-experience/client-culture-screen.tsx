import type { Route } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { Bookmark, Scissors, Search, Store, UsersRound } from "lucide-react";
import { StatusBadge } from "@/design/components";
import { CultureFeedHeader } from "@/components/culture/culture-feed-header";
import { CulturePostCard } from "@/components/culture/culture-post-card";
import { CLIENT_PRIMARY_TAB_HREFS } from "@/components/client-experience/client-tab-config";
import type { CultureFeedItem, CultureFeedModule, CultureFeedResponse } from "@/lib/culture/service";

export type CultureCreatorRole = "client" | "barber" | "shop" | "architect";
type CultureSurface = "client" | "barber" | "shop";

export interface ClientCulturePost {
  id: string;
  creatorRole: CultureCreatorRole;
  creatorName: string;
  mediaUrl?: string | null;
  caption: string;
  linkedBarberHref?: Route | null;
  linkedShopHref?: Route | null;
  bookingHref?: Route | null;
  createdAtLabel: string;
}

function creatorRoleLabel(role: CultureCreatorRole) {
  switch (role) {
    case "barber":
      return "Barber";
    case "shop":
      return "Shop";
    case "architect":
      return "BVRB3R";
    default:
      return "Client";
  }
}

function emptyFeedCopy(surface: CultureSurface) {
  if (surface === "barber") {
    return "Barber posts, tutorials, and shop culture will appear here as the BVRB3R community grows.";
  }

  if (surface === "shop") {
    return "Shop posts, team highlights, and local barber culture will appear here as the BVRB3R community grows.";
  }

  return "Culture posts will appear here as the BVRB3R community grows.";
}

function legacyPostToFeedItem(post: ClientCulturePost): CultureFeedItem {
  return {
    id: post.id,
    authorProfileId: post.id,
    authorTargetKind: post.creatorRole === "shop" ? "shop" : post.creatorRole === "barber" ? "barber" : "client",
    authorTarget: null,
    barberId: null,
    shopId: null,
    serviceId: null,
    authorDisplayName: post.creatorName,
    authorUsername: null,
    authorAvatarUrl: null,
    authorRoleLabel: creatorRoleLabel(post.creatorRole),
    authorVerified: false,
    caption: post.caption,
    postType: "style_inspiration",
    media: post.mediaUrl ? {
      id: `${post.id}-media`,
      url: post.mediaUrl,
      thumbnailUrl: post.mediaUrl,
      mediaType: "image",
      width: null,
      height: null,
      durationSeconds: null
    } : null,
    createdAt: post.createdAtLabel,
    serviceName: null,
    shopName: null,
    profileUrl: null,
    bookingUrl: null,
    shopUrl: null,
    canViewProfile: false,
    canViewShop: false,
    bookLabel: null,
    bookingDisabledReason: "Legacy Culture posts do not include booking attribution.",
    canLike: true,
    canSave: true,
    canShare: true,
    canReport: true,
    canBook: Boolean(post.bookingHref),
    canComment: false,
    isPromoted: false,
    promotionLabel: null,
    reasonCodes: ["recent_public_post"],
    reasonLabel: "Recent from BVRB3R"
  };
}

function CultureDiscoveryGrid({ module }: { module: CultureFeedModule }) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-white/10 bg-black/24 p-4" data-testid="culture-discovery-grid">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#d7ffab]">Explore</p>
          <h3 className="mt-2 text-xl font-extrabold text-white">{module.moduleTitle}</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/54">{module.moduleSubtitle}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white/50">
          {module.reason}
        </span>
      </div>
      <div className="-mx-1 mt-4 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {module.items.map((item) => (
          <Link
            key={item.id}
            href={item.route as Route}
            className="block w-44 shrink-0 overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04] transition hover:border-[#d7ffab]/28"
          >
            <div className="aspect-[4/5] bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="p-3">
              <p className="truncate text-sm font-black text-white">{item.title}</p>
              <p className="mt-1 line-clamp-2 min-h-9 text-xs leading-5 text-white/48">{item.subtitle}</p>
              <p className="mt-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#d7ffab]">{item.ctaLabel}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function ClientCultureScreen({
  feed,
  posts = [],
  surface = "client"
}: {
  feed?: CultureFeedResponse;
  posts?: ClientCulturePost[];
  surface?: CultureSurface;
}) {
  const feedItems = feed?.items ?? posts.map(legacyPostToFeedItem);
  const feedModules = feed?.modules ?? [];
  const feedError = feed?.error;
  const hasPosts = feedItems.length > 0;
  const discoverBarbersHref = surface === "client" ? CLIENT_PRIMARY_TAB_HREFS.search : "/discover";
  const viewShopsHref = surface === "client" ? `${CLIENT_PRIMARY_TAB_HREFS.search}?type=shops` : "/discover?type=shops";
  const discoverTitle = surface === "barber" ? "Discover styles" : "Discover barbers";
  const surfaceSubtitle = surface === "barber"
    ? "Cuts, styles, barbers, shops, and community."
    : surface === "shop"
      ? "Shops, teams, styles, barbers, and community."
      : "Cuts, shops, style, and community.";
  const roleContext = surface === "barber" ? "Barber Culture" : surface === "shop" ? "Shop Owner Culture" : "Client Culture";
  const profileTitle = surface === "barber"
    ? "My culture profile"
    : surface === "shop"
      ? "Promote shop"
      : "My culture profile";
  const profileCopy = surface === "barber"
    ? "Keep public barber identity, style, and Culture visibility connected."
    : surface === "shop"
      ? "Connect shop identity, team moments, and public shop profile visibility."
      : "Manage public creator identity when Culture tools unlock.";
  const postingTitle = surface === "barber"
    ? "Post your work"
    : surface === "shop"
      ? "Share Shop Culture"
      : "Share your next cut";
  const postingCopy = surface === "barber"
    ? "Create a draft and submit barber work for review."
    : surface === "shop"
      ? "Share shop updates, walk-ins, team moments, and local culture."
      : "Posting is coming soon.";
  const postingHref = surface === "barber"
    ? "/dashboard/barber/culture/new"
    : surface === "shop"
      ? "/dashboard/owner/culture/new"
      : null;
  const postingCard = (
    <>
      <Scissors className="h-5 w-5 text-[#d7ffab]" />
      <p className="mt-4 text-lg font-semibold text-white">{postingTitle}</p>
      <p className="mt-2 text-sm leading-6 text-white/58">{postingCopy}</p>
      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/24 px-3 py-2 text-xs uppercase tracking-[0.16em] text-white/54">
        <UsersRound className="h-3.5 w-3.5" />
        {postingHref ? "Open composer" : "Community ready"}
      </div>
    </>
  );

  return (
    <div className="space-y-4" data-testid="client-culture-screen">
      <CultureFeedHeader surface={surface} subtitle={surfaceSubtitle} roleContext={roleContext} />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="bvr-glass-card rounded-[28px] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="bvr-section-label">Feed</p>
              <h2 className="mt-2 text-2xl font-extrabold leading-tight text-white" data-display="true">Community pulse</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/58">
                Style drops, shop moments, and client proof will collect here as the BVRB3R community grows.
              </p>
            </div>
            <StatusBadge tone={feedError ? "danger" : hasPosts ? "green" : "neutral"}>{feedError ? "Feed error" : hasPosts ? "Live shell" : "Coming soon"}</StatusBadge>
          </div>

          <div className="mt-5 space-y-4">
            {feedError ? (
              <div className="rounded-[24px] border border-red-400/20 bg-red-500/10 p-5 text-sm text-red-100">
                {feedError}
              </div>
            ) : hasPosts ? feedItems.map((post, index) => (
              <Fragment key={post.id}>
                <CulturePostCard post={post} surface={surface} />
                {index === 0 ? feedModules.map((module) => (
                  <CultureDiscoveryGrid key={module.id} module={module} />
                )) : null}
              </Fragment>
            )) : (
              <div className="rounded-[24px] border border-dashed border-white/12 bg-black/18 p-5 text-sm text-white/58">
                {emptyFeedCopy(surface)}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
            <UsersRound className="h-5 w-5 text-[#d7ffab]" />
            <p className="mt-4 text-lg font-semibold text-white">{profileTitle}</p>
            <p className="mt-2 text-sm leading-6 text-white/58">{profileCopy}</p>
          </div>
          <Link href={discoverBarbersHref as Route} className="block rounded-[26px] border border-[#d7ffab]/16 bg-[#d7ffab]/8 p-5 transition hover:border-[#d7ffab]/34">
            <Search className="h-5 w-5 text-[#d7ffab]" />
            <p className="mt-4 text-lg font-semibold text-white">{discoverTitle}</p>
            <p className="mt-2 text-sm leading-6 text-white/58">{surface === "shop" ? "Find barbers, styles, and team prospects." : "Find barbers, styles, and local Culture signals."}</p>
          </Link>
          <Link href={viewShopsHref as Route} className="block rounded-[26px] border border-white/10 bg-black/20 p-5 transition hover:border-white/18">
            <Store className="h-5 w-5 text-[#baff69]" />
            <p className="mt-4 text-lg font-semibold text-white">View shops</p>
            <p className="mt-2 text-sm leading-6 text-white/58">Browse shops, chairs, and local supply.</p>
          </Link>
          <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
            <Bookmark className="h-5 w-5 text-[#d7ffab]" />
            <p className="mt-4 text-lg font-semibold text-white">Saved culture items</p>
            <p className="mt-2 text-sm leading-6 text-white/58">Saved and followed Culture items will use the canonical engagement graph.</p>
          </div>
          {postingHref ? (
            <Link href={postingHref as Route} className="block rounded-[26px] border border-[#d7ffab]/16 bg-[#d7ffab]/8 p-5 transition hover:border-[#d7ffab]/34">
              {postingCard}
            </Link>
          ) : (
            <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
              {postingCard}
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
