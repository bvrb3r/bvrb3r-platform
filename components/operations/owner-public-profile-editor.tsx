"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ImagePlus, Store, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
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

export function OwnerPublicProfileEditor({ user }: { user: UserAccount }) {
  const profileQuery = useOwnerShopProfileQuery();
  const updateMutation = useUpdateOwnerShopProfileMutation();
  const [draft, setDraft] = useState<ShopPublicProfileDraft>(emptyDraft);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const shop = profileQuery.data?.shop ?? null;
  const shopName = draft.name || shop?.name || user.ownedShopName || "Finish shop profile";
  const shopHandle = draft.shopUsername || shop?.shop_username || "";
  const publicShopHref = shop?.id ? `/shop/${encodeURIComponent(shop.id)}` : null;

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

  function updateDraft(field: keyof ShopPublicProfileDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
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
    <div className="space-y-5" data-testid="owner-public-profile-editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#A3FF12]">Shop profile</p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl">Public Profile</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">
            Edit the public business profile clients use to understand the shop, team, policies, and booking context.
          </p>
        </div>
        <Link
          href="/dashboard/owner/more"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/76 transition hover:border-[#A3FF12]/30 hover:text-[#A3FF12]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to More
        </Link>
      </div>

      {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
      {profileQuery.error ? <FeedbackBanner tone="error" message="Unable to load shop profile. Try again from Owner Home or More." /> : null}

      <GlassCard active className="overflow-hidden p-0">
        <div
          className="h-40 border-b border-white/8 bg-[linear-gradient(135deg,rgba(163,255,18,0.18),rgba(255,255,255,0.04)_42%,rgba(0,0,0,0.25))]"
          style={draft.coverPhotoUrl ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,0.12),rgba(0,0,0,0.42)), url(${draft.coverPhotoUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        />
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
          <div className="-mt-16 flex h-32 w-32 items-center justify-center overflow-hidden rounded-[32px] border-2 border-[#A3FF12]/55 bg-black text-3xl font-black text-[#A3FF12] shadow-[0_22px_60px_rgba(0,0,0,0.48)]">
            {draft.profilePhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.profilePhotoUrl} alt={`${shopName} logo`} className="h-full w-full object-cover" />
            ) : (
              shopName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "BV"
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Preview</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.045em] text-white">{shopName}</h2>
            <p className="mt-1 text-sm font-bold text-white/54">{shopHandle ? `@${shopHandle}` : "Set your public shop handle"}</p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/58">
              {draft.publicBio || draft.brandLine || "Set your shop name, handle, address, photos, hours, and policies."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:flex-col">
            {publicShopHref ? (
              <Link
                href={publicShopHref as never}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/78 transition hover:border-[#A3FF12]/30 hover:text-[#A3FF12]"
              >
                Preview
              </Link>
            ) : null}
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          {([
            ["name", "Shop name"],
            ["shopUsername", "Shop @username/handle"],
            ["profilePhotoUrl", "Logo URL"],
            ["coverPhotoUrl", "Cover photo URL"],
            ["brandLine", "Brand line"],
            ["phone", "Phone"],
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
              className="mt-2 min-h-28 w-full rounded-[18px] border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none transition placeholder:text-white/32 focus:border-[#A3FF12]/45 focus:ring-2 focus:ring-[#A3FF12]/18"
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

        <div className="mt-5 grid gap-3 rounded-[22px] border border-white/8 bg-black/24 p-4 sm:grid-cols-3">
          {[
            { icon: Store, title: "Business profile", detail: "Name, handle, address, phone, and bio." },
            { icon: ImagePlus, title: "Branding", detail: "Logo and cover image feed the public profile." },
            { icon: Users, title: "Team preview", detail: "Visible team barbers are controlled from Owner Home." }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-[#A3FF12]/20 bg-[#A3FF12]/10 text-[#A3FF12]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-black text-white">{item.title}</p>
                  <p className="mt-1 text-sm leading-5 text-white/54">{item.detail}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard/owner/more" className="inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/76 transition hover:border-[#A3FF12]/30 hover:text-[#A3FF12]">
            Cancel
          </Link>
          <Button type="button" className="min-h-12 flex-1 rounded-2xl bg-[#A3FF12] text-black hover:bg-[#8de300]" disabled={updateMutation.isPending} aria-busy={updateMutation.isPending} onClick={() => void handleSave()}>
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
