"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FolderPlus,
  Lock,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { GlassCard, StatusBadge } from "@/design/components";
import { cn } from "@/lib/utils";
import { ProfileBioEditModal } from "@/components/profile-studio/profile-bio-edit-modal";
import { ProfileContextEditModal, type ProfileContextField } from "@/components/profile-studio/profile-context-edit-modal";
import { ProfileUsernameEditModal, validateProfileHandle } from "@/components/profile-studio/profile-username-edit-modal";

export type ProfileStudioRole = "client" | "barber" | "shop_owner";
export type ProfileStudioSeverity = "good" | "warning" | "neutral";
type UsernameSaveState = "idle" | "saving" | "saved" | "error";
type UsernameAvailabilityState = "current" | "idle" | "checking" | "available" | "taken" | "reserved" | "invalid" | "unavailable";

export type ProfileStudioViewModel = {
  role: ProfileStudioRole;
  page: {
    title: string;
    subtitle: string;
    statusText?: string;
  };
  hero: {
    label: string;
    title: string;
    subtitle: string;
    publicName: string;
    username?: string | null;
    publicUrl?: string | null;
    avatarUrl?: string | null;
    coverUrl?: string | null;
    badge?: string | null;
    bio?: string | null;
    contextLine?: string | null;
    contextEditable?: boolean;
    contextLocked?: boolean;
    contextActionLabel?: string;
    bioEmptyCopy?: string;
    bioModalTitle?: string;
    bioModalHelper?: string;
    contextModalTitle?: string;
    contextModalHelper?: string;
    emptyTitle?: string;
    emptyBody?: string;
  };
  actions: {
    publicPreviewLabel: string;
    mediaLabel: string;
    shareLabel: string;
  };
  username: {
    title: string;
    value: string;
    helperText: string;
    canEdit: boolean;
    publicUrl?: string | null;
    modalTitle?: string;
    modalHelper?: string;
    saveUnavailableReason?: string | null;
  };
  stats: Array<{
    label: string;
    value: string | number;
    helper?: string;
    visibility?: "public" | "private";
  }>;
  trustCards: Array<{
    title: string;
    value: string | number;
    helper: string;
    status?: ProfileStudioSeverity;
  }>;
  dashboardSummary: {
    title: string;
    text: string;
  };
  highlights: Array<{
    label: string;
    type: "new" | "collection";
    imageUrl?: string | null;
  }>;
  work: {
    title: string;
    countLabel: string;
    addLabel: string;
    emptyCopy: string;
    items: Array<{
      id: string;
      imageUrl?: string | null;
      alt: string;
      caption?: string | null;
    }>;
  };
};

type ProfileStudioShellProps = {
  model: ProfileStudioViewModel;
  backHref: Route;
  backLabel: string;
  usernameValue: string;
  onUsernameChange?: (value: string) => void;
  onUsernameSave?: (value: string) => void | Promise<void>;
  photoControl?: ReactNode;
  onPreview?: () => void;
  onMedia?: () => void;
  onAddMedia?: () => void;
  onShare?: () => void;
  onContextEdit?: () => void;
  onContextLocked?: () => void;
  onBioSave?: (value: string) => void | Promise<void>;
  onContextSave?: (values: Record<string, string>) => void | Promise<void>;
  contextFields?: ProfileContextField[];
  onDeleteMedia?: (id: string) => void;
  isSavingUsername?: boolean;
  isSavingBio?: boolean;
  isSavingContext?: boolean;
};

type StudioFolder = {
  id: string;
  label: string;
};

function initialsForName(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "BV";
}

function severityClass(severity: ProfileStudioSeverity = "neutral") {
  if (severity === "good") {
    return "border-[#a3ff12]/20 bg-[rgba(163,255,18,0.08)]";
  }
  if (severity === "warning") {
    return "border-yellow-300/24 bg-yellow-300/8";
  }
  return "border-white/8 bg-black/20";
}

export function ProfileStudioShell({
  model,
  backHref,
  backLabel,
  usernameValue,
  onUsernameChange,
  onUsernameSave,
  photoControl,
  onPreview,
  onMedia,
  onAddMedia,
  onShare,
  onContextEdit,
  onContextLocked,
  onBioSave,
  onContextSave,
  contextFields,
  onDeleteMedia,
  isSavingUsername,
  isSavingBio,
  isSavingContext
}: ProfileStudioShellProps) {
  const publicName = model.hero.publicName || model.hero.emptyTitle || "Finish profile";
  const workSectionRef = useRef<HTMLElement | null>(null);
  const usernameCloseTimerRef = useRef<number | null>(null);
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
  const [isBioModalOpen, setIsBioModalOpen] = useState(false);
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState(usernameValue);
  const [usernameFeedback, setUsernameFeedback] = useState<string | null>(null);
  const [usernameSaveState, setUsernameSaveState] = useState<UsernameSaveState>("idle");
  const [usernameSaveError, setUsernameSaveError] = useState<string | null>(null);
  const [usernameAvailability, setUsernameAvailability] = useState<UsernameAvailabilityState>("current");
  const [bioValue, setBioValue] = useState(model.hero.bio?.trim() ?? "");
  const [contextValue, setContextValue] = useState(model.hero.contextLine?.trim() ?? "");
  const previousHeroBioRef = useRef(model.hero.bio?.trim() ?? "");
  const previousContextRef = useRef(model.hero.contextLine?.trim() ?? "");
  const [bioFeedback, setBioFeedback] = useState<string | null>(null);
  const [contextFeedback, setContextFeedback] = useState<string | null>(null);
  const [folders, setFolders] = useState<StudioFolder[]>(() =>
    model.highlights
      .filter((highlight) => highlight.type === "collection")
      .map((highlight) => ({ id: highlight.label.toLowerCase(), label: highlight.label }))
  );
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<StudioFolder | null>(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [moveTarget, setMoveTarget] = useState<{ itemId: string; itemLabel: string } | null>(null);
  const [mediaFolderAssignments, setMediaFolderAssignments] = useState<Record<string, string>>({});
  const usernameModalTitle = model.username.modalTitle ?? (model.role === "shop_owner" ? "Edit public shop username" : "Edit public username");
  const usernameModalHelper = model.username.modalHelper ?? "This is how people find and share this public profile.";
  const bioModalTitle = model.hero.bioModalTitle ?? (model.role === "barber" ? "Edit public barber bio" : model.role === "shop_owner" ? "Edit public shop bio" : "Edit public bio");
  const bioModalHelper = model.hero.bioModalHelper ?? "This bio appears on your public profile.";
  const contextModalTitle = model.hero.contextModalTitle ?? (model.role === "barber" ? "Edit public chair/location" : model.role === "shop_owner" ? "Edit shop public location" : "Edit public location");
  const contextModalHelper = model.hero.contextModalHelper ?? "This appears on your public profile.";
  const mediaButtonLabel = model.work.addLabel;
  const roleFolderHelper = model.role === "client"
    ? "Group your Culture posts into a public folder."
    : model.role === "barber"
      ? "Group your portfolio images into a public folder."
      : "Group your shop gallery images into a public folder.";
  const normalizedCurrentUsername = usernameValue.trim().toLowerCase();
  const normalizedDraftUsername = usernameDraft.trim().toLowerCase();

  useEffect(() => {
    if (!isUsernameModalOpen) {
      setUsernameDraft(usernameValue);
      setUsernameAvailability("current");
    }
  }, [isUsernameModalOpen, usernameValue]);

  useEffect(() => {
    if (!isUsernameModalOpen || usernameSaveState === "saving" || usernameSaveState === "saved" || usernameSaveState === "error") {
      return undefined;
    }

    const username = normalizedDraftUsername;
    if (!username || username === normalizedCurrentUsername) {
      setUsernameAvailability("current");
      return undefined;
    }

    const localError = validateProfileHandle(username);
    if (localError) {
      setUsernameAvailability(localError.includes("reserved") ? "reserved" : "invalid");
      return undefined;
    }

    setUsernameAvailability("checking");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      const ownerType = model.role === "shop_owner" ? "shop" : model.role;
      const params = new URLSearchParams({ username, ownerType });
      fetch(`/api/profile/username/availability?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error("availability_check_failed");
          }
          return response.json() as Promise<{ available?: boolean; reason?: string | null }>;
        })
        .then((result) => {
          if (result.available) {
            setUsernameAvailability("available");
            return;
          }

          if (result.reason === "taken") {
            setUsernameAvailability("taken");
          } else if (result.reason === "reserved") {
            setUsernameAvailability("reserved");
          } else if (result.reason === "invalid") {
            setUsernameAvailability("invalid");
          } else {
            setUsernameAvailability("unavailable");
          }
        })
        .catch((error) => {
          if ((error as { name?: string }).name !== "AbortError") {
            setUsernameAvailability("unavailable");
          }
        });
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isUsernameModalOpen, model.role, normalizedCurrentUsername, normalizedDraftUsername, usernameSaveState]);

  useEffect(() => () => {
    if (usernameCloseTimerRef.current) {
      window.clearTimeout(usernameCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const nextBio = model.hero.bio?.trim() ?? "";
    if (nextBio !== previousHeroBioRef.current) {
      previousHeroBioRef.current = nextBio;
      if (!isBioModalOpen) {
        setBioValue(nextBio);
      }
    }
  }, [isBioModalOpen, model.hero.bio]);

  useEffect(() => {
    const nextContext = model.hero.contextLine?.trim() ?? "";
    if (nextContext !== previousContextRef.current) {
      previousContextRef.current = nextContext;
      if (!isContextModalOpen) {
        setContextValue(nextContext);
      }
    }
  }, [isContextModalOpen, model.hero.contextLine]);

  function handleAddMediaAction() {
    if (onAddMedia) {
      onAddMedia();
      return;
    }
    if (onMedia) {
      onMedia();
      return;
    }
    workSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function usernameSavedMessage(value: string) {
    return model.role === "shop_owner"
      ? `Public shop username saved. @${value} is live.`
      : `Public username saved. @${value} is live.`;
  }

  function contextSavedMessage() {
    if (model.role === "barber") {
      return "Service location saved.";
    }
    if (model.role === "shop_owner") {
      return "Shop location saved.";
    }
    return "Public location saved.";
  }

  function formatContextValues(values: Record<string, string>) {
    const address = values.address?.trim() ?? "";
    const city = values.city?.trim() ?? "";
    const state = values.state?.trim() ?? "";
    const zip = (values.zip ?? values.zipCode ?? "").trim();
    const cityState = [city, state].filter(Boolean).join(", ");
    const cityStateZip = [cityState, zip].filter(Boolean).join(" ");

    if (address && model.role === "barber") {
      return [address, cityStateZip].filter(Boolean).join(" / ");
    }

    if (address) {
      return [address, cityStateZip].filter(Boolean).join(" - ");
    }

    return cityStateZip || Object.values(values)
      .map((value) => value.trim())
      .filter(Boolean)
      .join(", ");
  }

  function openUsernameModal() {
    if (usernameCloseTimerRef.current) {
      window.clearTimeout(usernameCloseTimerRef.current);
      usernameCloseTimerRef.current = null;
    }
    setUsernameSaveState("idle");
    setUsernameSaveError(null);
    setUsernameAvailability("current");
    setIsUsernameModalOpen(true);
  }

  function closeUsernameModal() {
    if (usernameSaveState === "saving") {
      return;
    }
    if (usernameCloseTimerRef.current) {
      window.clearTimeout(usernameCloseTimerRef.current);
      usernameCloseTimerRef.current = null;
    }
    setIsUsernameModalOpen(false);
    setUsernameSaveState("idle");
    setUsernameSaveError(null);
    setUsernameAvailability("current");
  }

  function handleUsernameDraftChange(value: string) {
    setUsernameDraft(value);
    setUsernameSaveError(null);
    setUsernameSaveState("idle");
    const next = value.trim().toLowerCase();
    if (!next || next === normalizedCurrentUsername) {
      setUsernameAvailability("current");
      return;
    }

    const localError = validateProfileHandle(next);
    if (localError) {
      setUsernameAvailability(localError.includes("reserved") ? "reserved" : "invalid");
    } else {
      setUsernameAvailability("checking");
    }
  }

  function usernameAvailabilityMessage() {
    switch (usernameAvailability) {
      case "checking":
        return "Checking username...";
      case "available":
        return "Username available.";
      case "current":
        return "Username ready.";
      default:
        return null;
    }
  }

  function usernameAvailabilitySaveBlocker() {
    switch (usernameAvailability) {
      case "checking":
        return "Checking username...";
      case "taken":
        return "Username taken. Please choose a different username.";
      case "reserved":
        return "This username is reserved.";
      case "invalid":
        return "Use lowercase letters, numbers, hyphens, or underscores. No spaces.";
      case "unavailable":
        return "Unable to check username availability.";
      default:
        return null;
    }
  }

  async function handleUsernameSave(value: string) {
    setUsernameSaveState("saving");
    setUsernameSaveError(null);
    setUsernameFeedback(null);
    try {
      await onUsernameSave?.(value);
      setUsernameDraft(value);
      onUsernameChange?.(value);
      setUsernameSaveState("saved");
      setUsernameAvailability("current");
      usernameCloseTimerRef.current = window.setTimeout(() => {
        setIsUsernameModalOpen(false);
        setUsernameSaveState("idle");
        setUsernameSaveError(null);
        setUsernameFeedback(usernameSavedMessage(value));
        usernameCloseTimerRef.current = null;
      }, 850);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Unable to save username.";
      setUsernameSaveState("error");
      setUsernameSaveError(message);
      setUsernameFeedback(null);
    }
  }

  async function handleBioSave(value: string) {
    await onBioSave?.(value);
    setBioValue(value);
    setBioFeedback(value ? "Bio updated." : "Bio cleared.");
    setIsBioModalOpen(false);
  }

  async function handleContextSave(values: Record<string, string>) {
    await onContextSave?.(values);
    const nextContext = formatContextValues(values);
    if (nextContext) {
      setContextValue(nextContext);
    }
    setContextFeedback(contextSavedMessage());
  }

  function createFolder() {
    const nextName = folderDraft.trim();
    if (!nextName) {
      setFolderError("Folder name is required.");
      return;
    }
    if (nextName.length > 24) {
      setFolderError("Keep folder names under 24 characters.");
      return;
    }
    if (folders.length >= 6) {
      setFolderError("You can create up to 6 folders.");
      return;
    }
    if (folders.some((folder) => folder.label.toLowerCase() === nextName.toLowerCase())) {
      setFolderError("Folder name already exists.");
      return;
    }

    const nextFolder = {
      id: `${nextName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`,
      label: nextName
    };
    setFolders((current) => [...current, nextFolder]);
    setFolderDraft("");
    setFolderError(null);
    setIsFolderModalOpen(false);
  }

  function folderItems(folder: StudioFolder | null) {
    if (!folder) {
      return [];
    }
    const assignedItems = model.work.items.filter((item) => mediaFolderAssignments[item.id] === folder.id);
    return assignedItems.length ? assignedItems : folder.id === folders[0]?.id ? model.work.items : [];
  }

  function openFolder(folder: StudioFolder) {
    setActiveFolder(folder);
    setActiveMediaIndex(0);
  }

  function moveActiveIndex(delta: number) {
    const items = folderItems(activeFolder);
    if (!items.length) {
      return;
    }
    setActiveMediaIndex((current) => (current + delta + items.length) % items.length);
  }

  function assignMediaToFolder(folderId: string) {
    if (!moveTarget) {
      return;
    }
    setMediaFolderAssignments((current) => ({ ...current, [moveTarget.itemId]: folderId }));
    setMoveTarget(null);
  }

  return (
    <div className="space-y-6" data-testid={`profile-studio-${model.role}`}>
      <GlassCard className="flex flex-wrap items-start justify-between gap-4 rounded-[22px] p-5 sm:p-6">
        <div>
          <h1 className="text-[2.65rem] font-black leading-none tracking-[-0.045em] text-white sm:text-6xl">
            {model.page.title}
          </h1>
          <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-white/60 sm:text-[17px]">
            {model.page.subtitle}
          </p>
        </div>
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/76 transition hover:border-[#a3ff12]/30 hover:text-[#a3ff12]"
        >
          <ChevronRight className="h-4 w-4 rotate-180" aria-hidden="true" />
          {backLabel}
        </Link>
      </GlassCard>

      {model.page.statusText ? (
        <GlassCard className="flex items-center gap-3 rounded-[18px] p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#a3ff12]/25 bg-[#a3ff12]/10 text-[#a3ff12]">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-bold leading-6 text-white/68">{model.page.statusText}</p>
        </GlassCard>
      ) : null}

      <GlassCard active className="relative overflow-hidden rounded-[28px] p-0">
        <div
          className="h-44 border-b border-white/8 bg-[radial-gradient(circle_at_top_right,rgba(163,255,18,0.18),transparent_34%),linear-gradient(135deg,rgba(163,255,18,0.10),rgba(255,255,255,0.04)_42%,rgba(0,0,0,0.34))]"
          style={model.hero.coverUrl ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,0.10),rgba(0,0,0,0.48)), url(${model.hero.coverUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        />
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)]">
          <div className="relative -mt-20 h-[148px] w-[148px] shrink-0 overflow-hidden rounded-[28px] border-[3px] border-white/15 bg-black text-4xl font-black text-[#a3ff12] shadow-[0_0_0_2px_rgba(163,255,18,0.10),0_20px_60px_rgba(0,0,0,0.50)] sm:h-[178px] sm:w-[178px] sm:rounded-[36px] sm:text-5xl">
            {model.hero.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={model.hero.avatarUrl} alt={`${publicName} public image`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">{initialsForName(publicName)}</div>
            )}
            {photoControl}
          </div>

          <div className="min-w-0">
            <p className="bvr-section-label">{model.hero.label}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h2 className="text-[2.35rem] font-black leading-[1.05] tracking-[-0.045em] text-white">
                {model.hero.title}
              </h2>
              {model.hero.badge ? (
                <StatusBadge tone={model.hero.badge.toLowerCase().includes("needed") ? "neutral" : "green"}>
                  {model.hero.badge}
                </StatusBadge>
              ) : null}
            </div>
            <p className="mt-3 max-w-3xl text-xl font-medium leading-[1.4] text-white/78">{model.hero.subtitle}</p>
            <p className="mt-5 text-3xl font-black tracking-[-0.045em] text-white">{publicName}</p>
            {model.hero.username ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-base font-bold text-white/54">@{model.hero.username}</p>
                <button
                  type="button"
                  aria-label={usernameModalTitle}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[#a3ff12] transition hover:border-[#a3ff12]/30 hover:bg-[#a3ff12]/10"
                  onClick={openUsernameModal}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {usernameFeedback ? <span className="text-xs font-bold text-[#a3ff12]">{usernameFeedback}</span> : null}
              </div>
            ) : null}
            <div className="mt-4 flex max-w-3xl flex-wrap items-center gap-2">
              <p className="text-sm leading-6 text-white/58">
                {bioValue || model.hero.bioEmptyCopy || "Add a public bio."}
              </p>
              <button
                type="button"
                aria-label={bioModalTitle}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[#a3ff12] transition hover:border-[#a3ff12]/30 hover:bg-[#a3ff12]/10"
                onClick={() => setIsBioModalOpen(true)}
              >
                <Pencil className="h-4 w-4" />
              </button>
              {bioFeedback ? <span className="text-xs font-bold text-[#a3ff12]">{bioFeedback}</span> : null}
            </div>
            {contextValue ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-base font-semibold text-white/50">
                <span>{contextValue}</span>
                {contextFeedback ? <span className="text-xs font-bold text-[#a3ff12]">{contextFeedback}</span> : null}
                {model.hero.contextEditable ? (
                  <button
                    type="button"
                    aria-label={model.hero.contextActionLabel ?? "Edit public context"}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-[#a3ff12] transition hover:border-[#a3ff12]/30 hover:bg-[#a3ff12]/10"
                    onClick={() => {
                      if (contextFields?.length && onContextSave) {
                        setIsContextModalOpen(true);
                        return;
                      }
                      onContextEdit?.();
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                ) : model.hero.contextLocked ? (
                  <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.025] text-white/44" aria-label="Public context locked" onClick={onContextLocked}>
                    <Lock className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-[#a3ff12] px-4 text-sm font-black text-[#050505] transition hover:bg-[#d7ffab]" onClick={onPreview}>
                <Eye className="h-4 w-4" aria-hidden="true" />
                {model.actions.publicPreviewLabel}
              </button>
              <button type="button" aria-label={model.actions.shareLabel} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.035] px-4 text-sm font-extrabold text-white/74 transition hover:border-[#a3ff12]/30 hover:text-white" onClick={onShare}>
                <Share2 className="h-4 w-4 text-[#a3ff12]" aria-hidden="true" />
                Share
              </button>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden rounded-[20px] p-0">
        <div className="grid sm:grid-cols-3">
          {model.stats.map((stat, index) => (
            <div key={stat.label} className={cn("min-h-[128px] p-5", index > 0 && "border-t border-white/10 sm:border-l sm:border-t-0")}>
              <p className="text-[30px] font-black leading-none tracking-[-0.03em] text-white">{stat.value}</p>
              <p className="mt-2 text-lg font-medium text-white/72">{stat.label}</p>
              {stat.helper ? <p className="mt-1 text-[15px] font-bold text-[#a3ff12]">{stat.helper}</p> : null}
            </div>
          ))}
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-3">
        {model.trustCards.slice(0, 3).map((card) => (
          <GlassCard key={card.title} className={cn("rounded-[20px] p-5", severityClass(card.status))}>
            <p className="text-[30px] font-black leading-tight tracking-[-0.03em] text-white">{card.value}</p>
            <p className="mt-1 text-lg font-medium text-white/72">{card.title}</p>
            <p className="mt-1 text-[15px] font-bold text-[#a3ff12]">{card.helper}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="flex min-h-[106px] items-center justify-between gap-4 rounded-[18px] p-[22px]">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border border-[#a3ff12]/25 bg-[rgba(163,255,18,0.08)] text-[#a3ff12]">
            <Sparkles className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <p className="text-[22px] font-black tracking-[-0.03em] text-white">{model.dashboardSummary.title}</p>
            <p className="mt-1 text-[17px] text-white/60">{model.dashboardSummary.text}</p>
          </div>
        </div>
      </GlassCard>

      <section className="overflow-hidden" aria-label="Profile highlights">
        <div className="hide-scrollbar flex gap-5 overflow-x-auto pb-2">
          <button type="button" className="flex w-[112px] shrink-0 flex-col items-center" onClick={() => setIsFolderModalOpen(true)}>
            <span className="flex h-[112px] w-[112px] items-center justify-center rounded-full border-[3px] border-white/15 bg-white/[0.018] text-[54px] font-light leading-none text-[#a3ff12]">
              +
            </span>
            <span className="mt-2 max-w-full truncate text-center text-base font-medium text-white/70">New</span>
          </button>
          {folders.map((folder) => (
            <button key={folder.id} type="button" className="flex w-[112px] shrink-0 flex-col items-center" onClick={() => openFolder(folder)}>
              <span className="flex h-[112px] w-[112px] items-center justify-center rounded-full border-[3px] border-white/15 bg-white/[0.018] text-[38px] font-black leading-none text-[#a3ff12]">
                {folder.label.slice(0, 1).toUpperCase()}
              </span>
              <span className="mt-2 max-w-full truncate text-center text-base font-medium text-white/70">{folder.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section ref={workSectionRef} className="space-y-4 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black tracking-[-0.03em] text-white">{model.work.title}</h3>
            <p className="mt-1 text-lg font-medium text-white/60">{model.work.countLabel}</p>
          </div>
          <button type="button" aria-label={mediaButtonLabel} className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-[#a3ff12]/25 bg-[#a3ff12]/10 px-4 text-sm font-black text-[#a3ff12] transition hover:bg-[#a3ff12]/16" onClick={handleAddMediaAction}>
            <Plus className="h-5 w-5" />
            {mediaButtonLabel}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {model.work.items.length ? model.work.items.slice(0, 9).map((item) => (
            <div key={item.id} className="group relative aspect-square overflow-hidden rounded-[12px] border border-white/10 bg-black/25">
              <button type="button" className="h-full w-full" onClick={handleAddMediaAction}>
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt={item.alt} className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm text-white/42">Image unavailable</span>
              )}
              </button>
              <button
                type="button"
                aria-label={`Remove ${item.alt}`}
                className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/40 bg-black/72 text-white shadow-lg transition hover:border-red-300/40 hover:text-red-200"
                onClick={() => onDeleteMedia?.(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label={`Move ${item.alt} to folder`}
                className="absolute left-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/40 bg-black/72 text-white shadow-lg transition hover:border-[#a3ff12]/40 hover:text-[#a3ff12]"
                onClick={() => setMoveTarget({ itemId: item.id, itemLabel: item.alt })}
              >
                <FolderPlus className="h-4 w-4" />
              </button>
            </div>
          )) : (
            <div className="col-span-3 flex aspect-[3/1] items-center justify-center rounded-[18px] border border-dashed border-white/10 bg-black/20 p-5 text-center text-sm text-white/58">
              {model.work.emptyCopy}
            </div>
          )}
        </div>
      </section>

      {isUsernameModalOpen ? (
        <ProfileUsernameEditModal
          title={usernameModalTitle}
          helper={usernameModalHelper}
          value={usernameDraft}
          isSaving={usernameSaveState === "saving" || Boolean(isSavingUsername)}
          isSaved={usernameSaveState === "saved"}
          saveError={usernameSaveError}
          availabilityMessage={usernameAvailabilityMessage()}
          availabilityTone={usernameAvailability === "checking" ? "warning" : "success"}
          saveDisabledReason={model.username.saveUnavailableReason ?? (!onUsernameSave ? "Handle saving is not connected yet." : usernameAvailabilitySaveBlocker())}
          onChange={handleUsernameDraftChange}
          onClose={closeUsernameModal}
          onSave={handleUsernameSave}
        />
      ) : null}

      {isBioModalOpen ? (
        <ProfileBioEditModal
          title={bioModalTitle}
          helper={bioModalHelper}
          value={bioValue}
          isSaving={isSavingBio}
          onClose={() => setIsBioModalOpen(false)}
          onSave={handleBioSave}
        />
      ) : null}

      {isContextModalOpen && contextFields?.length ? (
        <ProfileContextEditModal
          title={contextModalTitle}
          helper={contextModalHelper}
          fields={contextFields}
          isSaving={isSavingContext}
          successMessage={contextSavedMessage()}
          onClose={() => setIsContextModalOpen(false)}
          onSave={handleContextSave}
        />
      ) : null}

      {isFolderModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-4 py-6 backdrop-blur-md sm:items-center">
          <div role="dialog" aria-modal="true" aria-label="Create folder" className="w-full max-w-md rounded-[24px] border border-[#a3ff12]/24 bg-[#080808] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#a3ff12]">Profile folder</p>
                <h3 className="mt-2 text-2xl font-black tracking-[-0.035em] text-white">Create folder</h3>
                <p className="mt-2 text-sm leading-6 text-white/58">{roleFolderHelper}</p>
              </div>
              <button type="button" aria-label="Close folder creator" className="rounded-full border border-white/10 p-2 text-white/70" onClick={() => setIsFolderModalOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-5 block text-sm font-bold text-white/72" htmlFor="profile-folder-name">Folder name</label>
            <input
              id="profile-folder-name"
              value={folderDraft}
              maxLength={24}
              onChange={(event) => {
                setFolderDraft(event.target.value);
                setFolderError(null);
              }}
              className="mt-2 h-12 w-full rounded-[12px] border border-white/10 bg-black/35 px-4 text-white outline-none transition focus:border-[#a3ff12]/50"
            />
            {folderError ? <p className="mt-3 text-sm font-bold text-red-200">{folderError}</p> : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" className="min-h-11 rounded-[8px] border border-white/10 px-4 text-sm font-extrabold text-white/70" onClick={() => setIsFolderModalOpen(false)}>Cancel</button>
              <button type="button" className="min-h-11 rounded-[8px] bg-[#a3ff12] px-4 text-sm font-black text-black" onClick={createFolder}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {activeFolder ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/78 px-4 py-6 backdrop-blur-md sm:items-center">
          <div role="dialog" aria-modal="true" aria-label={`${activeFolder.label} folder viewer`} className="w-full max-w-4xl rounded-[28px] border border-white/10 bg-[#070707] p-5 shadow-[0_34px_100px_rgba(0,0,0,0.62)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#a3ff12]">Folder</p>
                <h3 className="mt-1 text-2xl font-black tracking-[-0.035em] text-white">{activeFolder.label}</h3>
              </div>
              <button type="button" aria-label="Close folder viewer" className="rounded-full border border-white/10 p-2 text-white/70" onClick={() => setActiveFolder(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {folderItems(activeFolder).length ? (
              <div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <button type="button" aria-label="Previous image" className="rounded-full border border-white/10 p-3 text-white" onClick={() => moveActiveIndex(-1)}>
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="grid grid-cols-[0.7fr_1fr_0.7fr] items-center gap-3 overflow-hidden">
                  {[-1, 0, 1].map((offset) => {
                    const items = folderItems(activeFolder);
                    const item = items[(activeMediaIndex + offset + items.length) % items.length];
                    return (
                      <div key={`${item.id}-${offset}`} className={cn("aspect-square overflow-hidden rounded-[22px] border border-white/10 bg-black/30 transition", offset === 0 ? "scale-100 opacity-100" : "scale-90 opacity-35 blur-[1px]")}>
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt={item.alt} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <button type="button" aria-label="Next image" className="rounded-full border border-white/10 p-3 text-white" onClick={() => moveActiveIndex(1)}>
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="mt-6 rounded-[22px] border border-dashed border-white/10 bg-black/24 p-8 text-center text-sm text-white/58">
                No media in this folder yet. Add or move media into this folder.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {moveTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-4 py-6 backdrop-blur-md sm:items-center">
          <div role="dialog" aria-modal="true" aria-label="Move to folder" className="w-full max-w-md rounded-[24px] border border-white/10 bg-[#080808] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black tracking-[-0.035em] text-white">Move to folder</h3>
                <p className="mt-2 text-sm text-white/58">{moveTarget.itemLabel}</p>
              </div>
              <button type="button" aria-label="Close move to folder" className="rounded-full border border-white/10 p-2 text-white/70" onClick={() => setMoveTarget(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-2">
              {folders.map((folder) => (
                <button key={folder.id} type="button" className="min-h-12 rounded-[10px] border border-white/10 bg-white/[0.035] px-4 text-left text-sm font-bold text-white transition hover:border-[#a3ff12]/35" onClick={() => assignMediaToFolder(folder.id)}>
                  {folder.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
