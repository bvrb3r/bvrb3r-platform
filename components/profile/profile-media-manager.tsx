"use client";

import { useId, useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import type { ManagedMediaAsset } from "@/lib/profile/service";

type PickerInput = HTMLInputElement & {
  showPicker?: () => void;
};

function fileError(file: File | null) {
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
      // Fall through to click() for browsers that expose showPicker but gate it differently.
    }
  }

  picker.click();
}

export function ProfilePhotoManagerCard({
  title,
  subtitle,
  imageUrl,
  fallbackLabel,
  uploadLabel,
  onUpload,
  onRemove,
  isBusy
}: {
  title: string;
  subtitle: string;
  imageUrl?: string;
  fallbackLabel: string;
  uploadLabel: string;
  onUpload: (file: File) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
  isBusy?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <Card className="rounded-[28px] border border-white/8 bg-black/20 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="surface-label">{title}</p>
          <p className="mt-2 text-sm leading-6 text-white/58">{subtitle}</p>
        </div>
        <Button
          type="button"
          className="h-11 px-4"
          disabled={isBusy}
          onClick={() => openFilePicker(inputRef.current)}
        >
          <Camera className="h-4 w-4" />
          {isBusy ? "Uploading..." : uploadLabel}
        </Button>
      </div>

      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={async (event) => {
          const file = event.target.files?.[0] ?? null;
          event.currentTarget.value = "";
          const error = fileError(file);
          if (error) {
            setFeedback(error);
            return;
          }

          setFeedback(null);
          await onUpload(file!);
        }}
      />

      {feedback ? <div className="mt-4"><FeedbackBanner tone="error" message={feedback} /></div> : null}

      <div className="mt-5 flex items-center gap-4">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={title}
            className="h-20 w-20 rounded-[24px] border border-white/10 object-cover shadow-[0_18px_34px_rgba(0,0,0,0.22)]"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(196, 242, 78,0.18),rgba(12,12,12,0.96))] text-xl font-semibold text-[#e4f9b8]">
            {fallbackLabel}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm text-white/72">{imageUrl ? "Current image is live." : "No image uploaded yet."}</p>
          {onRemove ? (
            <Button variant="secondary" className="h-10 px-4" disabled={isBusy || !imageUrl} onClick={() => void onRemove()}>
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function GalleryManagerCard({
  title,
  subtitle,
  assets,
  uploadLabel,
  emptyCopy,
  onUpload,
  onRemove,
  isBusy
}: {
  title: string;
  subtitle: string;
  assets: ManagedMediaAsset[];
  uploadLabel: string;
  emptyCopy: string;
  onUpload: (file: File, options: { caption: string; featured: boolean }) => Promise<void> | void;
  onRemove: (assetId: string) => Promise<void> | void;
  isBusy?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [caption, setCaption] = useState("");
  const [featured, setFeatured] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <Card className="rounded-[28px] border border-white/8 bg-black/20 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="surface-label">{title}</p>
          <p className="mt-2 text-sm leading-6 text-white/58">{subtitle}</p>
        </div>
        <Button
          type="button"
          className="h-11 px-4"
          disabled={isBusy}
          onClick={() => openFilePicker(inputRef.current)}
        >
          <ImagePlus className="h-4 w-4" />
          {isBusy ? "Adding..." : uploadLabel}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <input
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          maxLength={140}
          placeholder="Optional caption"
          className="h-12 rounded-[18px] border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-[#c4f24e]/28"
        />
        <label className="flex h-12 items-center gap-3 rounded-[18px] border border-white/10 bg-black/25 px-4 text-sm text-white/72">
          <input
            type="checkbox"
            checked={featured}
            onChange={(event) => setFeatured(event.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-black"
          />
          Mark as featured
        </label>
      </div>

      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={async (event) => {
          const file = event.target.files?.[0] ?? null;
          event.currentTarget.value = "";
          const error = fileError(file);
          if (error) {
            setFeedback(error);
            return;
          }

          setFeedback(null);
          await onUpload(file!, { caption, featured });
          setCaption("");
          setFeatured(false);
        }}
      />

      {feedback ? <div className="mt-4"><FeedbackBanner tone="error" message={feedback} /></div> : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {assets.length ? assets.map((asset) => (
          <div key={asset.id} className="rounded-[24px] border border-white/8 bg-black/18 p-4">
            {asset.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.imageUrl}
                alt={asset.caption || title}
                className="h-36 w-full rounded-[18px] border border-white/8 object-cover"
              />
            ) : (
              <div className="flex h-36 items-center justify-center rounded-[18px] border border-dashed border-white/10 bg-black/20 text-sm text-white/42">
                Image unavailable
              </div>
            )}
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">{asset.caption || "No caption"}</p>
                <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-white/42">
                  {asset.featured ? "Featured" : "Gallery"} | {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(asset.createdAt))}
                </p>
              </div>
              <Button variant="secondary" className="h-10 px-3" disabled={isBusy} onClick={() => void onRemove(asset.id)}>
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            </div>
          </div>
        )) : (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-black/18 p-5 text-sm leading-7 text-white/58 md:col-span-2">
            {emptyCopy}
          </div>
        )}
      </div>
    </Card>
  );
}
