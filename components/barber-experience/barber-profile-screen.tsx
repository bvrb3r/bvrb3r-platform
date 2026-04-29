"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronRight,
  Eye,
  ImagePlus,
  Link as LinkIcon,
  MoreHorizontal,
  Pencil,
  Share2,
  ShieldCheck,
  Star,
  UserPlus
} from "lucide-react";
import { PublicBarberProfile } from "@/components/marketplace/public-barber-profile";
import { GalleryManagerCard, ProfilePhotoManagerCard } from "@/components/profile/profile-media-manager";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Avatar, GlassCard, StatusBadge } from "@/design/components";
import { useBarberProfileQuery } from "@/lib/booking/client";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import { uploadMediaAsset } from "@/lib/storage/media";
import { useBarberTrustSummary } from "@/lib/trust/client";
import { cn, currency } from "@/lib/utils";
import type { UserAccount } from "@/types/domain";

const sectionIdMap = {
  preview: "barber-profile-preview",
  portfolio: "barber-profile-portfolio",
  services: "barber-profile-services",
  reviews: "barber-profile-reviews"
} as const;

type ProfileSectionKey = keyof typeof sectionIdMap;
type PickerInput = HTMLInputElement & { showPicker?: () => void };

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

function compactNumber(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "--";
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
      // Fall back to click() where showPicker exists but is browser-gated.
    }
  }

  picker.click();
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
  const photoInputId = useId();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const profileQuery = useBarberProfileQuery(barberId);
  const mediaQuery = useProfileMediaWorkspaceQuery(true);
  const mediaMutation = useMutateProfileMediaMutation();
  const trustQuery = useBarberTrustSummary(true);
  const [localFeedback, setLocalFeedback] = useState<{ tone: "info" | "error"; message: string } | null>(null);
  const selectedSection = (initialSection && initialSection in sectionIdMap ? initialSection : null) as ProfileSectionKey | null;
  const barberMedia = mediaQuery.data?.barberProfile ?? null;
  const profile = profileQuery.data ?? null;
  const verificationDecision = trustQuery.data?.verificationDecision;
  const profilePhotoUrl = profile?.profile.profilePhotoUrl ?? barberMedia?.profilePhotoUrl;
  const portfolioAssets = useMemo(() => {
    if (profile?.portfolio.length) {
      return profile.portfolio.map((asset) => ({
        id: asset.id,
        imageUrl: asset.imageUrl,
        caption: asset.caption,
        featured: asset.featured
      }));
    }

    return (barberMedia?.gallery ?? []).map((asset) => ({
      id: asset.id,
      imageUrl: asset.imageUrl,
      caption: asset.caption,
      featured: asset.featured
    }));
  }, [barberMedia?.gallery, profile?.portfolio]);
  const reviewScore = profile?.proof?.reviewScore ?? profile?.barber.rating;
  const reviewCount = profile?.proof?.reviewCount ?? profile?.reviews.length ?? profile?.barber.reviewCount;
  const publicProfileHref = profile?.profile.username ? `/barber/${profile.profile.username}` : null;
  const publicProfileRoute = publicProfileHref as Route | null;
  const isVerified = Boolean(
    verificationDecision?.gates.badge?.allowed
      || profile?.profile.badges.length
      || profile?.proof?.verificationLabels.length
  );
  const reputationLabel = profile?.proof?.rankingLabel
    ?? profile?.proof?.reputationTier
    ?? (reviewScore && reviewCount && reviewScore >= 4.8 ? "Top Rated Barber" : isVerified ? "Verified Barber" : "Building Public Trust");
  const identityLine = profile?.profile.headline?.trim() || profile?.barber.bio?.trim() || "No public bio saved yet.";
  const shopLabel = profile?.shop?.name
    ?? profile?.shopLocations[0]?.name
    ?? (profile?.barber.compensationModel ? profile.barber.compensationModel.replaceAll("_", " ") : "Independent barber");
  const profileLinkLabel = profile?.profile.username ? `/barber/${profile.profile.username}` : profile?.barber.bookingLink;
  const socialStats = [
    { label: "Posts", value: profile ? compactNumber(portfolioAssets.length) : "--" },
    { label: profile?.proof ? "Followers" : "Services", value: profile?.proof ? compactNumber(profile.proof.followCount) : profile ? compactNumber(profile.services.length) : "--" },
    { label: profile?.proof ? "Bookings" : "Reviews", value: profile?.proof ? compactNumber(profile.proof.bookingsCompleted) : compactNumber(reviewCount) }
  ];
  const highlights = useMemo(() => {
    const specialtyLabels = profile?.profile.specialties.length
      ? profile.profile.specialties
      : profile?.barber.specialties ?? [];

    return specialtyLabels.slice(0, 5).map((label, index) => ({
      label,
      imageUrl: portfolioAssets[index]?.imageUrl
    }));
  }, [portfolioAssets, profile]);
  const profileStats = [
    {
      icon: Star,
      value: `${formatRating(reviewScore)} Rating`,
      label: reviewCount ? `${compactNumber(reviewCount)} reviews` : "Reviews building",
      subtext: reputationLabel
    },
    {
      icon: CalendarDays,
      value: `${profile?.proof ? compactNumber(profile.proof.bookingsCompleted) : compactNumber(profile?.services.length)} ${profile?.proof ? "Bookings" : "Services"}`,
      label: profile?.proof ? "Completed" : "Visible to clients",
      subtext: profile?.mostBookedService?.service.name ?? "Public booking profile"
    },
    {
      icon: ShieldCheck,
      value: formatYears(profile?.profile.yearsExperience),
      label: "Experience",
      subtext: isVerified ? "Trust visible" : "Verification pending"
    }
  ];
  const completenessItems = [
    profile?.profile.profilePhotoUrl || barberMedia?.profilePhotoUrl ? null : "Add a public profile photo",
    profile?.profile.headline?.trim() ? null : "Add a public bio/headline",
    profile?.profile.specialties?.length ? null : "Add specialties",
    profile?.services.length ? null : "Publish services",
    profile?.portfolio.length || barberMedia?.gallery.length ? null : "Upload portfolio work",
    verificationDecision?.gates.badge?.allowed ? null : "Clear trust badge verification"
  ].filter(Boolean) as string[];
  const mutationStatus = mediaMutation.error
    ? { tone: "error" as const, message: readableError(mediaMutation.error, "Unable to update barber profile media right now.") }
    : null;
  const status = mutationStatus ?? localFeedback;

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
      setLocalFeedback({ tone: "error", message: "Media workspace is not ready for this barber profile yet." });
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

  function scrollToSection(section: ProfileSectionKey) {
    const target = document.getElementById(sectionIdMap[section]);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleShareProfile() {
    if (!publicProfileHref) {
      setLocalFeedback({ tone: "info", message: "Set a public username before sharing this profile." });
      return;
    }

    const shareUrl = `${window.location.origin}${publicProfileHref}`;
    if (navigator.share) {
      await navigator.share({ title: `${barberName} on BVRB3R`, url: shareUrl });
      return;
    }

    await navigator.clipboard?.writeText(shareUrl);
    setLocalFeedback({ tone: "info", message: "Public profile link copied." });
  }

  return (
    <div className="space-y-6" data-testid="barber-profile-screen">
      {status ? <FeedbackBanner tone={status.tone} message={status.message} /> : null}
      {profileQuery.error ? <FeedbackBanner tone="error" message={readableError(profileQuery.error, "Unable to load the public barber profile preview right now.")} /> : null}

      <GlassCard className="relative overflow-hidden rounded-[32px] p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(163,255,18,0.10),transparent_30%),radial-gradient(circle_at_bottom_center,rgba(163,255,18,0.06),transparent_28%)]" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="bvr-section-label">Barber brand</p>
              <h2 className="mt-3 text-[2.65rem] font-black leading-none tracking-[-0.045em] text-white sm:text-6xl">
                Profile
              </h2>
              <p className="mt-2 text-base font-medium text-white/60 sm:text-[17px]">Manage your profile & brand</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {publicProfileRoute ? (
                <Link
                  href={publicProfileRoute}
                  aria-label="Preview public barber profile"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white transition hover:border-[#a3ff12]/35 hover:shadow-[0_0_24px_rgba(163,255,18,0.12)] sm:h-14 sm:w-14"
                >
                  <Eye className="h-5 w-5 sm:h-6 sm:w-6" />
                </Link>
              ) : (
                <button
                  type="button"
                  aria-label="Preview public barber profile"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white transition hover:border-[#a3ff12]/35 hover:shadow-[0_0_24px_rgba(163,255,18,0.12)] sm:h-14 sm:w-14"
                  onClick={() => scrollToSection("preview")}
                >
                  <Eye className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
              )}
              <button
                type="button"
                aria-label="Share public barber profile"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white transition hover:border-[#a3ff12]/35 hover:shadow-[0_0_24px_rgba(163,255,18,0.12)] sm:h-14 sm:w-14"
                onClick={() => void handleShareProfile()}
              >
                <Share2 className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
              <button
                type="button"
                aria-label="Open profile media controls"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white transition hover:border-[#a3ff12]/35 hover:shadow-[0_0_24px_rgba(163,255,18,0.12)] sm:h-14 sm:w-14"
                onClick={() => scrollToSection("portfolio")}
              >
                <MoreHorizontal className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            </div>
          </div>

          <section className="mt-[34px] flex flex-col gap-7 lg:flex-row lg:items-center">
            <div className="relative h-[178px] w-[178px] shrink-0">
              <Avatar
                src={profilePhotoUrl}
                alt={`${barberName} profile photo`}
                initials={initialsForName(barberName)}
                className="h-[178px] w-[178px] border-[3px] border-white/15 text-5xl shadow-[0_0_0_2px_rgba(163,255,18,0.10),0_20px_60px_rgba(0,0,0,0.50)]"
              />
              <input
                id={photoInputId}
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                onChange={async (event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.currentTarget.value = "";
                  const error = validateImageFile(file);
                  if (error) {
                    setLocalFeedback({ tone: "error", message: error });
                    return;
                  }

                  setLocalFeedback(null);
                  await handleBarberPhotoUpload(file!);
                }}
              />
              <button
                type="button"
                aria-label="Upload or change public profile photo"
                disabled={mediaMutation.isPending}
                className="absolute bottom-0 right-0 flex h-[58px] w-[58px] items-center justify-center rounded-full border-2 border-[#a3ff12] bg-[rgba(163,255,18,0.10)] text-[#a3ff12] shadow-[0_0_28px_rgba(163,255,18,0.25)] transition hover:bg-[rgba(163,255,18,0.16)] disabled:opacity-50"
                onClick={() => openFilePicker(photoInputRef.current)}
              >
                <Pencil className="h-6 w-6" />
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-[2.35rem] font-black leading-[1.05] tracking-[-0.045em] text-white">
                  {profile?.barber.name ?? barberName}
                </h3>
                {isVerified ? (
                  <CheckCircle2 className="h-[26px] w-[26px] text-[#a3ff12] drop-shadow-[0_0_10px_rgba(163,255,18,0.35)]" />
                ) : null}
              </div>

              <div className="mt-4 inline-flex h-9 items-center gap-2 rounded-full border border-[#a3ff12]/25 bg-[rgba(163,255,18,0.11)] px-3.5 text-base font-extrabold text-[#a3ff12]">
                <Star className="h-4 w-4 fill-current" />
                {reputationLabel}
              </div>

              <p className="mt-5 max-w-3xl text-xl font-medium leading-[1.4] text-white/78">{identityLine}</p>
              <p className="mt-2 text-base font-semibold text-white/50">{shopLabel}</p>
              {profileLinkLabel ? (
                <a
                  href={publicProfileHref ?? profile?.barber.bookingLink ?? "#barber-profile-preview"}
                  className="mt-3 inline-flex items-center gap-2 text-xl font-bold text-[#a3ff12] transition hover:text-[#cfff93]"
                >
                  <LinkIcon className="h-[22px] w-[22px]" />
                  {profileLinkLabel}
                </a>
              ) : null}

              <div className="mt-6 grid max-w-xl grid-cols-3 gap-4">
                {socialStats.map((stat) => (
                  <div key={stat.label}>
                    <p className="text-[30px] font-black leading-none tracking-[-0.03em] text-white">{stat.value}</p>
                    <p className="mt-1 text-[17px] font-medium text-white/60">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden rounded-[20px] p-0">
        <div className="grid sm:grid-cols-3">
          {profileStats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className={cn(
                  "flex min-h-[142px] items-center gap-4 p-5",
                  index > 0 && "border-t border-white/10 sm:border-l sm:border-t-0"
                )}
              >
                <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-[rgba(163,255,18,0.10)] text-[#a3ff12] shadow-[0_0_24px_rgba(163,255,18,0.18)]">
                  <Icon className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-[30px] font-black leading-tight tracking-[-0.03em] text-white">{stat.value}</p>
                  <p className="mt-1 text-lg font-medium text-white/72">{stat.label}</p>
                  <p className="mt-1 text-[15px] font-bold text-[#a3ff12]">{stat.subtext}</p>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="flex min-h-[106px] items-center justify-between gap-4 rounded-[18px] p-[22px]">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border border-[#a3ff12]/25 bg-[rgba(163,255,18,0.08)] text-[#a3ff12]">
            <BarChart3 className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <p className="text-[22px] font-black tracking-[-0.03em] text-white">Your dashboard</p>
            <p className="mt-1 text-[17px] text-white/60">
              {profile?.proof
                ? `${compactNumber(profile.proof.profileViews)} profile views, ${compactNumber(profile.proof.bookingClicks)} booking clicks.`
                : "Profile analytics will appear here once the marketplace proof layer has activity."}
            </p>
          </div>
        </div>
        <ChevronRight className="h-6 w-6 shrink-0 text-white/85" />
      </GlassCard>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/onboarding/barber/profile"
          className="inline-flex min-h-16 items-center justify-center gap-3 rounded-[16px] border border-white/10 bg-white/[0.025] px-5 text-[19px] font-extrabold text-white transition hover:border-[#a3ff12]/25 hover:bg-white/[0.04]"
        >
          <Pencil className="h-6 w-6 text-[#a3ff12]" />
          Edit profile
        </Link>
        <button
          type="button"
          className="inline-flex min-h-16 items-center justify-center gap-3 rounded-[16px] border border-white/10 bg-white/[0.025] px-5 text-[19px] font-extrabold text-white transition hover:border-[#a3ff12]/25 hover:bg-white/[0.04]"
          onClick={() => void handleShareProfile()}
        >
          <Share2 className="h-6 w-6 text-[#a3ff12]" />
          Share profile
        </button>
      </div>

      <section className="overflow-hidden">
        <div className="hide-scrollbar flex gap-5 overflow-x-auto pb-2">
          <button
            type="button"
            className="flex w-[112px] shrink-0 flex-col items-center"
            onClick={() => scrollToSection("portfolio")}
          >
            <span className="flex h-[112px] w-[112px] items-center justify-center rounded-full border-[3px] border-white/15 bg-white/[0.018] text-[54px] font-light leading-none text-[#a3ff12]">
              +
            </span>
            <span className="mt-2 text-center text-base font-medium text-white/70">New</span>
          </button>
          {highlights.length ? highlights.map((highlight) => (
            <div key={highlight.label} className="w-[112px] shrink-0 text-center">
              {highlight.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={highlight.imageUrl}
                  alt={highlight.label}
                  className="h-[112px] w-[112px] rounded-full border-[3px] border-white/20 object-cover"
                />
              ) : (
                <div className="flex h-[112px] w-[112px] items-center justify-center rounded-full border-[3px] border-white/20 bg-[linear-gradient(135deg,rgba(163,255,18,0.14),rgba(15,15,15,0.96))] text-2xl font-black text-[#a3ff12]">
                  {highlight.label.slice(0, 2).toUpperCase()}
                </div>
              )}
              <p className="mt-2 truncate text-base font-medium text-white/70">{highlight.label}</p>
            </div>
          )) : (
            <div className="flex min-h-[112px] min-w-[18rem] items-center rounded-[24px] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/58">
              Highlights build from real specialties and portfolio categories.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black tracking-[-0.03em] text-white">Your work</h3>
            <p className="mt-1 text-lg font-medium text-white/60">{portfolioAssets.length} post{portfolioAssets.length === 1 ? "" : "s"}</p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-lg font-extrabold text-[#a3ff12]"
            onClick={() => scrollToSection("portfolio")}
          >
            Manage
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {portfolioAssets.length ? portfolioAssets.slice(0, 9).map((asset) => (
            <button
              key={asset.id}
              type="button"
              className="group relative aspect-square overflow-hidden rounded-[12px] border border-white/10 bg-black/25"
              onClick={() => scrollToSection("portfolio")}
            >
              {asset.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={asset.imageUrl}
                  alt={asset.caption || `${barberName} portfolio work`}
                  className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm text-white/42">Image unavailable</span>
              )}
              <span className="absolute bottom-2 right-2 rounded-[8px] border border-white/20 bg-black/55 px-1.5 py-0.5 text-[12px] font-black tracking-[0.04em] text-white">
                BVR
              </span>
            </button>
          )) : (
            <div className="col-span-3 flex aspect-[3/1] items-center justify-center rounded-[18px] border border-dashed border-white/10 bg-black/20 p-5 text-center text-sm text-white/58">
              No portfolio photos yet. Add real work below so clients can judge the cut before they book.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.96fr_1.04fr]">
        <GlassCard className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="bvr-section-label">Profile readiness</p>
              <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Client-facing trust</h3>
              <p className="mt-2 text-sm text-white/58">Keep discovery trust high with the story clients actually see.</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-[#a3ff12]" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] border border-[#a3ff12]/20 bg-[rgba(163,255,18,0.08)] p-4">
              <p className="surface-label">Trust score</p>
              <p className="mt-3 text-2xl font-semibold text-white">{trustQuery.data?.trustScore ?? "--"}</p>
              <p className="mt-2 text-sm text-white/58">{trustQuery.data?.publicBadgePreview?.[0] ?? "Verification building"}</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Starting price</p>
              <p className="mt-3 text-2xl font-semibold text-white">{profile?.priceRange?.length ? currency(profile.priceRange[0]) : "--"}</p>
              <p className="mt-2 text-sm text-white/58">Visible on booking.</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Next opening</p>
              <p className="mt-3 text-2xl font-semibold text-white">{profile?.nextAvailableAt ? "Live" : "Pending"}</p>
              <p className="mt-2 text-sm text-white/58">{profile?.nextAvailableAt ? "Availability visible." : "Set schedule to publish."}</p>
            </div>
          </div>

          <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4">
            <p className="surface-label">Needs attention</p>
            <div className="mt-3 space-y-2 text-sm text-white/62">
              {completenessItems.length ? completenessItems.map((item) => (
                <p key={item}>- {item}</p>
              )) : <p>Your public barber profile covers the core trust surfaces.</p>}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="bvr-section-label">Public identity</p>
              <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">What clients see</h3>
              <p className="mt-2 text-sm text-white/58">Image, services, proof, and booking context stay client-facing here.</p>
            </div>
            <Star className="h-5 w-5 text-[#a3ff12]" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78">
                <Camera className="h-4 w-4 text-[#a3ff12]" />
                Public photo
              </div>
              <p className="mt-3 text-lg font-semibold text-white">{profilePhotoUrl ? "Live" : "Missing"}</p>
              <p className="mt-2 text-sm text-white/58">{identityLine}</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78">
                <ImagePlus className="h-4 w-4 text-[#a3ff12]" />
                Portfolio
              </div>
              <p className="mt-3 text-lg font-semibold text-white">{portfolioAssets.length} image{portfolioAssets.length === 1 ? "" : "s"}</p>
              <p className="mt-2 text-sm text-white/58">Featured haircut photos drive profile trust.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78">
                <CalendarDays className="h-4 w-4 text-[#a3ff12]" />
                Services shown
              </div>
              <p className="mt-3 text-lg font-semibold text-white">{profile?.services.length ?? 0}</p>
              <p className="mt-2 text-sm text-white/58">Service descriptions, duration, and pricing stay visible.</p>
            </div>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78">
                <UserPlus className="h-4 w-4 text-[#a3ff12]" />
                Client proof
              </div>
              <p className="mt-3 text-lg font-semibold text-white">{profile?.proof ? compactNumber(profile.proof.followCount) : "--"}</p>
              <p className="mt-2 text-sm text-white/58">Followers appear when the proof layer has real data.</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusBadge tone={isVerified ? "green" : "neutral"}>
              {isVerified ? "Trust visible" : "Trust building"}
            </StatusBadge>
            <Link href="/dashboard/barber/more?section=settings" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#a3ff12]/20 hover:text-[#cfff93] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]">
              Open More
            </Link>
          </div>
        </GlassCard>
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
        <GlassCard id="barber-profile-portfolio" className="scroll-mt-6 p-5 sm:p-6">
          <p className="bvr-section-label">Portfolio and discovery uploads</p>
          <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">Media controls are not ready yet.</h3>
          <p className="mt-3 text-sm leading-7 text-white/62">
            This barber account does not have a media workspace record yet. Public profile preview still stays grounded in canonical marketplace data.
          </p>
          <p className="mt-4 text-sm text-white/52">Account: {toStorageSafeSegment(userEmail)}</p>
        </GlassCard>
      )}

      <div id="barber-profile-preview" className="scroll-mt-6">
        {profile ? (
          <PublicBarberProfile profile={profile} />
        ) : (
          <GlassCard className="p-5 sm:p-6">
            <p className="bvr-section-label">Public preview</p>
            <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] text-white">No public barber profile is available yet.</h3>
            <p className="mt-3 text-sm leading-7 text-white/62">
              As soon as the canonical barber profile is available, the full public preview will render here with services, reviews, portfolio, and booking entry.
            </p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
