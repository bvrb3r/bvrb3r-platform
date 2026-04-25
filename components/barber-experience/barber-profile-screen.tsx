"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  CalendarDays,
  Camera,
  ImagePlus,
  Settings2,
  ShieldCheck,
  Star
} from "lucide-react";
import { BarberSettingsScreen } from "@/components/barber-experience/barber-settings-screen";
import { PublicBarberProfile } from "@/components/marketplace/public-barber-profile";
import { GalleryManagerCard, ProfilePhotoManagerCard } from "@/components/profile/profile-media-manager";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { useBarberProfileQuery } from "@/lib/booking/client";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import { uploadMediaAsset } from "@/lib/storage/media";
import { useBarberTrustSummary } from "@/lib/trust/client";
import { currency } from "@/lib/utils";
import type { UserAccount } from "@/types/domain";

const sectionIdMap = {
  preview: "barber-profile-preview",
  portfolio: "barber-profile-portfolio",
  services: "barber-profile-services",
  reviews: "barber-profile-reviews",
  settings: "barber-profile-settings",
  payouts: "barber-profile-settings"
} as const;

type ProfileSectionKey = keyof typeof sectionIdMap;

type ProfileSettingsSection = "account" | "business" | "verification" | "payouts" | "support";

function initialsForName(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function toStorageSafeSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "profile";
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function BarberProfileScreen({
  user,
  initialSection
}: {
  user: UserAccount;
  initialSection?: string;
}) {
  const barberId = user.barberId;
  const barberName = user.name;
  const userEmail = user.email;
  const profileQuery = useBarberProfileQuery(barberId);
  const mediaQuery = useProfileMediaWorkspaceQuery(true);
  const mediaMutation = useMutateProfileMediaMutation();
  const trustQuery = useBarberTrustSummary(true);
  const selectedSection = (initialSection && initialSection in sectionIdMap ? initialSection : null) as ProfileSectionKey | null;
  const settingsSection = (initialSection && ["account", "business", "verification", "payouts", "support"].includes(initialSection)
    ? initialSection
    : undefined) as ProfileSettingsSection | undefined;
  const barberMedia = mediaQuery.data?.barberProfile ?? null;
  const profile = profileQuery.data ?? null;
  const verificationDecision = trustQuery.data?.verificationDecision;
  const completenessItems = [
    profile?.profile.profilePhotoUrl || barberMedia?.profilePhotoUrl ? null : "Add a public profile photo",
    profile?.profile.headline?.trim() ? null : "Add a public bio/headline",
    profile?.profile.specialties?.length ? null : "Add specialties",
    profile?.services.length ? null : "Publish services",
    profile?.portfolio.length || barberMedia?.gallery.length ? null : "Upload portfolio work",
    verificationDecision?.gates.badge?.allowed ? null : "Clear trust badge verification"
  ].filter(Boolean) as string[];
  const status = mediaMutation.error
    ? { tone: "error" as const, message: readableError(mediaMutation.error, "Unable to update barber profile media right now.") }
    : null;

  useEffect(() => {
    if (!selectedSection) {
      return;
    }

    const target = document.getElementById(sectionIdMap[selectedSection]);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedSection, barberMedia, profile]);

  async function uploadWithPath(path: string, file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    return uploadMediaAsset(`${path}/${Date.now()}.${extension}`, file);
  }

  async function handleBarberPhotoUpload(file: File) {
    if (!barberMedia) {
      return;
    }

    const uploaded = await uploadWithPath(`profiles/barbers/${barberMedia.barberId}/profile`, file);
    await mediaMutation.mutateAsync({
      action: "set_barber_photo",
      storagePath: uploaded.path,
      imageUrl: uploaded.publicUrl
    });
  }

  async function handleBarberGalleryUpload(file: File, options: { caption: string; featured: boolean }) {
    if (!barberMedia) {
      return;
    }

    const uploaded = await uploadWithPath(`profiles/barbers/${barberMedia.barberId}/gallery`, file);
    await mediaMutation.mutateAsync({
      action: "add_barber_gallery_image",
      storagePath: uploaded.path,
      imageUrl: uploaded.publicUrl,
      caption: options.caption,
      featured: options.featured
    });
  }

  return (
    <div className="space-y-4" data-testid="barber-profile-screen">
      {status ? <FeedbackBanner tone={status.tone} message={status.message} /> : null}
      {profileQuery.error ? <FeedbackBanner tone="error" message={readableError(profileQuery.error, "Unable to load the public barber profile preview right now.")} /> : null}

      <Card className="rounded-[32px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="surface-label">Profile</p>
            <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">
              {barberName}
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">
              This is where the barber controls the full profile story: public trust on top, private setup and payout posture underneath.
            </p>
          </div>
          <div className="rounded-[24px] border border-[#7cff00]/16 bg-[#7cff00]/10 px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Client-facing profile</p>
            <p className="mt-2 text-sm font-medium text-white">
              {profile?.reviews.length ?? 0} review{(profile?.reviews.length ?? 0) === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-sm text-white/58">
              {profile?.services.length ?? 0} visible service{(profile?.services.length ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="#barber-profile-preview" className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/20 hover:text-[#d7ffab]">
            Preview
          </Link>
          <Link href="#barber-profile-portfolio" className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/20 hover:text-[#d7ffab]">
            Portfolio
          </Link>
          <Link href="#barber-profile-services" className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/20 hover:text-[#d7ffab]">
            Services
          </Link>
          <Link href="#barber-profile-reviews" className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/20 hover:text-[#d7ffab]">
            Reviews
          </Link>
          <Link href="#barber-profile-settings" className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7cff00]/20 hover:text-[#d7ffab]">
            Settings
          </Link>
        </div>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[0.96fr_1.04fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="surface-label">Profile completeness</p>
              <p className="mt-2 text-sm text-white/58">
                Keep discovery trust high by tightening the public story clients actually see.
              </p>
            </div>
            <ShieldCheck className="h-5 w-5 text-[#baff69]" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-[#7cff00]/18 bg-[#7cff00]/8 p-4">
              <p className="surface-label text-[#d7ffab]">Trust preview</p>
              <p className="mt-3 text-2xl font-semibold text-white">{trustQuery.data?.trustScore ?? 0}</p>
              <p className="mt-2 text-sm text-white/62">{trustQuery.data?.publicBadgePreview?.[0] ?? "Verification still building"}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Starting price</p>
              <p className="mt-3 text-2xl font-semibold text-white">
                {profile?.priceRange?.length ? currency(profile.priceRange[0]) : "--"}
              </p>
              <p className="mt-2 text-sm text-white/58">Visible to clients on discovery and booking entry.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Next opening</p>
              <p className="mt-3 text-lg font-semibold text-white">{profile?.nextAvailableAt ? "Live" : "Pending"}</p>
              <p className="mt-2 text-sm text-white/58">
                {profile?.nextAvailableAt ? "Availability is visible from the canonical booking engine." : "Next availability appears once the schedule is set."}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4">
            <p className="surface-label">What still needs love</p>
            <div className="mt-3 space-y-2 text-sm text-white/62">
              {completenessItems.length ? completenessItems.map((item) => (
                <p key={item}>- {item}</p>
              )) : <p>Your public barber profile already covers the core trust surfaces.</p>}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {profile?.profile.username ? (
              <Link href={`/barber/${profile.profile.username}`} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#cfff93]/40 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-black shadow-[0_14px_34px_rgba(124,255,0,0.24)] transition hover:-translate-y-0.5 sm:px-5 sm:text-[11px] sm:tracking-[0.22em]">
                Open public profile
              </Link>
            ) : null}
            <Link href="/dashboard/barber/calendar" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7cff00]/20 hover:text-[#d7ffab] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]">
              Update availability
            </Link>
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="surface-label">Public identity snapshot</p>
              <p className="mt-2 text-sm text-white/58">
                Clients see this mix of image, headline, services, and review proof before they book.
              </p>
            </div>
            <Star className="h-5 w-5 text-[#d7ffab]" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78">
                <Camera className="h-4 w-4 text-[#baff69]" />
                Public photo
              </div>
              <p className="mt-3 text-lg font-semibold text-white">
                {profile?.profile.profilePhotoUrl || barberMedia?.profilePhotoUrl ? "Live" : "Missing"}
              </p>
              <p className="mt-2 text-sm text-white/58">
                {profile?.profile.headline ?? "No public headline saved yet."}
              </p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78">
                <ImagePlus className="h-4 w-4 text-[#d7ffab]" />
                Discovery uploads
              </div>
              <p className="mt-3 text-lg font-semibold text-white">{profile?.portfolio.length ?? barberMedia?.gallery.length ?? 0} image{(profile?.portfolio.length ?? barberMedia?.gallery.length ?? 0) === 1 ? "" : "s"}</p>
              <p className="mt-2 text-sm text-white/58">
                Featured haircut photos feed barber trust and discovery conversion.
              </p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78">
                <CalendarDays className="h-4 w-4 text-[#baff69]" />
                Services shown
              </div>
              <p className="mt-3 text-lg font-semibold text-white">{profile?.services.length ?? 0}</p>
              <p className="mt-2 text-sm text-white/58">
                Service descriptions, duration, and pricing all stay visible to clients here.
              </p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78">
                <ShieldCheck className="h-4 w-4 text-[#d7ffab]" />
                Public trust
              </div>
              <p className="mt-3 text-lg font-semibold text-white">
                {verificationDecision?.gates.badge?.allowed ? "Visible" : "Restricted"}
              </p>
              <p className="mt-2 text-sm text-white/58">
                {trustQuery.data?.publicBadgePreview?.join(" | ") || "Trust badges will appear here as verification clears."}
              </p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4 sm:col-span-2">
              <div className="inline-flex items-center gap-2 text-sm text-white/78">
                <Settings2 className="h-4 w-4 text-[#baff69]" />
                Profile settings
              </div>
              <p className="mt-3 text-lg font-semibold text-white">Verification, payouts, and account controls live here too.</p>
              <p className="mt-2 text-sm text-white/58">
                Business model, shop association, Stripe Connect readiness, notifications, and support now live under this Profile tab instead of a separate barber settings tab.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {barberMedia ? (
        <section id="barber-profile-portfolio" className="grid scroll-mt-6 gap-4 lg:grid-cols-[0.94fr_1.06fr]">
          <ProfilePhotoManagerCard
            title="Public barber photo"
            subtitle="This image anchors the barber profile card clients see first."
            imageUrl={barberMedia.profilePhotoUrl}
            fallbackLabel={initialsForName(barberName)}
            uploadLabel="Update public photo"
            onUpload={handleBarberPhotoUpload}
            onRemove={async () => {
              await mediaMutation.mutateAsync({ action: "remove_barber_photo" });
            }}
            isBusy={mediaMutation.isPending}
          />

          <GalleryManagerCard
            title="Portfolio and discovery uploads"
            subtitle="Upload real haircut work for the profile and discovery feed. No placeholder media, no fake portfolio."
            assets={barberMedia.gallery}
            uploadLabel="Add haircut image"
            emptyCopy="No portfolio photos yet. Upload real work here so clients can trust the profile before they book."
            onUpload={handleBarberGalleryUpload}
            onRemove={async (assetId) => {
              await mediaMutation.mutateAsync({
                action: "remove_barber_gallery_image",
                assetId
              });
            }}
            isBusy={mediaMutation.isPending}
          />
        </section>
      ) : (
        <Card id="barber-profile-portfolio" className="rounded-[32px] scroll-mt-6 p-6">
          <p className="surface-label">Portfolio and discovery uploads</p>
          <p className="mt-3 text-lg font-semibold text-white">Media controls are not ready yet.</p>
          <p className="mt-3 text-sm leading-7 text-white/62">
            This barber account does not have a media workspace record yet. Public profile preview still stays grounded in canonical marketplace data.
          </p>
          <p className="mt-4 text-sm text-white/52">Account: {toStorageSafeSegment(userEmail)}</p>
        </Card>
      )}

      <div id="barber-profile-preview" className="scroll-mt-6">
        {profile ? (
          <PublicBarberProfile profile={profile} />
        ) : (
          <Card className="rounded-[32px] p-6">
            <p className="surface-label">Public preview</p>
            <p className="mt-3 text-lg font-semibold text-white">No public barber profile is available yet.</p>
            <p className="mt-3 text-sm leading-7 text-white/62">
              As soon as the canonical barber profile is available, the full public preview will render here with services, reviews, portfolio, and booking entry.
            </p>
          </Card>
        )}
      </div>

      <section id="barber-profile-settings" className="scroll-mt-6 space-y-4">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="surface-label">Settings</p>
              <p className="mt-3 text-2xl font-semibold text-white">Private setup now lives inside Profile.</p>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-white/62">
                Keep public identity and private setup connected: verification, payout setup, business model, notifications, security, and support all stay one tab away from the client-facing profile.
              </p>
            </div>
            <div className="rounded-[24px] border border-[#7cff00]/16 bg-[#7cff00]/10 px-4 py-3 text-right">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#d7ffab]">Profile settings</p>
              <p className="mt-2 text-sm font-medium text-white">{user.appApprovalStatus?.replaceAll("_", " ") ?? "ready"}</p>
              <p className="mt-1 text-sm text-white/58">Private setup stays in Profile, not a separate tab.</p>
            </div>
          </div>
        </Card>
        <BarberSettingsScreen user={user} initialSection={settingsSection} embedded />
      </section>
    </div>
  );
}
