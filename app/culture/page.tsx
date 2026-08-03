import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { PublicCultureFeed } from "@/components/public-site/public-culture-feed";
import { PublicFooter } from "@/components/public-site/public-footer";
import { PublicNav } from "@/components/public-site/public-nav";
import styles from "@/components/public-site/public-site.module.css";
import { listCultureFeed, type CultureFeedResponse } from "@/lib/culture/service";

export const dynamic = "force-dynamic";

const getCachedPublicCultureFeed = unstable_cache(
  () => listCultureFeed({ role: "client", limit: 12, feedSessionId: "public-culture" }),
  ["public-culture-feed-v1"],
  { revalidate: 30, tags: ["public-culture-feed"] }
);

export const metadata: Metadata = {
  title: "Culture — BVRB3R",
  description: "Browse public barber work, meet the people behind it, and book the look through BVRB3R Culture.",
  alternates: {
    canonical: "/culture"
  }
};

async function loadPublicCultureFeed(): Promise<CultureFeedResponse> {
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Public Culture feed timed out.")), 3_000);
    });
    const feed = await Promise.race([getCachedPublicCultureFeed(), timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    return { ...feed, feedSessionId: feed.feedSessionId ?? "public-culture" };
  } catch (error) {
    console.error("[public-culture] feed_failed", {
      error: error instanceof Error ? error.message : "Unknown public Culture feed error."
    });

    return {
      items: [],
      cursor: null,
      hasMore: false,
      error: "Culture could not load right now. Guest discovery is still open."
    };
  }
}

export default async function PublicCulturePage() {
  const feed = await loadPublicCultureFeed();
  return (
    <div className={styles.marketingPage} data-public-site>
      <PublicNav active="/culture" />
      <main>
        <PublicCultureFeed initialFeed={feed} />
      </main>
      <PublicFooter />
    </div>
  );
}
