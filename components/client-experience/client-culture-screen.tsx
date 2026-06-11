import type { Route } from "next";
import Link from "next/link";
import { Bookmark, Heart, Images, MessageCircle, Scissors, Search, Store, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader, StatusBadge } from "@/design/components";
import { CLIENT_PRIMARY_TAB_HREFS } from "@/components/client-experience/client-tab-config";

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

export function ClientCultureScreen({
  posts = [],
  surface = "client"
}: {
  posts?: ClientCulturePost[];
  surface?: CultureSurface;
}) {
  const hasPosts = posts.length > 0;
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
    ? "Share professional work"
    : surface === "shop"
      ? "Share shop moments"
      : "Share your next cut";
  const postingCopy = surface === "barber"
    ? "Posting as a barber profile is available when your public profile is live and approved."
    : surface === "shop"
      ? "Posting as a shop brand is available when your public shop profile is live and approved."
      : "Posting is coming soon.";

  return (
    <div className="space-y-4" data-testid="client-culture-screen">
      <Card className="rounded-[34px] border-white/10 bg-[linear-gradient(180deg,rgba(17,17,17,0.96),rgba(6,6,6,0.98))] p-5 shadow-[0_26px_60px_rgba(0,0,0,0.24)] sm:p-6">
        <PageHeader
          label="Culture"
          title="Culture"
          subtitle={surfaceSubtitle}
        />
        <div className="mt-4 inline-flex rounded-full border border-[#d7ffab]/16 bg-[#d7ffab]/8 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#d7ffab]">
          {roleContext}
        </div>
      </Card>

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
            <StatusBadge tone={hasPosts ? "green" : "neutral"}>{hasPosts ? "Live shell" : "Coming soon"}</StatusBadge>
          </div>

          <div className="mt-5 space-y-4">
            {hasPosts ? posts.map((post) => (
              <article key={post.id} className="overflow-hidden rounded-[26px] border border-white/10 bg-black/20">
                <div className="aspect-[4/3] bg-[linear-gradient(135deg,rgba(124,255,0,0.16),rgba(255,255,255,0.06)_42%,rgba(0,0,0,0.78))]">
                  {post.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.mediaUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="rounded-full border border-[#d7ffab]/18 bg-black/36 p-5 text-[#d7ffab]">
                        <Images className="h-8 w-8" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{post.creatorName}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-white/42">{creatorRoleLabel(post.creatorRole)} - {post.createdAtLabel}</p>
                    </div>
                    <div className="flex items-center gap-2 text-white/58">
                      <Heart className="h-4 w-4" />
                      <MessageCircle className="h-4 w-4" />
                      <Bookmark className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-white/72">{post.caption}</p>
                  {post.bookingHref ? (
                    <Link href={post.bookingHref} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#A3FF12] px-5 text-sm font-black text-black transition hover:bg-[#8de300]">
                      Book
                    </Link>
                  ) : null}
                </div>
              </article>
            )) : (
              <div className="rounded-[24px] border border-dashed border-white/12 bg-black/18 p-5 text-sm text-white/58">
                Culture posts will appear here as the BVRB3R community grows.
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
          <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
            <Scissors className="h-5 w-5 text-[#d7ffab]" />
            <p className="mt-4 text-lg font-semibold text-white">{postingTitle}</p>
            <p className="mt-2 text-sm leading-6 text-white/58">{postingCopy}</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/24 px-3 py-2 text-xs uppercase tracking-[0.16em] text-white/54">
              <UsersRound className="h-3.5 w-3.5" />
              Community ready
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
