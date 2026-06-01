"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { buildShopProfileStudioViewModel } from "@/components/profile-studio/adapters/shop-profile-studio-adapter";
import { ProfileImageEditButton } from "@/components/profile-studio/profile-image-edit-button";
import { ProfileStudioShell } from "@/components/profile-studio/profile-studio-shell";
import { useOwnerShopProfileQuery } from "@/lib/operations/barber-client";
import type { UserAccount } from "@/types/domain";

type ShopPublicProfileDraft = {
  name: string;
  shopUsername: string;
  brandLine: string;
  publicBio: string;
  profilePhotoUrl: string;
  coverPhotoUrl: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  phone: string;
  publicHours: string;
  policies: string;
};

const emptyDraft: ShopPublicProfileDraft = {
  name: "",
  shopUsername: "",
  brandLine: "",
  publicBio: "",
  profilePhotoUrl: "",
  coverPhotoUrl: "",
  address: "",
  neighborhood: "",
  city: "",
  state: "",
  phone: "",
  publicHours: "",
  policies: ""
};

function suggestHandle(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 32);
}

export function OwnerPublicProfileEditor({ user }: { user: UserAccount }) {
  const profileQuery = useOwnerShopProfileQuery();
  const [draft, setDraft] = useState<ShopPublicProfileDraft>(emptyDraft);
  const [feedback, setFeedback] = useState<{ tone: "info" | "success" | "error"; message: string } | null>(null);
  const shop = profileQuery.data?.shop ?? null;
  const loadErrorStatus = profileQuery.error && typeof profileQuery.error === "object" && "status" in profileQuery.error
    ? Number((profileQuery.error as { status?: number }).status)
    : null;
  const showSetupState = !shop && (profileQuery.isLoading || loadErrorStatus === 404 || !profileQuery.error);

  useEffect(() => {
    if (!shop) {
      setDraft((current) => ({ ...current, name: user.ownedShopName ?? current.name }));
      return;
    }

    setDraft({
      name: shop.name ?? "",
      shopUsername: shop.shop_username ?? "",
      brandLine: shop.brand_line ?? "",
      publicBio: shop.public_bio ?? "",
      profilePhotoUrl: shop.profile_photo_url ?? shop.profile_photo_path ?? "",
      coverPhotoUrl: shop.cover_photo_url ?? "",
      address: shop.address ?? "",
      neighborhood: shop.neighborhood ?? "",
      city: shop.city ?? "",
      state: shop.state ?? "",
      phone: shop.phone ?? "",
      publicHours: typeof shop.public_hours === "string" ? shop.public_hours : "",
      policies: shop.policies ?? ""
    });
  }, [shop, user.ownedShopName]);

  const studioShop = useMemo(() => {
    if (!shop) {
      return null;
    }

    return {
      ...shop,
      name: draft.name || shop.name,
      shop_username: draft.shopUsername || shop.shop_username,
      brand_line: draft.brandLine || shop.brand_line,
      public_bio: draft.publicBio || shop.public_bio,
      profile_photo_url: draft.profilePhotoUrl || shop.profile_photo_url,
      cover_photo_url: draft.coverPhotoUrl || shop.cover_photo_url,
      address: draft.address || shop.address,
      neighborhood: draft.neighborhood || shop.neighborhood,
      city: draft.city || shop.city,
      state: draft.state || shop.state,
      phone: draft.phone || shop.phone,
      public_hours: draft.publicHours || shop.public_hours,
      policies: draft.policies || shop.policies
    };
  }, [draft, shop]);

  const model = useMemo(() => buildShopProfileStudioViewModel({ shop: studioShop, user }), [studioShop, user]);

  function updateDraft(field: keyof ShopPublicProfileDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <div data-testid="owner-public-profile-editor">
      {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
      {profileQuery.error && loadErrorStatus !== 404 ? <FeedbackBanner tone="error" message="Unable to load shop profile. Try again." /> : null}
      {showSetupState ? (
        <FeedbackBanner
          tone="info"
          message="Finish shop profile. Set your shop name, handle, address, photos, hours, and policies."
        />
      ) : null}

      <ProfileStudioShell
        model={model}
        backHref={"/dashboard/owner/more" as Route}
        backLabel="Back to More"
        usernameValue={draft.shopUsername || model.username.value}
        onUsernameChange={(value) => updateDraft("shopUsername", suggestHandle(value))}
        photoControl={(
          <ProfileImageEditButton
            label="Update shop logo"
            // Owner account avatars stay in account surfaces; this studio edits the public shop brand image.
            onUnavailable={() => setFeedback({ tone: "info", message: "Shop logo upload is coming soon." })}
          />
        )}
        onMedia={() => setFeedback({ tone: "info", message: "Team display is managed from Owner Home." })}
        onPreview={() => {
          if (model.hero.publicUrl) {
            window.location.assign(model.hero.publicUrl);
            return;
          }
          setFeedback({ tone: "info", message: "Finish shop profile before opening a public preview." });
        }}
        onShare={async () => {
          const path = model.hero.publicUrl ?? "/dashboard/owner/public-profile";
          const url = `${window.location.origin}${path}`;
          if (navigator.share) {
            await navigator.share({ title: `${model.hero.publicName} on BVRB3R`, url });
          } else {
            await navigator.clipboard?.writeText(url);
          }
          setFeedback({ tone: "success", message: "Shop profile link copied." });
        }}
      />
    </div>
  );
}
