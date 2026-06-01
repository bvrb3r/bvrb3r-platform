"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { buildShopProfileStudioViewModel } from "@/components/profile-studio/adapters/shop-profile-studio-adapter";
import { ProfileImageEditButton } from "@/components/profile-studio/profile-image-edit-button";
import { ProfileStudioShell } from "@/components/profile-studio/profile-studio-shell";
import { useOwnerShopProfileQuery } from "@/lib/operations/barber-client";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import { uploadMediaAsset } from "@/lib/storage/media";
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

type PickerInput = HTMLInputElement & { showPicker?: () => void };

function openFilePicker(input: HTMLInputElement | null) {
  const picker = input as PickerInput | null;
  if (!picker) {
    return;
  }

  if (typeof picker.showPicker === "function") {
    try {
      picker.showPicker();
      return;
    } catch {
      // Browser-gated showPicker can fail; click() is the safe fallback.
    }
  }

  picker.click();
}

function validateImageFile(file: File | null) {
  if (!file) {
    return "Choose an image to upload.";
  }

  if (!file.type.startsWith("image/")) {
    return "Only image uploads are supported here.";
  }

  if (file.size > 8 * 1024 * 1024) {
    return "Images must stay under 8 MB.";
  }

  return null;
}

function safeSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shop";
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function OwnerPublicProfileEditor({ user }: { user: UserAccount }) {
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const profileQuery = useOwnerShopProfileQuery();
  const mediaQuery = useProfileMediaWorkspaceQuery(true);
  const mediaMutation = useMutateProfileMediaMutation();
  const [draft, setDraft] = useState<ShopPublicProfileDraft>(emptyDraft);
  const [feedback, setFeedback] = useState<{ tone: "info" | "success" | "error"; message: string } | null>(null);
  const shop = profileQuery.data?.shop ?? null;
  const loadErrorStatus = profileQuery.error && typeof profileQuery.error === "object" && "status" in profileQuery.error
    ? Number((profileQuery.error as { status?: number }).status)
    : null;
  const shopMedia = useMemo(() => {
    const shops = mediaQuery.data?.shops ?? [];
    return shops.find((entry) => entry.shopId === shop?.id) ?? shops[0] ?? null;
  }, [mediaQuery.data?.shops, shop?.id]);
  const effectiveShop = useMemo(() => {
    if (shop) {
      return shop;
    }

    if (!shopMedia) {
      return null;
    }

    return {
      id: shopMedia.shopId,
      name: shopMedia.name ?? shopMedia.label,
      brand_line: shopMedia.brandLine ?? null,
      public_bio: null,
      cover_photo_url: null,
      public_hours: null,
      policies: null,
      shop_username: null,
      neighborhood: shopMedia.neighborhood ?? null,
      city: shopMedia.city ?? null,
      state: shopMedia.state ?? null,
      phone: shopMedia.phone ?? null,
      address: shopMedia.address ?? null,
      profile_photo_path: shopMedia.profilePhotoPath ?? null,
      profile_photo_url: shopMedia.profilePhotoUrl ?? null,
      app_approval_status: null
    };
  }, [shop, shopMedia]);
  const showSetupState = !effectiveShop && (profileQuery.isLoading || loadErrorStatus === 404 || !profileQuery.error);

  useEffect(() => {
    if (!effectiveShop) {
      setDraft((current) => ({ ...current, name: user.ownedShopName ?? current.name }));
      return;
    }

    setDraft({
      name: effectiveShop.name ?? "",
      shopUsername: effectiveShop.shop_username ?? "",
      brandLine: effectiveShop.brand_line ?? "",
      publicBio: effectiveShop.public_bio ?? "",
      profilePhotoUrl: shopMedia?.profilePhotoUrl ?? effectiveShop.profile_photo_url ?? effectiveShop.profile_photo_path ?? "",
      coverPhotoUrl: effectiveShop.cover_photo_url ?? "",
      address: effectiveShop.address ?? "",
      neighborhood: effectiveShop.neighborhood ?? "",
      city: effectiveShop.city ?? "",
      state: effectiveShop.state ?? "",
      phone: effectiveShop.phone ?? "",
      publicHours: typeof effectiveShop.public_hours === "string" ? effectiveShop.public_hours : "",
      policies: effectiveShop.policies ?? ""
    });
  }, [effectiveShop, shopMedia?.profilePhotoUrl, user.ownedShopName]);

  const studioShop = useMemo(() => {
    if (!effectiveShop) {
      return null;
    }

    return {
      ...effectiveShop,
      name: draft.name || effectiveShop.name,
      shop_username: draft.shopUsername || effectiveShop.shop_username,
      brand_line: draft.brandLine || effectiveShop.brand_line,
      public_bio: draft.publicBio || effectiveShop.public_bio,
      profile_photo_url: shopMedia?.profilePhotoUrl || draft.profilePhotoUrl || effectiveShop.profile_photo_url,
      profile_photo_path: shopMedia?.profilePhotoPath || effectiveShop.profile_photo_path,
      cover_photo_url: draft.coverPhotoUrl || effectiveShop.cover_photo_url,
      address: draft.address || effectiveShop.address,
      neighborhood: draft.neighborhood || effectiveShop.neighborhood,
      city: draft.city || effectiveShop.city,
      state: draft.state || effectiveShop.state,
      phone: draft.phone || effectiveShop.phone,
      public_hours: draft.publicHours || effectiveShop.public_hours,
      policies: draft.policies || effectiveShop.policies,
      gallery: (shopMedia?.gallery ?? []).map((asset) => ({
        id: asset.id,
        image_url: asset.imageUrl,
        storage_path: asset.storagePath,
        caption: asset.caption,
        featured: asset.featured
      }))
    };
  }, [draft, effectiveShop, shopMedia]);

  const model = useMemo(() => buildShopProfileStudioViewModel({ shop: studioShop, user }), [studioShop, user]);

  function updateDraft(field: keyof ShopPublicProfileDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function uploadWithPath(path: string, file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    return uploadMediaAsset(`${path}/${Date.now()}.${extension}`, file);
  }

  async function handleShopPhotoUpload(file: File) {
    const shopId = effectiveShop?.id ?? shopMedia?.shopId;
    if (!shopId) {
      setFeedback({ tone: "error", message: "Finish shop profile before uploading a shop logo." });
      return;
    }

    const error = validateImageFile(file);
    if (error) {
      setFeedback({ tone: "error", message: error });
      return;
    }

    setFeedback(null);
    try {
      const uploaded = await uploadWithPath(`profiles/shops/${safeSegment(shopId)}/profile`, file);
      await mediaMutation.mutateAsync({
        action: "set_shop_photo",
        shopId,
        storagePath: uploaded.path,
        imageUrl: uploaded.publicUrl
      });
      updateDraft("profilePhotoUrl", uploaded.publicUrl);
      setFeedback({ tone: "success", message: "Shop logo updated." });
    } catch (errorValue) {
      setFeedback({ tone: "error", message: readableError(errorValue, "Unable to update shop logo.") });
    }
  }

  async function handleShopGalleryUpload(file: File) {
    const shopId = effectiveShop?.id ?? shopMedia?.shopId;
    if (!shopId) {
      setFeedback({ tone: "error", message: "Finish shop profile before uploading shop gallery media." });
      return;
    }

    const error = validateImageFile(file);
    if (error) {
      setFeedback({ tone: "error", message: error });
      return;
    }

    setFeedback(null);
    try {
      const uploaded = await uploadWithPath(`profiles/shops/${safeSegment(shopId)}/gallery`, file);
      await mediaMutation.mutateAsync({
        action: "add_shop_gallery_image",
        shopId,
        storagePath: uploaded.path,
        imageUrl: uploaded.publicUrl
      });
      setFeedback({ tone: "success", message: "Shop image added." });
    } catch (errorValue) {
      setFeedback({ tone: "error", message: readableError(errorValue, "Unable to add shop image.") });
    }
  }

  async function handleShopGalleryRemove(assetId: string) {
    const shopId = effectiveShop?.id ?? shopMedia?.shopId;
    if (!shopId) {
      setFeedback({ tone: "error", message: "Finish shop profile before managing shop gallery media." });
      return;
    }

    setFeedback(null);
    try {
      await mediaMutation.mutateAsync({
        action: "remove_shop_gallery_image",
        shopId,
        assetId
      });
      setFeedback({ tone: "success", message: "Shop image removed." });
    } catch (errorValue) {
      setFeedback({ tone: "error", message: readableError(errorValue, "Unable to remove image.") });
    }
  }

  return (
    <div data-testid="owner-public-profile-editor">
      {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
      {profileQuery.error && loadErrorStatus !== 404 && !effectiveShop ? <FeedbackBanner tone="error" message="Unable to load shop profile. Try again." /> : null}
      {showSetupState ? (
        <FeedbackBanner
          tone="info"
          message="Finish shop profile. Set your shop name, handle, address, photos, hours, and policies."
        />
      ) : null}
      <input
        ref={mediaInputRef}
        aria-label="Add shop image upload input"
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={async (event) => {
          const file = event.target.files?.[0] ?? null;
          event.currentTarget.value = "";
          if (file) {
            await handleShopGalleryUpload(file);
          }
        }}
      />

      <ProfileStudioShell
        model={model}
        backHref={"/dashboard/owner/more" as Route}
        backLabel="Back to More"
        usernameValue={draft.shopUsername || model.username.value}
        onUsernameChange={(value) => updateDraft("shopUsername", suggestHandle(value))}
        photoControl={(
          <ProfileImageEditButton
            label="Update shop logo"
            disabled={mediaMutation.isPending}
            onFileSelected={handleShopPhotoUpload}
          />
        )}
        onMedia={() => setFeedback({ tone: "info", message: "Team display is managed from Owner Home." })}
        onAddMedia={() => openFilePicker(mediaInputRef.current)}
        onDeleteMedia={(assetId) => void handleShopGalleryRemove(assetId)}
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
