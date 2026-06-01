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

  const cityState = [shop.city, shop.state].filter(Boolean).join(", ");
  return [shop.address, shop.neighborhood, cityState].filter(Boolean).join(" - ");
}

function hasValue(value: unknown) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

export function buildShopProfileStudioViewModel({
  shop,
  user
}: {
  shop: OwnerShopProfile | null;
  user: UserAccount;
}): ProfileStudioViewModel {
  const shopName = shop?.name?.trim() || user.ownedShopName || "Finish shop profile";
  const handle = shop?.shop_username?.trim() || suggestHandle(shopName);
  const location = formatLocation(shop);
  const publicBarberCount = typeof shop?.public_barber_count === "number" ? shop.public_barber_count : null;
  const gallery = shop?.gallery ?? [];
  const isApproved = shop?.app_approval_status === "approved";
  const readinessItems = [
    hasValue(shop?.name) ? null : "Set the public shop name",
    hasValue(shop?.shop_username) ? null : "Set the public shop username",
    hasValue(shop?.address) || hasValue(shop?.city) ? null : "Add address and city",
    hasValue(shop?.public_hours) ? null : "Add public hours",
    hasValue(shop?.policies) ? null : "Add shop policies",
    publicBarberCount && publicBarberCount > 0 ? null : "Connect visible public team barbers",
    gallery.length ? null : "Add real shop gallery media"
  ].filter(Boolean) as string[];

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
      contextLine: location || "Address, hours, team, and public media belong here.",
      emptyTitle: "Finish shop profile",
      emptyBody: "Set your shop name, handle, address, photos, hours, and policies."
    },
    actions: {
      publicPreviewLabel: "Public preview",
      editProfileLabel: "Edit profile",
      mediaLabel: "Team",
      shareLabel: "Share profile"
    },
    username: {
      title: "Public shop username",
      value: handle,
      helperText: "Lowercase letters, numbers, hyphens, or underscores. If you leave it alone, BVRB3R keeps a stable fallback shop link.",
      canEdit: true,
      publicUrl: shop?.id ? `/shop/${encodeURIComponent(handle || shop.id)}` : null
    },
    stats: [
      ...(publicBarberCount === null ? [] : [{ label: "Public barbers", value: publicBarberCount, helper: "Visible team" }]),
      ...(gallery.length ? [{ label: "Gallery", value: gallery.length, helper: "Real media" }] : [])
    ],
    readiness: {
      title: "Profile readiness",
      subtitle: "Shop-facing trust",
      description: "Keep your shop profile ready with real address, hours, policies, team, and public media.",
      cards: [
        { title: "Shop verification", value: isApproved ? "Approved" : "Setup", helper: isApproved ? "Verified shop badge can appear publicly." : "Finish approval and profile setup.", severity: isApproved ? "good" : "warning" },
        { title: "Address", value: hasValue(shop?.address) || hasValue(shop?.city) ? "Ready" : "Missing", helper: "Clients need real location context.", severity: hasValue(shop?.address) || hasValue(shop?.city) ? "good" : "warning" },
        { title: "Hours", value: hasValue(shop?.public_hours) ? "Ready" : "Setup", helper: "Public hours clarify planning.", severity: hasValue(shop?.public_hours) ? "good" : "warning" },
        { title: "Policies", value: hasValue(shop?.policies) ? "Ready" : "Setup", helper: "Policies set expectations before booking.", severity: hasValue(shop?.policies) ? "good" : "warning" },
        { title: "Public team", value: publicBarberCount ?? "Not connected", helper: "Visible active barbers appear on the shop profile.", severity: publicBarberCount ? "good" : "neutral" },
        { title: "Shop gallery", value: gallery.length, helper: "Only real shop media appears here.", severity: gallery.length ? "good" : "neutral" },
        { title: "Booking readiness", value: shop ? "Review" : "Setup", helper: "Shop booking context stays separate from account controls.", severity: shop ? "neutral" : "warning" }
      ],
      needsAttention: readinessItems
    },
    identity: {
      title: "Public identity",
      subtitle: "What clients see",
      description: "Your shop logo, gallery, team, policies, hours, and booking context stay client-facing here.",
      cards: [
        { title: "Shop logo", value: hasValue(shop?.profile_photo_url) || hasValue(shop?.profile_photo_path) ? "Live" : "Setup", helper: "The public logo anchors the shop card and profile." },
        { title: "Shop gallery", value: gallery.length, helper: "Gallery media should be real shop, team, event, or brand images." },
        { title: "Public team", value: publicBarberCount ?? "Not connected", helper: "Team visibility is controlled from Owner Home." },
        { title: "Hours and policies", value: hasValue(shop?.public_hours) || hasValue(shop?.policies) ? "In progress" : "Setup", helper: "Hours and policies help clients understand the shop before choosing." }
      ]
    },
    media: {
      title: "Shop gallery and business media",
      subtitle: "Upload real shop photos, team photos, events, and brand images. No placeholder media.",
      addButtonLabel: "Add shop image",
      emptyCopy: "No shop gallery media yet. Add real shop photos when gallery uploads are connected; no placeholder media is shown.",
      items: gallery.map((item) => ({
        id: item.id,
        url: item.image_url,
        caption: item.caption,
        featured: Boolean(item.featured)
      }))
    },
    preview: {
      title: "Shop public preview",
      subtitle: "This is what other users see.",
      enabled: Boolean(shop),
      actions: ["View team", "Book with shop", "Message", "Follow", "Share"]
    }
  };
}
