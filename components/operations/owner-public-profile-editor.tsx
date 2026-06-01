"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { buildShopProfileStudioViewModel } from "@/components/profile-studio/adapters/shop-profile-studio-adapter";
import { ProfileStudioShell } from "@/components/profile-studio/profile-studio-shell";
import { GlassCard } from "@/design/components";
import { useOwnerShopProfileQuery, useUpdateOwnerShopProfileMutation } from "@/lib/operations/barber-client";
import { getReadableActionError } from "@/lib/utils/feedback";
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
  const updateMutation = useUpdateOwnerShopProfileMutation();
  const [draft, setDraft] = useState<ShopPublicProfileDraft>(emptyDraft);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const mediaRef = useRef<HTMLDivElement | null>(null);
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

  function scrollTo(target: HTMLDivElement | null) {
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSave() {
    if (!shop?.id) {
      setFeedback({ tone: "error", message: "Finish shop setup before saving the public profile." });
      return;
    }

    if (!draft.name.trim()) {
      setFeedback({ tone: "error", message: "Shop name is required." });
      return;
    }

    setFeedback(null);
    try {
      await updateMutation.mutateAsync({
        shopId: shop.id,
        name: draft.name.trim(),
        shopUsername: draft.shopUsername.trim() || null,
        brandLine: draft.brandLine.trim() || null,
        publicBio: draft.publicBio.trim() || null,
        profilePhotoUrl: draft.profilePhotoUrl.trim() || null,
        coverPhotoUrl: draft.coverPhotoUrl.trim() || null,
        address: draft.address.trim() || null,
        neighborhood: draft.neighborhood.trim() || null,
        city: draft.city.trim() || null,
        state: draft.state.trim() || null,
        phone: draft.phone.trim() || null,
        publicHours: draft.publicHours.trim() || null,
        policies: draft.policies.trim() || null
      });
      await profileQuery.refetch();
      setFeedback({ tone: "success", message: "Public shop profile saved." });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    }
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
        onEdit={() => scrollTo(editorRef.current)}
        onMedia={() => scrollTo(mediaRef.current)}
        onPreview={() => {
          if (model.hero.publicUrl) {
            window.location.assign(model.hero.publicUrl);
          }
        }}
        onShare={() => {
          const path = model.hero.publicUrl ?? "/dashboard/owner/public-profile";
          void navigator.clipboard?.writeText(`${window.location.origin}${path}`);
        }}
        editorSlot={(
          <div ref={editorRef} className="scroll-mt-6">
            <GlassCard className="p-5 sm:p-6">
              <div className="mb-5">
                <p className="bvr-section-label">Edit profile</p>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.035em] text-white">Shop public profile studio</h2>
                <p className="mt-2 text-sm leading-6 text-white/56">
                  This edits the public business profile. Owner account details and private contact fields stay out of this page.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {([
                  ["name", "Shop name"],
                  ["shopUsername", "Shop @username/handle"],
                  ["profilePhotoUrl", "Logo URL"],
                  ["coverPhotoUrl", "Cover photo URL"],
                  ["brandLine", "Brand line"],
                  ["phone", "Public phone"],
                  ["address", "Address"],
                  ["neighborhood", "Neighborhood"],
                  ["city", "City"],
                  ["state", "State"]
                ] as Array<[keyof ShopPublicProfileDraft, string]>).map(([field, label]) => (
                  <label key={field} className="block text-sm font-bold text-white/72">
                    {label}
                    <Input value={draft[field]} onChange={(event) => updateDraft(field, event.target.value)} className="mt-2" />
                  </label>
                ))}
                <label className="block text-sm font-bold text-white/72 md:col-span-2">
                  Public bio
                  <textarea
                    value={draft.publicBio}
                    onChange={(event) => updateDraft("publicBio", event.target.value)}
                    className="mt-2 min-h-28 w-full rounded-[18px] border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/32 focus:border-[#a3ff12]/45 focus:ring-2 focus:ring-[#a3ff12]/18"
                  />
                </label>
                <label className="block text-sm font-bold text-white/72">
                  Public hours
                  <Input value={draft.publicHours} onChange={(event) => updateDraft("publicHours", event.target.value)} className="mt-2" />
                </label>
                <label className="block text-sm font-bold text-white/72">
                  Policies
                  <Input value={draft.policies} onChange={(event) => updateDraft("policies", event.target.value)} className="mt-2" />
                </label>
              </div>

              <div ref={mediaRef} className="mt-5 scroll-mt-6 rounded-[22px] border border-dashed border-white/10 bg-black/24 p-5">
                <p className="text-sm font-black text-white">Shop gallery and business media</p>
                <p className="mt-2 text-sm leading-6 text-white/56">
                  Use real shop photos, team photos, events, and brand images. Placeholder media stays out of the public profile.
                </p>
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button type="button" variant="secondary" className="min-h-12 flex-1 rounded-2xl border-white/10 bg-white/[0.035] text-white/76 hover:border-[#a3ff12]/30 hover:text-white">
                  Cancel
                </Button>
                <Button type="button" className="min-h-12 flex-1 rounded-2xl bg-[#a3ff12] text-black hover:bg-[#8de300]" disabled={updateMutation.isPending} aria-busy={updateMutation.isPending} onClick={() => void handleSave()}>
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </GlassCard>
          </div>
        )}
      />
    </div>
  );
}
