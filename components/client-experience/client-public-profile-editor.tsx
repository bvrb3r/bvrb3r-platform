"use client";

import { useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { buildClientProfileStudioViewModel } from "@/components/profile-studio/adapters/client-profile-studio-adapter";
import { ProfileImageEditButton } from "@/components/profile-studio/profile-image-edit-button";
import { ProfileStudioShell } from "@/components/profile-studio/profile-studio-shell";
import { useProfileStudioFeedback } from "@/components/profile-studio/use-profile-studio-feedback";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import { uploadMediaAsset } from "@/lib/storage/media";
import type { UserAccount } from "@/types/domain";

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
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ClientPublicProfileEditor({ user }: { user: UserAccount }) {
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const mediaQuery = useProfileMediaWorkspaceQuery(true);
  const mediaMutation = useMutateProfileMediaMutation();
  const clientMedia = mediaQuery.data?.clientProfile ?? null;
  const studioClientMedia = useMemo(() => clientMedia
    ? {
        ...clientMedia,
        profilePhotoUrl: clientMedia.profilePhotoUrl ?? mediaQuery.data?.viewer.profilePhotoUrl,
        profilePhotoPath: clientMedia.profilePhotoPath ?? mediaQuery.data?.viewer.profilePhotoPath
      }
    : {
        profilePhotoUrl: mediaQuery.data?.viewer.profilePhotoUrl,
        profilePhotoPath: mediaQuery.data?.viewer.profilePhotoPath,
        publicBio: null,
        publicCity: null,
        publicState: null,
        gallery: []
      }, [clientMedia, mediaQuery.data?.viewer.profilePhotoPath, mediaQuery.data?.viewer.profilePhotoUrl]);
  const model = useMemo(() => buildClientProfileStudioViewModel(user, studioClientMedia), [studioClientMedia, user]);
  const [usernameDraft, setUsernameDraft] = useState(model.username.value);
  const [feedback, setFeedback] = useProfileStudioFeedback();

  async function uploadWithPath(path: string, file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    return uploadMediaAsset(`${path}/${Date.now()}.${extension}`, file);
  }

  async function handleProfilePhotoUpload(file: File) {
    const error = validateImageFile(file);
    if (error) {
      setFeedback({ tone: "error", message: error });
      return;
    }

    setFeedback(null);
    try {
      const uploaded = await uploadWithPath(`profiles/client/${safeSegment(user.id || user.email)}/profile`, file);
      await mediaMutation.mutateAsync({
        action: "set_viewer_photo",
        storagePath: uploaded.path,
        imageUrl: uploaded.publicUrl
      });
      setFeedback({ tone: "success", message: "Profile photo updated." });
    } catch (errorValue) {
      setFeedback({ tone: "error", message: readableError(errorValue, "Unable to update profile photo.") });
    }
  }

  async function handlePostUpload(file: File) {
    const error = validateImageFile(file);
    if (error) {
      setFeedback({ tone: "error", message: error });
      return;
    }

    setFeedback(null);
    try {
      const uploaded = await uploadWithPath(`profiles/client/${safeSegment(user.id || user.email)}/posts`, file);
      await mediaMutation.mutateAsync({
        action: "add_client_gallery_image",
        storagePath: uploaded.path,
        imageUrl: uploaded.publicUrl
      });
      setFeedback({ tone: "success", message: "Post added." });
    } catch (errorValue) {
      setFeedback({ tone: "error", message: readableError(errorValue, "Unable to add post.") });
    }
  }

  async function handlePostRemove(assetId: string) {
    setFeedback(null);
    try {
      await mediaMutation.mutateAsync({
        action: "remove_client_gallery_image",
        assetId
      });
      setFeedback({ tone: "success", message: "Post removed." });
    } catch (errorValue) {
      setFeedback({ tone: "error", message: readableError(errorValue, "Unable to remove image.") });
    }
  }

  async function handleBioSave(publicBio: string) {
    setFeedback(null);
    try {
      await mediaMutation.mutateAsync({
        action: "set_client_public_bio",
        publicBio
      });
      setFeedback({ tone: "success", message: "Public bio updated." });
    } catch (errorValue) {
      const message = readableError(errorValue, "Unable to update public bio.");
      setFeedback({ tone: "error", message });
      throw new Error(message);
    }
  }

  async function handleUsernameSave(username: string) {
    const nextUsername = suggestHandle(username);
    setFeedback(null);
    try {
      await mediaMutation.mutateAsync({
        action: "set_client_public_username",
        username: nextUsername
      });
      setUsernameDraft(nextUsername);
      setFeedback({ tone: "success", message: `Public username saved. @${nextUsername} is live.` });
    } catch (errorValue) {
      const message = readableError(errorValue, "Unable to save public username.");
      setFeedback({ tone: "error", message });
      throw new Error(message);
    }
  }

  async function handleLocationSave(values: Record<string, string>) {
    setFeedback(null);
    try {
      await mediaMutation.mutateAsync({
        action: "set_client_public_location",
        city: values.city ?? "",
        state: values.state ?? ""
      });
      setFeedback({ tone: "success", message: "Public location updated." });
    } catch (errorValue) {
      const message = readableError(errorValue, "Unable to update public location.");
      setFeedback({ tone: "error", message });
      throw new Error(message);
    }
  }

  return (
    <div className="space-y-4" data-testid="client-public-profile-editor">
      {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
      <input
        ref={mediaInputRef}
        aria-label="Add post upload input"
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={async (event) => {
          const file = event.target.files?.[0] ?? null;
          event.currentTarget.value = "";
          if (file) {
            await handlePostUpload(file);
          }
        }}
      />
      <ProfileStudioShell
        model={{
          ...model,
          hero: {
            ...model.hero,
            username: usernameDraft || model.hero.username,
            publicUrl: usernameDraft ? `/client/${usernameDraft}` : model.hero.publicUrl
          },
          username: {
            ...model.username,
            value: usernameDraft,
            publicUrl: usernameDraft ? `/client/${usernameDraft}` : model.username.publicUrl
          }
        }}
        backHref={"/dashboard/client/more" as Route}
        backLabel="Back to More"
        usernameValue={usernameDraft}
        onUsernameChange={(value) => setUsernameDraft(suggestHandle(value))}
        onUsernameSave={handleUsernameSave}
        isSavingUsername={mediaMutation.isPending}
        photoControl={(
          <ProfileImageEditButton
            label="Update public profile photo"
            disabled={mediaMutation.isPending}
            onFileSelected={handleProfilePhotoUpload}
          />
        )}
        onMedia={() => openFilePicker(mediaInputRef.current)}
        onAddMedia={() => openFilePicker(mediaInputRef.current)}
        onDeleteMedia={(assetId) => void handlePostRemove(assetId)}
        onBioSave={handleBioSave}
        isSavingBio={mediaMutation.isPending}
        contextFields={[
          {
            name: "city",
            label: "City or area",
            value: clientMedia?.publicCity ?? "",
            placeholder: "Tampa",
            maxLength: 120
          },
          {
            name: "state",
            label: "State",
            value: clientMedia?.publicState ?? "",
            placeholder: "FL",
            maxLength: 40
          }
        ]}
        onContextSave={handleLocationSave}
        isSavingContext={mediaMutation.isPending}
        onPreview={() => window.location.assign(`/client/${usernameDraft || model.username.value}`)}
        onShare={async () => {
          const url = `${window.location.origin}/client/${usernameDraft || model.username.value}`;
          if (navigator.share) {
            await navigator.share({ title: `${user.name} on BVRB3R Culture`, url });
          } else {
            await navigator.clipboard?.writeText(url);
          }
          setFeedback({ tone: "success", message: "Culture profile link copied." });
        }}
      />
    </div>
  );
}
