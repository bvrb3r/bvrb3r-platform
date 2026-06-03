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
    serviceAreaLabel?: string | null;
    publicAddress?: string | null;
    publicCity?: string | null;
    publicState?: string | null;
    publicZip?: string | null;
  };
  proof?: {
    followCount?: number | null;
    bookingsCompleted?: number | null;
    profileViews?: number | null;
    bookingClicks?: number | null;
  } | null;
  shop?: {
    name?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  } | null;
  shopLocations?: Array<{
    name?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
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

function formatFreelanceLocation(profile: BarberStudioProfile | null, fallback: string) {
  const profileData = profile?.profile;
  const address = profileData?.publicAddress?.trim() ?? "";
  const city = profileData?.publicCity?.trim() ?? "";
  const state = profileData?.publicState?.trim() ?? "";
  const zip = profileData?.publicZip?.trim() ?? "";
  const cityState = [city, state].filter(Boolean).join(", ");
  const cityStateZip = [cityState, zip].filter(Boolean).join(" ");
  return [address, cityStateZip].filter(Boolean).join(" / ")
    || profileData?.serviceAreaLabel?.trim()
    || fallback;
}

function formatShopControlledLocation(profile: BarberStudioProfile | null, fallback: string) {
  const shop = profile?.shop;
  const firstLocation = profile?.shopLocations?.[0];
  const address = shop?.address?.trim() || firstLocation?.address?.trim() || "";
  const city = shop?.city?.trim() || firstLocation?.city?.trim() || "";
  const state = shop?.state?.trim() || firstLocation?.state?.trim() || "";
  const zip = shop?.zipCode?.trim() || firstLocation?.postalCode?.trim() || "";
  const cityState = [city, state].filter(Boolean).join(", ");
  const cityStateZip = [cityState, zip].filter(Boolean).join(" ");
  return [shop?.name?.trim() || firstLocation?.name?.trim(), address, cityStateZip]
    .filter(Boolean)
    .join(" - ") || fallback;
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
  const isShopConnected = Boolean(profile?.shop);
  const contextLine = isShopConnected
    ? formatShopControlledLocation(profile, shopLabel)
    : formatFreelanceLocation(profile, shopLabel === "Independent barber" ? "" : shopLabel) || "Add service location.";

  return {
    role: "barber",
    page: {
      title: "Profile",
      subtitle: "Manage your profile & brand",
      statusText: "Professional profile studio. Clients use this profile to view your work, trust signals, availability, and booking context."
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
      contextLine,
      contextEditable: !isShopConnected,
      contextLocked: isShopConnected,
      contextActionLabel: "Edit public service location",
      bioEmptyCopy: "Add a public bio or story.",
      bioModalTitle: "Edit public barber bio",
      bioModalHelper: "This bio appears on your public barber profile before clients book.",
      contextModalTitle: "Edit public service location",
      contextModalHelper: "This service address appears on your public barber profile.",
      emptyTitle: "Finish barber profile",
      emptyBody: "Add a public bio or story to complete this profile."
    },
    actions: {
      publicPreviewLabel: "Public preview",
      mediaLabel: "Portfolio",
      shareLabel: "Share profile"
    },
    username: {
      title: "Public username",
      value: username,
      helperText: "Lowercase letters, numbers, hyphens, or underscores. If you leave it alone, BVRB3R keeps a stable fallback link.",
      canEdit: true,
      publicUrl: publicProfileHref,
      modalTitle: "Edit public username",
      modalHelper: "This is how clients find and share your barber profile."
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
    highlights: [
      { label: "New", type: "new" },
      { label: "Haircuts", type: "collection", imageUrl: portfolioAssets[0]?.imageUrl }
    ],
    work: {
      title: "Your work",
      countLabel: `${posts} post${posts === 1 ? "" : "s"}`,
      addLabel: "Add portfolio image",
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
