"use client";

import type { Route } from "next";
import { useEffect, useMemo, useRef, useState } from "react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { buildBarberProfileStudioViewModel } from "@/components/profile-studio/adapters/barber-profile-studio-adapter";
import { ProfileImageEditButton } from "@/components/profile-studio/profile-image-edit-button";
import { ProfileStudioShell } from "@/components/profile-studio/profile-studio-shell";
import { useBarberProfileQuery } from "@/lib/booking/client";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import { uploadMediaAsset } from "@/lib/storage/media";
import { useBarberTrustSummary } from "@/lib/trust/client";
import type { UserAccount } from "@/types/domain";

type PickerInput = HTMLInputElement & { showPicker?: () => void };

function suggestPublicUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "").slice(0, 32);
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
      // Browser-gated showPicker can still fail; click() is the standard fallback.
    }
  }

  picker.click();
}

function isFallbackPublicUsername(username?: string | null, barberId?: string | null) {
  if (!username || !barberId) {
    return false;
  }

  const shortReference = barberId
    .replace(/^barber[-_]?/i, "")
    .replace(/[^a-z0-9_-]+/gi, "")
    .slice(0, 18)
    .toLowerCase();
  return username === `barber-${shortReference || "profile"}`;
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
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

export function BarberProfileScreen({
  user,
  initialSection,
  profileRepairFeedback
}: {
  user: UserAccount;
  initialSection?: string;
  profileRepairFeedback?: string;
}) {
  const barberId = user.barberId;
  const barberName = user.name;
  const studioRef = useRef<HTMLDivElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const profileQuery = useBarberProfileQuery(barberId);
  const mediaQuery = useProfileMediaWorkspaceQuery(true);
  const mediaMutation = useMutateProfileMediaMutation();
  const trustQuery = useBarberTrustSummary(true);
  const [localFeedback, setLocalFeedback] = useState<{ tone: "info" | "error"; message: string } | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const barberMedia = mediaQuery.data?.barberProfile ?? null;
  const profile = profileQuery.data ?? null;
  const verificationDecision = trustQuery.data?.verificationDecision;
  const profilePhotoUrl = profile?.profile.profilePhotoUrl ?? barberMedia?.profilePhotoUrl;
  const portfolioAssets = useMemo(() => {
    if (barberMedia?.gallery.length) {
      return barberMedia.gallery.map((asset) => ({
        id: asset.id,
        imageUrl: asset.imageUrl,
        caption: asset.caption,
        featured: asset.featured
      }));
    }

    if (profile?.portfolio.length) {
      return profile.portfolio.map((asset) => ({
        id: asset.id,
        imageUrl: asset.imageUrl,
        caption: asset.caption,
        featured: asset.featured
      }));
    }

    return [];
  }, [barberMedia?.gallery, profile?.portfolio]);
  const reviewScore = profile?.proof?.reviewScore ?? profile?.barber.rating;
  const reviewCount = profile?.proof?.reviewCount ?? profile?.reviews.length ?? profile?.barber.reviewCount;
  const publicProfileHref = profile?.profile.username ? `/barber/${profile.profile.username}` : null;
  const isVerified = Boolean(
    verificationDecision?.gates.badge?.allowed
      || profile?.profile.badges.length
      || profile?.proof?.verificationLabels.length
  );
  const reputationLabel = profile?.proof?.rankingLabel
    ?? profile?.proof?.reputationTier
    ?? (reviewScore && reviewCount && reviewScore >= 4.8 ? "Best booking fit" : isVerified ? "Verified barber" : "Best booking fit");
  const rawIdentityLine = profile?.profile.headline?.trim() || profile?.barber.bio?.trim() || "";
  const identityLine = rawIdentityLine.toLowerCase() === `${barberName} on the bvrb3r network.`.toLowerCase()
    ? ""
    : rawIdentityLine;
  const shopLabel = profile?.shop?.name
    ?? profile?.shopLocations[0]?.name
    ?? "Independent barber";
  const mutationStatus = mediaMutation.error
    ? { tone: "error" as const, message: readableError(mediaMutation.error, "Unable to update barber profile media right now.") }
    : null;
  const profileRepairNotice = (profileQuery.data as { profileRepairNotice?: string } | undefined)?.profileRepairNotice;
  const status = mutationStatus
    ?? localFeedback
    ?? (profileRepairFeedback ? { tone: profileRepairFeedback.includes("_") ? "error" as const : "info" as const, message: profileRepairFeedback } : null)
    ?? (profileRepairNotice ? { tone: "info" as const, message: profileRepairNotice } : null);

  useEffect(() => {
    if (profile?.profile.username && !isSavingUsername) {
      setUsernameDraft(
        isFallbackPublicUsername(profile.profile.username, profile.barber.id)
          ? suggestPublicUsername(barberName)
          : profile.profile.username
      );
    }
  }, [barberName, isSavingUsername, profile?.barber.id, profile?.profile.username]);

  useEffect(() => {
    if (initialSection === "portfolio") {
      studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [initialSection]);

  async function uploadWithPath(path: string, file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    return uploadMediaAsset(`${path}/${Date.now()}.${extension}`, file);
  }

  async function handleBarberPhotoUpload(file: File) {
    if (!barberMedia) {
      setLocalFeedback({ tone: "error", message: "Media workspace is not ready for this barber profile yet." });
      return;
    }

    try {
      const uploaded = await uploadWithPath(`profiles/barbers/${barberMedia.barberId}/profile`, file);
      await mediaMutation.mutateAsync({
        action: "set_barber_photo",
        storagePath: uploaded.path,
        imageUrl: uploaded.publicUrl
      });
      await profileQuery.refetch();
      setLocalFeedback({ tone: "info", message: "Barber profile photo updated." });
    } catch (error) {
      setLocalFeedback({ tone: "error", message: readableError(error, "Unable to update barber profile photo.") });
    }
  }

  async function handleBarberGalleryUpload(file: File) {
    if (!barberMedia) {
      setLocalFeedback({ tone: "error", message: "Media workspace is not ready for this barber profile yet." });
      return;
    }

    const error = validateImageFile(file);
    if (error) {
      setLocalFeedback({ tone: "error", message: error });
      return;
    }

    setLocalFeedback(null);
    try {
      const uploaded = await uploadWithPath(`profiles/barbers/${barberMedia.barberId}/gallery`, file);
      await mediaMutation.mutateAsync({
        action: "add_barber_gallery_image",
        storagePath: uploaded.path,
        imageUrl: uploaded.publicUrl
      });
      await profileQuery.refetch();
      setLocalFeedback({ tone: "info", message: "Portfolio image added." });
    } catch (errorValue) {
      setLocalFeedback({ tone: "error", message: readableError(errorValue, "Unable to add portfolio image.") });
    }
  }

  async function handleBarberGalleryRemove(assetId: string) {
    setLocalFeedback(null);
    try {
      await mediaMutation.mutateAsync({
        action: "remove_barber_gallery_image",
        assetId
      });
      await profileQuery.refetch();
      setLocalFeedback({ tone: "info", message: "Portfolio image removed." });
    } catch (error) {
      setLocalFeedback({ tone: "error", message: readableError(error, "Unable to remove image.") });
    }
  }

  function scrollToStudio() {
    studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    setLocalFeedback({ tone: "info", message: "Barber profile link copied." });
  }

  async function handleUsernameSave(nextUsername?: string) {
    const username = (nextUsername ?? usernameDraft).trim().toLowerCase();
    setLocalFeedback(null);
    setIsSavingUsername(true);
    try {
      const response = await fetch("/api/barber/public-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Unable to save public username.");
      }
      setUsernameDraft(username);
      await profileQuery.refetch();
      setLocalFeedback({ tone: "info", message: "Public username saved. Client profile links refresh right away." });
    } catch (error) {
      setLocalFeedback({ tone: "error", message: readableError(error, "Unable to save public username.") });
    } finally {
      setIsSavingUsername(false);
    }
  }

  const model = buildBarberProfileStudioViewModel({
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
    username: usernameDraft || profile?.profile.username || suggestPublicUsername(barberName)
  });

  return (
    <div ref={studioRef} className="space-y-6" data-testid="barber-profile-screen">
      {status ? <FeedbackBanner tone={status.tone} message={status.message} /> : null}
      {profileQuery.error ? <FeedbackBanner tone="error" message={readableError(profileQuery.error, "Unable to load the public barber profile preview right now.")} /> : null}
      <input
        ref={mediaInputRef}
        aria-label="Add portfolio image upload input"
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={async (event) => {
          const file = event.target.files?.[0] ?? null;
          event.currentTarget.value = "";
          if (file) {
            await handleBarberGalleryUpload(file);
          }
        }}
      />

      <ProfileStudioShell
        model={{
          ...model,
          hero: {
            ...model.hero,
            username: usernameDraft || model.hero.username,
            publicUrl: usernameDraft ? `/barber/${usernameDraft}` : model.hero.publicUrl
          },
          username: {
            ...model.username,
            value: usernameDraft || model.username.value,
            publicUrl: usernameDraft ? `/barber/${usernameDraft}` : model.username.publicUrl
          }
        }}
        backHref={"/dashboard/barber/more" as Route}
        backLabel="Back to More"
        usernameValue={usernameDraft || model.username.value}
        onUsernameChange={(value) => setUsernameDraft(suggestPublicUsername(value))}
        onUsernameSave={(value) => void handleUsernameSave(value)}
        isSavingUsername={isSavingUsername}
        onPreview={() => {
          if (publicProfileHref) {
            window.location.assign(publicProfileHref);
            return;
          }
          scrollToStudio();
        }}
        onContextEdit={() => setLocalFeedback({ tone: "info", message: "Chair and location display editing is coming soon." })}
        onShare={() => void handleShareProfile()}
        onMedia={() => openFilePicker(mediaInputRef.current)}
        onAddMedia={() => openFilePicker(mediaInputRef.current)}
        onDeleteMedia={(assetId) => void handleBarberGalleryRemove(assetId)}
        photoControl={(
          <ProfileImageEditButton
            label="Update public barber photo"
            disabled={mediaMutation.isPending}
            onFileSelected={async (file) => {
              const error = validateImageFile(file);
              if (error) {
                setLocalFeedback({ tone: "error", message: error });
                return;
              }

              setLocalFeedback(null);
              await handleBarberPhotoUpload(file);
            }}
          />
        )}
      />
    </div>
  );
}
