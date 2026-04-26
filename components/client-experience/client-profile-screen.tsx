"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BellRing,
  Camera,
  Copy,
  CreditCard,
  Gift,
  Heart,
  LifeBuoy,
  MailPlus,
  MapPinned,
  Settings2,
  ShieldCheck,
  Store,
  Trash2,
  UserRound
} from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { ClientPaymentMethodsPanel } from "@/components/client-experience/client-payment-methods-panel";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { CLIENT_PRIMARY_TAB_HREFS } from "@/components/client-experience/client-tab-config";
import { Button } from "@/components/ui/button";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Input } from "@/components/ui/input";
import { useClientMembershipQuery } from "@/lib/booking/client";
import type { ClientProfilePayload } from "@/lib/booking/platform-service";
import { useCreateReferralInviteMutation, useClientReferralSummary } from "@/lib/engagement/client";
import { usePointsBalanceQuery, usePointsHistoryQuery } from "@/lib/points/client";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import { uploadMediaAsset } from "@/lib/storage/media";
import { currency } from "@/lib/utils";

type PickerInput = HTMLInputElement & {
  showPicker?: () => void;
};

const sectionIdMap = {
  preferences: "profile-preferences",
  location: "profile-preferences",
  wallet: "profile-wallet",
  rewards: "profile-rewards",
  referrals: "profile-referrals",
  settings: "profile-settings"
} as const;

type ProfileSectionKey = keyof typeof sectionIdMap;

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
      // Fall through to click() if showPicker is unavailable in the browser.
    }
  }

  picker.click();
}

function validateProfilePhoto(file: File | null) {
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

function formatOccurredAt(iso?: string | null) {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function initialsForName(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ClientProfileScreen({
  payload,
  isSignedInClient,
  initialSection
}: {
  payload: ClientProfilePayload;
  isSignedInClient: boolean;
  initialSection?: string;
}) {
  const mediaQuery = useProfileMediaWorkspaceQuery(isSignedInClient);
  const mediaMutation = useMutateProfileMediaMutation();
  const membershipQuery = useClientMembershipQuery(isSignedInClient);
  const pointsBalanceQuery = usePointsBalanceQuery(isSignedInClient);
  const pointsHistoryQuery = usePointsHistoryQuery(isSignedInClient);
  const referralSummaryQuery = useClientReferralSummary(isSignedInClient);
  const inviteMutation = useCreateReferralInviteMutation();

  const [mediaFeedback, setMediaFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [referralFeedback, setReferralFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const profileInputRef = useRef<HTMLInputElement | null>(null);

  const client = payload.client;
  const favoriteBarber = payload.favoriteBarber;
  const preferredShops = payload.preferredShops;
  const paymentMethods = payload.paymentMethods;
  const defaultPaymentMethod = paymentMethods.find((method) => method.isDefault) ?? null;
  const clientName = client?.fullName ?? (isSignedInClient ? "Client" : "Client preview");
  const clientEmail = client?.email ?? "No email on file yet";
  const clientPhone = client?.phone ?? "No phone on file yet";
  const clientPhotoUrl = mediaQuery.data?.viewer.profilePhotoUrl;
  const pointsBalance = pointsBalanceQuery.data ?? null;
  const pointsHistory = pointsHistoryQuery.data ?? null;
  const recentPointsActivity = pointsHistory?.activity.slice(0, 3) ?? [];
  const membership = membershipQuery.data ?? null;
  const activeMembership = membership?.subscription ?? null;
  const membershipValue = membership?.value ?? null;
  const referralSummary = referralSummaryQuery.data ?? null;
  const primaryShop = preferredShops[0] ?? null;
  const selectedSection = (initialSection && initialSection in sectionIdMap ? initialSection : null) as ProfileSectionKey | null;

  useEffect(() => {
    if (!selectedSection) {
      return;
    }

    const target = document.getElementById(sectionIdMap[selectedSection]);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedSection]);

  async function handleProfileUpload(file: File) {
    setMediaFeedback(null);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const uploaded = await uploadMediaAsset(
        `profiles/client/${client?.clientReference ?? clientEmail}/${Date.now()}.${extension}`,
        file
      );

      await mediaMutation.mutateAsync({
        action: "set_viewer_photo",
        storagePath: uploaded.path,
        imageUrl: uploaded.publicUrl
      });

      setMediaFeedback({
        tone: "success",
        message: "Profile photo updated."
      });
    } catch (error) {
      setMediaFeedback({
        tone: "error",
        message: readableError(error, "Unable to update your profile photo.")
      });
    }
  }

  async function handleProfileRemove() {
    setMediaFeedback(null);
    try {
      await mediaMutation.mutateAsync({ action: "remove_viewer_photo" });
      setMediaFeedback({
        tone: "success",
        message: "Profile photo removed."
      });
    } catch (error) {
      setMediaFeedback({
        tone: "error",
        message: readableError(error, "Unable to remove your profile photo.")
      });
    }
  }

  async function handleCopyInviteLink() {
    if (!referralSummary?.inviteLink) {
      return;
    }

    setReferralFeedback(null);

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(referralSummary.inviteLink);
      }

      setReferralFeedback({
        tone: "success",
        message: "Invite link copied."
      });
    } catch (error) {
      setReferralFeedback({
        tone: "error",
        message: readableError(error, "Unable to copy the invite link right now.")
      });
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      setReferralFeedback({
        tone: "error",
        message: "Enter an email address to send an invite."
      });
      return;
    }

    setReferralFeedback(null);

    try {
      await inviteMutation.mutateAsync({ referredClientEmail: inviteEmail.trim() });
      setInviteEmail("");
      setReferralFeedback({
        tone: "success",
        message: "Invite sent. Rewards only post after a qualified paid service is completed."
      });
    } catch (error) {
      setReferralFeedback({
        tone: "error",
        message: readableError(error, "Unable to send the invite right now.")
      });
    }
  }

  return (
    <div className="space-y-4" data-testid="client-profile-screen">
      {mediaFeedback ? <FeedbackBanner tone={mediaFeedback.tone} message={mediaFeedback.message} /> : null}
      {referralFeedback ? <FeedbackBanner tone={referralFeedback.tone} message={referralFeedback.message} /> : null}
      {pointsBalanceQuery.error ? <FeedbackBanner tone="error" message="Rewards are unavailable right now. The rest of your profile is still ready." /> : null}
      {membershipQuery.error ? <FeedbackBanner tone="error" message="Membership status could not be loaded right now." /> : null}
      {referralSummaryQuery.error ? <FeedbackBanner tone="error" message="Invite progress is unavailable right now." /> : null}

      <ClientSectionBlock
        eyebrow="Account"
        title="Account"
        subtitle="Your identity, contact details, and payment default."
      >
        <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(7,7,7,0.99))] p-5 shadow-[0_22px_44px_rgba(0,0,0,0.2)] sm:p-6">
          <input
            ref={profileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0] ?? null;
              event.currentTarget.value = "";
              const error = validateProfilePhoto(file);
              if (error) {
                setMediaFeedback({ tone: "error", message: error });
                return;
              }

              await handleProfileUpload(file!);
            }}
          />

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="relative">
                {clientPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={clientPhotoUrl}
                    alt={clientName}
                    className="h-24 w-24 rounded-[28px] border border-white/10 object-cover shadow-[0_18px_34px_rgba(0,0,0,0.22)]"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(124,255,0,0.18),rgba(12,12,12,0.96))] text-2xl font-semibold text-[#d7ffab] shadow-[0_18px_34px_rgba(0,0,0,0.22)]">
                    {initialsForName(clientName)}
                  </div>
                )}

                {isSignedInClient ? (
                  <button
                    type="button"
                    aria-label="Edit profile photo"
                    onClick={() => openFilePicker(profileInputRef.current)}
                    className="absolute -bottom-2 -right-2 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d7ffab]/24 bg-black/90 text-[#d7ffab] transition hover:border-[#d7ffab]/40"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="min-w-0">
                <p className="text-2xl font-semibold text-white" data-display="true">{clientName}</p>
                <p className="mt-2 text-sm text-white/70">{clientEmail}</p>
                <p className="mt-2 text-sm text-white/58">{clientPhone}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/76">
                    {defaultPaymentMethod?.label ?? "No default payment method"}
                  </span>
                  <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-white/76">
                    {paymentMethods.length} saved payment method{paymentMethods.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="#profile-wallet"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[13px] font-semibold text-white/86 transition hover:border-[#d7ffab]/18 hover:text-[#d7ffab]"
              >
                Manage in Wallet
              </Link>
              {isSignedInClient && clientPhotoUrl ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 rounded-full px-4"
                  disabled={mediaMutation.isPending}
                  onClick={() => void handleProfileRemove()}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove Photo
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Preferences"
        title="Preferences"
        subtitle="Saved barbers, shops, and location stay together here."
      >
        <div id="profile-preferences" className="grid scroll-mt-6 gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
          <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <Heart className="h-4 w-4 text-[#d7ffab]" />
              Preferred Barbers
            </div>
            <div className="mt-4 space-y-3">
              {favoriteBarber ? (
                <div className="rounded-[24px] border border-white/8 bg-black/18 p-4">
                  <div className="flex items-start gap-3">
                    {favoriteBarber.profile.profilePhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={favoriteBarber.profile.profilePhotoUrl}
                        alt={favoriteBarber.barber.name}
                        className="h-16 w-16 rounded-[20px] border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-white/10 bg-[linear-gradient(135deg,rgba(124,255,0,0.18),rgba(12,12,12,0.96))] text-sm font-semibold text-[#d7ffab]">
                        {initialsForName(favoriteBarber.barber.name)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold text-white">{favoriteBarber.barber.name}</p>
                      <p className="mt-1 text-sm text-white/58">
                        {favoriteBarber.shopLocations[0]?.name ?? favoriteBarber.profile.headline ?? "Preferred barber"}
                      </p>
                      <p className="mt-2 text-sm text-white/72">
                        {favoriteBarber.proof?.reviewScore ? `${favoriteBarber.proof.reviewScore.toFixed(1)} rating` : "Trusted favorite"}
                      </p>
                    </div>
                  </div>
                    <div className="mt-4">
                    <ClientActionLink href={(favoriteBarber.bookingCtaHref ?? `${CLIENT_PRIMARY_TAB_HREFS.search}?type=barbers`) as Route} size="md">
                      Book
                    </ClientActionLink>
                  </div>
                </div>
              ) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-black/18 p-4">
                  <p className="text-lg font-semibold text-white">No preferred barbers yet</p>
                  <div className="mt-4">
                    <ClientActionLink href={`${CLIENT_PRIMARY_TAB_HREFS.search}?type=barbers` as Route} size="md">
                      Find Barbers
                    </ClientActionLink>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <Store className="h-4 w-4 text-[#baff69]" />
              Preferred Shops
            </div>
            <div className="mt-4 space-y-3">
              {preferredShops.length ? preferredShops.map((shop) => (
                <div key={shop.id} className="rounded-[24px] border border-white/8 bg-black/18 p-4">
                  <p className="text-lg font-semibold text-white">{shop.name}</p>
                  <p className="mt-2 text-sm text-white/58">{[shop.neighborhood, shop.city, shop.state].filter(Boolean).join(", ")}</p>
                  <div className="mt-4">
                    <ClientActionLink
                      href={`${CLIENT_PRIMARY_TAB_HREFS.search}?type=shops&q=${encodeURIComponent(shop.name)}&locationId=${encodeURIComponent(shop.id)}` as never}
                      size="md"
                    >
                      View Barbers
                    </ClientActionLink>
                  </div>
                </div>
              )) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-black/18 p-4">
                  <p className="text-lg font-semibold text-white">No preferred shops yet</p>
                  <div className="mt-4">
                    <ClientActionLink href={`${CLIENT_PRIMARY_TAB_HREFS.search}?type=shops` as Route} size="md" variant="secondary">
                      Find Barber Shops
                    </ClientActionLink>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <MapPinned className="h-4 w-4 text-[#d7ffab]" />
              Preferred Location
            </div>
            <p className="mt-4 text-lg font-semibold text-white">{primaryShop?.name ?? "No location saved yet"}</p>
            <p className="mt-2 text-sm text-white/58">
              {primaryShop
                ? [primaryShop.neighborhood, primaryShop.city, primaryShop.state].filter(Boolean).join(", ")
                : "Add a location so next-available booking and recommendations stay local."}
            </p>
            <div className="mt-4">
              <Link
                href="/settings"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[13px] font-semibold text-white/84 transition hover:border-[#d7ffab]/18 hover:text-[#d7ffab]"
              >
                {primaryShop ? "Update Location" : "Add Location"}
              </Link>
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Wallet"
        title="Wallet"
        subtitle="Saved payment methods and the booking default stay here."
      >
        <div id="profile-wallet" className="scroll-mt-6 space-y-4">
          <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <CreditCard className="h-4 w-4 text-[#baff69]" />
              Default payment method
            </div>
            <p className="mt-4 text-lg font-semibold text-white">{defaultPaymentMethod?.label ?? "No default payment method"}</p>
            <p className="mt-2 text-sm text-white/58">
              {defaultPaymentMethod
                ? "This method is used when the canonical booking flow requests payment."
                : "Add a payment method to keep booking and rebooking fast."}
            </p>
          </div>
          <ClientPaymentMethodsPanel initialMethods={paymentMethods} isSignedInClient={isSignedInClient} />
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Rewards"
        title="Rewards"
        subtitle="BVR Points, progress, and membership stay compact here."
      >
        <div id="profile-rewards" className="scroll-mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-[24px] border border-[#a8ff47]/16 bg-[linear-gradient(180deg,rgba(124,255,0,0.12),rgba(8,8,8,0.98))] p-4">
              <p className="surface-label text-[#d7ffab]">BVR Points</p>
              <p className="mt-3 text-2xl font-semibold text-white">{pointsBalance?.unlockedPoints ?? 0} pts</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Pending</p>
              <p className="mt-3 text-2xl font-semibold text-white">{pointsBalance?.pendingPoints ?? 0} pts</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Value</p>
              <p className="mt-3 text-2xl font-semibold text-white">{currency(pointsBalance?.inAppValue ?? 0)}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Progress</p>
              <p className="mt-3 text-sm font-semibold text-white">{pointsBalance?.explanation.progressLabel ?? "No milestone yet"}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Membership</p>
              <p className="mt-3 text-lg font-semibold text-white">{activeMembership?.planName ?? "No membership"}</p>
              <p className="mt-2 text-sm text-white/58">{membershipValue?.valueMessage ?? "Membership updates appear here when active."}</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <Gift className="h-4 w-4 text-[#d7ffab]" />
              Rewards activity
            </div>
            <div className="mt-4 space-y-3">
              {recentPointsActivity.length ? recentPointsActivity.map((item) => (
                <div key={item.id} className="rounded-[20px] border border-white/8 bg-black/18 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{item.title}</p>
                      <p className="mt-2 text-sm text-white/58">{item.detail}</p>
                    </div>
                    <span className="rounded-full border border-[#d7ffab]/16 bg-[#d7ffab]/10 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#e8ffc2]">
                      {item.amountLabel}
                    </span>
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-[0.16em] text-white/42">
                    {formatOccurredAt(item.occurredAt) ?? "Recently"}
                  </p>
                </div>
              )) : (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-black/18 px-4 py-4 text-sm text-white/58">
                  No rewards activity yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Invite & Earn"
        title="Invite & Earn"
        subtitle="Share your code and earn when a qualified paid service closes."
      >
        <div id="profile-referrals" className="scroll-mt-6 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="inline-flex items-center gap-2 text-sm text-white/78">
                <Copy className="h-4 w-4 text-[#d7ffab]" />
                Referral code
              </div>
              <p className="mt-4 text-2xl font-semibold text-white">{referralSummary?.referralCode?.code ?? "No code yet"}</p>
              <p className="mt-2 text-sm text-white/58">
                {referralSummary?.referralCode
                  ? `${referralSummary.referralCode.rewardPoints} pts credit after the invited client completes a qualified paid service.`
                  : "Referral rewards appear here when your invite code is ready."}
              </p>
              <div className="mt-4 rounded-[20px] border border-white/8 bg-black/18 px-4 py-4 text-sm text-white/72">
                {referralSummary?.inviteLink ?? "No share link available yet."}
              </div>
              <div className="mt-4">
                <Button
                  type="button"
                  className="min-h-11 rounded-full px-5"
                  onClick={() => void handleCopyInviteLink()}
                  disabled={!referralSummary?.inviteLink}
                >
                  <Copy className="h-4 w-4" />
                  Copy Invite Link
                </Button>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
              <div className="inline-flex items-center gap-2 text-sm text-white/78">
                <MailPlus className="h-4 w-4 text-[#baff69]" />
                Direct invite
              </div>
              <p className="mt-4 text-sm text-white/58">Invite someone directly and track the real lifecycle from shared to credited.</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Input
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="friend@example.com"
                  className="sm:flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 rounded-full px-5"
                  disabled={!isSignedInClient || inviteMutation.isPending}
                  onClick={() => void handleInvite()}
                >
                  <MailPlus className="h-4 w-4" />
                  {inviteMutation.isPending ? "Sending..." : "Send Invite"}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Shared</p>
              <p className="mt-3 text-2xl font-semibold text-white">{referralSummary?.totals.invited ?? 0}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Signed up</p>
              <p className="mt-3 text-2xl font-semibold text-white">{referralSummary?.totals.signedUp ?? 0}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Booked</p>
              <p className="mt-3 text-2xl font-semibold text-white">{referralSummary?.totals.booked ?? 0}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Completed</p>
              <p className="mt-3 text-2xl font-semibold text-white">{referralSummary?.totals.completed ?? 0}</p>
            </div>
            <div className="rounded-[24px] border border-[#7CFF00]/18 bg-[#7CFF00]/8 p-4">
              <p className="surface-label text-[#d7ffab]">Credited</p>
              <p className="mt-3 text-2xl font-semibold text-white">{referralSummary?.totals.credited ?? 0}</p>
              <p className="mt-2 text-sm text-white/64">{referralSummary?.totals.rewardPointsEarned ?? 0} pts earned</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <ShieldCheck className="h-4 w-4 text-[#d7ffab]" />
              Recent referral progress
            </div>
            <div className="mt-4 space-y-3">
              {referralSummary?.recentReferrals.length ? referralSummary.recentReferrals.slice(0, 3).map((referral) => (
                <div key={referral.id} className="rounded-[20px] border border-white/8 bg-black/18 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{referral.referredClientEmail}</p>
                      <p className="mt-2 text-sm text-white/58">{formatOccurredAt(referral.creditedAt ?? referral.completedAt ?? referral.bookedAt ?? referral.signedUpAt ?? referral.createdAt) ?? "Recently"}</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#d7ffab]">
                      {referral.status.replaceAll("_", " ")}
                    </span>
                  </div>
                </div>
              )) : (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-black/18 px-4 py-4 text-sm text-white/58">
                  No referral progress yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Settings & Support"
        title="Settings & Support"
        subtitle="Notification controls, privacy, and help stay in one place."
      >
        <div id="profile-settings" className="grid scroll-mt-6 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <Settings2 className="h-4 w-4 text-[#d7ffab]" />
              Account settings
            </div>
            <p className="mt-3 text-lg font-semibold text-white">Profile and security</p>
            <p className="mt-2 text-sm text-white/58">Manage contact details, password, and privacy controls.</p>
            <div className="mt-4">
              <Link href="/settings" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[13px] font-semibold text-white/84 transition hover:border-[#d7ffab]/18 hover:text-[#d7ffab]">
                Open settings
              </Link>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <BellRing className="h-4 w-4 text-[#baff69]" />
              Notification preferences
            </div>
            <p className="mt-3 text-lg font-semibold text-white">Stay in the loop</p>
            <p className="mt-2 text-sm text-white/58">Update reminder and communication preferences without cluttering the rest of the app.</p>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <LifeBuoy className="h-4 w-4 text-[#d7ffab]" />
              Support
            </div>
            <p className="mt-3 text-lg font-semibold text-white">Need help?</p>
            <p className="mt-2 text-sm text-white/58">Message support or jump into Activity when a booking or receipt needs attention.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/messages" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[13px] font-semibold text-white/84 transition hover:border-[#d7ffab]/18 hover:text-[#d7ffab]">
                Message Support
              </Link>
              <Link href={CLIENT_PRIMARY_TAB_HREFS.activity} className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[13px] font-semibold text-white/84 transition hover:border-[#d7ffab]/18 hover:text-[#d7ffab]">
                Open Activity
              </Link>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78">
              <UserRound className="h-4 w-4 text-[#baff69]" />
              Account status
            </div>
            <p className="mt-3 text-lg font-semibold text-white">{clientEmail}</p>
            <p className="mt-2 text-sm text-white/58">{clientPhone}</p>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Logout"
        title="Logout"
        subtitle="End the current session when you are done."
      >
        <div className="rounded-[28px] border border-white/10 bg-black/20 p-5">
          <LogoutButton compact className="max-w-sm" />
        </div>
      </ClientSectionBlock>
    </div>
  );
}
