import type { ProfileStudioViewModel } from "@/components/profile-studio/profile-studio-shell";
import type { OwnerShopProfileResponse } from "@/lib/operations/barber-client";
import type { UserAccount } from "@/types/domain";

type OwnerShopProfile = OwnerShopProfileResponse["shop"] & {
  public_barber_count?: number | null;
  gallery?: Array<{ id: string; image_url?: string | null; caption?: string | null; featured?: boolean | null }> | null;
};

function suggestHandle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 32);
}

function formatLocation(shop: OwnerShopProfile | null) {
  if (!shop) {
    return "";
  }

  const isPublicPlaceholder = (part: string) => !part.replace(/[,\s-]/g, "") || /^pending(?:pending)*$/i.test(part.replace(/[,\s-]/g, ""));
  const cityState = [shop.city, shop.state].filter(Boolean).join(", ");
  const cityStateZip = [cityState, (shop as { zip_code?: string | null; zipCode?: string | null }).zip_code ?? (shop as { zipCode?: string | null }).zipCode].filter(Boolean).join(" ");
  return [shop.address, cityStateZip]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part && !isPublicPlaceholder(part))
    .join(" - ");
}

function getShopUsername(shop: OwnerShopProfile | null) {
  const publicUsername = (shop as { public_username?: string | null } | null)?.public_username?.trim();
  return publicUsername || shop?.shop_username?.trim() || "";
}

export function buildShopProfileStudioViewModel({
  shop,
  user
}: {
  shop: OwnerShopProfile | null;
  user: UserAccount;
}): ProfileStudioViewModel {
  const shopName = shop?.name?.trim() || user.ownedShopName || "Finish shop profile";
  const handle = getShopUsername(shop) || suggestHandle(shopName);
  const location = formatLocation(shop);
  const publicBarberCount = typeof shop?.public_barber_count === "number" ? shop.public_barber_count : null;
  const gallery = shop?.gallery ?? [];
  const isApproved = shop?.app_approval_status === "approved";
  return {
    role: "shop_owner",
    page: {
      title: "Public Profile",
      subtitle: "Manage your shop profile & brand",
      statusText: shop
        ? "This public shop profile helps clients understand the shop, team, policies, and booking context."
        : "Finish shop profile. Set your shop name, handle, address, photos, hours, and policies."
    },
    hero: {
      label: "Public shop brand",
      title: "Public Profile",
      subtitle: "Shape the public business profile clients see before choosing a shop or barber.",
      publicName: shopName,
      username: handle || null,
      publicUrl: shop?.id ? `/shop/${encodeURIComponent(handle || shop.id)}` : null,
      avatarUrl: shop?.profile_photo_url ?? shop?.profile_photo_path ?? null,
      coverUrl: shop?.cover_photo_url ?? null,
      badge: isApproved ? "Verified shop" : shop ? "Setup needed" : "Public shop profile",
      bio: shop?.public_bio || shop?.brand_line || "",
      contextLine: location || "Add shop address.",
      contextEditable: Boolean(shop),
      bioEmptyCopy: "Add a public shop bio.",
      bioModalTitle: "Edit public shop bio",
      bioModalHelper: "This bio appears on your public shop profile before clients choose a shop or barber.",
      contextModalTitle: "Edit shop public location",
      contextModalHelper: "This address appears on your public shop profile.",
      emptyTitle: "Finish shop profile",
      emptyBody: "Set your shop name, handle, address, photos, hours, and policies."
    },
    actions: {
      publicPreviewLabel: "Public preview",
      mediaLabel: "Team",
      shareLabel: "Share profile"
    },
    username: {
      title: "Public shop username",
      value: handle,
      helperText: "Lowercase letters, numbers, hyphens, or underscores. If you leave it alone, BVRB3R keeps a stable fallback shop link.",
      canEdit: true,
      publicUrl: shop?.id ? `/shop/${encodeURIComponent(handle || shop.id)}` : null,
      modalTitle: "Edit public shop username",
      modalHelper: "This is how clients find and share your shop profile."
    },
    stats: [
      { label: "Posts", value: gallery.length },
      { label: "Followers", value: 0 },
      { label: "Public barbers", value: publicBarberCount ?? 0 }
    ],
    trustCards: [
      { title: "Rating", value: "--", helper: "Reviews build with completed visits.", status: "neutral" },
      { title: "Public barbers", value: `${publicBarberCount ?? 0} Public barbers`, helper: "Show team members when they are ready for public display.", status: publicBarberCount ? "good" : "neutral" },
      { title: "Shop status", value: isApproved ? "Approved" : "Setup needed", helper: isApproved ? "Shop verification" : "Complete your shop profile.", status: isApproved ? "good" : "warning" }
    ],
    dashboardSummary: {
      title: "Your dashboard",
      text: "0 shop profile views, 0 booking clicks."
    },
    highlights: [
      { label: "New", type: "new" },
      { label: "Shop", type: "collection" }
    ],
    work: {
      title: "Shop gallery",
      countLabel: `${gallery.length} post${gallery.length === 1 ? "" : "s"}`,
      addLabel: "Add shop image",
      emptyCopy: "No shop gallery media yet. Add real shop photos when gallery uploads are connected.",
      items: gallery.map((item) => ({
        id: item.id,
        imageUrl: item.image_url,
        alt: item.caption || `${shopName} shop gallery image`,
        caption: item.caption
      }))
    }
  };
}
