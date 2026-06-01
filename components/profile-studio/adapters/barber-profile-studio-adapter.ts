import type { ProfileStudioViewModel } from "@/components/profile-studio/profile-studio-shell";

type BarberStudioProfile = {
  barber: {
    id: string;
    name: string;
    bio?: string | null;
    bookingLink?: string | null;
  };
  profile: {
    username?: string | null;
    profilePhotoUrl?: string | null;
    headline?: string | null;
    yearsExperience?: number | null;
  };
  proof?: {
    followCount?: number | null;
    bookingsCompleted?: number | null;
    profileViews?: number | null;
    bookingClicks?: number | null;
  } | null;
  shop?: {
    name?: string | null;
  } | null;
  shopLocations?: Array<{
    name?: string | null;
  }>;
  portfolio?: Array<{
    id: string;
    imageUrl?: string | null;
    caption?: string | null;
    featured?: boolean | null;
  }>;
  reviews?: Array<unknown>;
  mostBookedService?: {
    service: {
      name?: string | null;
    };
  } | null;
};

function compactNumber(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "0";
  }

  return new Intl.NumberFormat("en-US", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0
  }).format(value);
}

function formatRating(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return "--";
  }

  return value.toFixed(1);
}

function formatYears(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) {
    return "--";
  }

  return `${value} ${value === 1 ? "Year" : "Years"}`;
}

export function buildBarberProfileStudioViewModel({
  profile,
  barberName,
  profilePhotoUrl,
  portfolioAssets,
  reviewScore,
  reviewCount,
  reputationLabel,
  identityLine,
  shopLabel,
  publicProfileHref,
  username
}: {
  profile: BarberStudioProfile | null;
  barberName: string;
  profilePhotoUrl?: string | null;
  portfolioAssets: Array<{ id: string; imageUrl?: string | null; caption?: string | null; featured?: boolean | null }>;
  reviewScore?: number | null;
  reviewCount?: number | null;
  reputationLabel: string;
  identityLine: string;
  shopLabel: string;
  publicProfileHref: string | null;
  username: string;
}): ProfileStudioViewModel {
  const posts = portfolioAssets.length;
  const bookings = profile?.proof?.bookingsCompleted ?? 0;
  const followers = profile?.proof?.followCount ?? 0;

  return {
    role: "barber",
    page: {
      title: "Profile",
      subtitle: "Manage your profile & brand",
      statusText: "Profile already synced."
    },
    hero: {
      label: "Public barber brand",
      title: "Profile",
      subtitle: "The client-facing preview, portfolio, trust signals, and booking profile live here.",
      publicName: profile?.barber.name ?? barberName,
      username,
      publicUrl: publicProfileHref ?? profile?.barber.bookingLink ?? null,
      avatarUrl: profilePhotoUrl,
      badge: reputationLabel,
      bio: identityLine,
      contextLine: shopLabel,
      emptyTitle: "Finish barber profile",
      emptyBody: `${barberName} on the BVRB3R network.`
    },
    actions: {
      publicPreviewLabel: "Public preview",
      editProfileLabel: "Edit profile",
      mediaLabel: "Portfolio",
      shareLabel: "Share profile"
    },
    username: {
      title: "Public username",
      value: username,
      helperText: "Lowercase letters, numbers, hyphens, or underscores. If you leave it alone, BVRB3R keeps a stable fallback link.",
      canEdit: true,
      publicUrl: publicProfileHref
    },
    stats: [
      { label: "Posts", value: compactNumber(posts) },
      { label: "Followers", value: compactNumber(followers) },
      { label: "Bookings", value: compactNumber(bookings) }
    ],
    trustCards: [
      { title: "Rating", value: `${formatRating(reviewScore)} Rating`, helper: reviewCount ? `${compactNumber(reviewCount)} reviews` : "Reviews building", status: reviewScore ? "good" : "neutral" },
      { title: "Bookings", value: `${compactNumber(bookings)} Bookings`, helper: profile?.mostBookedService?.service.name ?? "Completed", status: bookings ? "good" : "neutral" },
      { title: "Experience", value: formatYears(profile?.profile.yearsExperience), helper: "Verification pending", status: "neutral" }
    ],
    dashboardSummary: {
      title: "Your dashboard",
      text: `${compactNumber(profile?.proof?.profileViews)} profile views, ${compactNumber(profile?.proof?.bookingClicks)} booking clicks.`
    },
    secondaryActions: [
      { label: "Edit profile", intent: "edit_profile" },
      { label: "Share profile", intent: "share_profile" }
    ],
    highlights: [
      { label: "New", type: "new" },
      { label: "Haircuts", type: "collection", imageUrl: portfolioAssets[0]?.imageUrl }
    ],
    work: {
      title: "Your work",
      countLabel: `${posts} post${posts === 1 ? "" : "s"}`,
      manageLabel: "Manage",
      emptyCopy: "No portfolio work yet. Add haircut photos to build trust with clients.",
      items: portfolioAssets.map((asset) => ({
        id: asset.id,
        imageUrl: asset.imageUrl,
        alt: asset.caption || `${barberName} portfolio work`,
        caption: asset.caption
      }))
    }
  };
}
