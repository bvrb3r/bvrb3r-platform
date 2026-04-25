"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  BellRing,
  CreditCard,
  Gift,
  Heart,
  LifeBuoy,
  Link2,
  MapPinned,
  Repeat2,
  Settings2,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import { ClientActionLink } from "@/components/client-experience/client-action-link";
import { ClientPaymentMethodsPanel } from "@/components/client-experience/client-payment-methods-panel";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { CLIENT_PRIMARY_TAB_HREFS } from "@/components/client-experience/client-tab-config";
import { ReferralsWorkspace } from "@/components/engagement/referrals-workspace";
import { ProfilePhotoManagerCard } from "@/components/profile/profile-media-manager";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import type { ClientProfilePayload } from "@/lib/booking/platform-service";
import { useClientMembershipQuery } from "@/lib/booking/client";
import { usePointsBalanceQuery, usePointsHistoryQuery } from "@/lib/points/client";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import { uploadMediaAsset } from "@/lib/storage/media";
import { currency } from "@/lib/utils";

function formatRoutineDate(iso?: string | null) {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
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

const sectionIdMap = {
  preferences: "profile-preferences",
  location: "profile-preferences",
  wallet: "profile-wallet",
  rewards: "profile-rewards",
  referrals: "profile-referrals",
  settings: "profile-settings"
} as const;

type ProfileSectionKey = keyof typeof sectionIdMap;

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
  const client = payload.client;
  const favoriteBarber = payload.favoriteBarber;
  const preferredShops = payload.preferredShops;
  const notificationPreference = payload.notificationPreference;
  const routine = payload.routine;
  const paymentMethods = payload.paymentMethods;
  const defaultPaymentMethod = paymentMethods.find((method) => method.isDefault) ?? null;
  const primaryShop = preferredShops[0];
  const clientName = client?.fullName ?? (isSignedInClient ? "Client" : "Client profile preview");
  const clientEmail = client?.email ?? "No email on file yet";
  const clientPhone = client?.phone ?? "No phone on file yet";
  const routineLabel = routine ? `${routine.label} with ${favoriteBarber?.barber.name ?? "your barber"}` : "No auto-book cadence yet";
  const routineTiming = formatRoutineDate(routine?.nextSuggestedAt);
  const notificationLabel = notificationPreference
    ? notificationPreference.smsEnabled
      ? "SMS reminders on"
      : "In-app reminders on"
    : "Reminders ready";
  const clientPhotoUrl = mediaQuery.data?.viewer.profilePhotoUrl;
  const pointsBalance = pointsBalanceQuery.data ?? null;
  const pointsHistory = pointsHistoryQuery.data ?? null;
  const membership = membershipQuery.data ?? null;
  const recentPointsActivity = pointsHistory?.activity.slice(0, 3) ?? [];
  const activeMembership = membership?.subscription ?? null;
  const membershipValue = membership?.value ?? null;
  const rewardsEmpty = !pointsBalance?.unlockedPoints && !pointsBalance?.pendingPoints && !recentPointsActivity.length;
  const selectedSection = (initialSection && initialSection in sectionIdMap ? initialSection : null) as ProfileSectionKey | null;
  const status = mediaMutation.error
    ? { tone: "error" as const, message: readableError(mediaMutation.error, "Unable to update your profile photo.") }
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
  }, [selectedSection]);

  async function handleProfileUpload(file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const uploaded = await uploadMediaAsset(`profiles/client/${client?.clientReference ?? clientEmail}/${Date.now()}.${extension}`, file);
    await mediaMutation.mutateAsync({
      action: "set_viewer_photo",
      storagePath: uploaded.path,
      imageUrl: uploaded.publicUrl
    });
  }

  async function handleProfileRemove() {
    await mediaMutation.mutateAsync({ action: "remove_viewer_photo" });
  }

  return (
    <div className="space-y-4" data-testid="client-profile-screen">
      {status ? <FeedbackBanner tone={status.tone} message={status.message} /> : null}
      {pointsBalanceQuery.error ? <FeedbackBanner tone="error" message="Rewards are unavailable right now. The rest of your profile is still ready." /> : null}
      {membershipQuery.error ? <FeedbackBanner tone="error" message="Membership status could not be loaded right now." /> : null}

      <ClientSectionBlock
        eyebrow="Profile"
        title={clientName}
        subtitle="Profile is where personal setup, wallet controls, rewards, referrals, and support all stay in one clean client surface."
      >
        <div className="grid gap-4 lg:grid-cols-[0.94fr_1.06fr]">
          <div className="space-y-4">
            <div className="rounded-[28px] border border-[#7CFF00]/18 bg-[linear-gradient(180deg,rgba(124,255,0,0.14),rgba(9,9,9,0.98))] p-5">
              <div className="flex items-center gap-4">
                {clientPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={clientPhotoUrl}
                    alt={clientName}
                    className="h-16 w-16 rounded-[22px] border border-white/10 object-cover shadow-[0_18px_34px_rgba(0,0,0,0.18)]"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/10 bg-black/15 text-2xl font-semibold text-black shadow-[0_18px_34px_rgba(0,0,0,0.18)]">
                    {initialsForName(clientName)}
                  </div>
                )}
                <div>
                  <p className="surface-label text-[#d7ffab]">Client account</p>
                  <p className="mt-2 text-xl font-semibold text-white">{clientName}</p>
                  <p className="mt-1 text-sm text-white/68">{clientEmail}</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                  <p className="surface-label">Phone</p>
                  <p className="mt-3 text-sm text-white/78">{clientPhone}</p>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                  <p className="surface-label">Default payment method</p>
                  <p className="mt-3 text-sm text-white/78">{defaultPaymentMethod?.label ?? "No default card saved"}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em] text-white/58">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-white/78">
                  {pointsBalance?.unlockedPoints ?? 0} BVR Points
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-white/78">
                  {paymentMethods.length} saved payment method{paymentMethods.length === 1 ? "" : "s"}
                </span>
                <span className="rounded-full border border-[#d7ffab]/16 bg-[#d7ffab]/10 px-3 py-2 text-[#e8ffc2]">
                  {activeMembership ? activeMembership.subscriptionStatus.replaceAll("_", " ") : "No membership"}
                </span>
              </div>
            </div>

            {isSignedInClient ? (
              <ProfilePhotoManagerCard
                title="Profile photo"
                subtitle="Your account photo stays private to your signed-in experience and trusted identity surfaces."
                imageUrl={clientPhotoUrl}
                fallbackLabel={initialsForName(clientName)}
                uploadLabel="Upload photo"
                onUpload={handleProfileUpload}
                onRemove={handleProfileRemove}
                isBusy={mediaMutation.isPending}
              />
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
              <p className="surface-label">Quick profile sections</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="#profile-preferences" className="rounded-full border border-white/10 bg-black/25 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7CFF00]/20 hover:text-[#d7ffab]">
                  Preferences
                </Link>
                <Link href="#profile-wallet" className="rounded-full border border-white/10 bg-black/25 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7CFF00]/20 hover:text-[#d7ffab]">
                  Wallet
                </Link>
                <Link href="#profile-rewards" className="rounded-full border border-white/10 bg-black/25 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7CFF00]/20 hover:text-[#d7ffab]">
                  Rewards
                </Link>
                <Link href="#profile-referrals" className="rounded-full border border-white/10 bg-black/25 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7CFF00]/20 hover:text-[#d7ffab]">
                  Referrals
                </Link>
                <Link href="#profile-settings" className="rounded-full border border-white/10 bg-black/25 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/74 transition hover:border-[#7CFF00]/20 hover:text-[#d7ffab]">
                  Settings
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="inline-flex items-center gap-2 text-sm text-white/78"><Heart className="h-4 w-4 text-[#baff69]" />Preferred barber</div>
                <p className="mt-3 text-lg font-semibold text-white">{favoriteBarber?.barber.name ?? "Choose a favorite"}</p>
                <p className="mt-2 text-sm text-white/58">
                  {favoriteBarber?.profile.specialties?.slice(0, 2).join(" | ")
                    ?? "Your go-to barber will show up here after you book and save one."}
                </p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="inline-flex items-center gap-2 text-sm text-white/78"><BellRing className="h-4 w-4 text-[#d7ffab]" />Notifications</div>
                <p className="mt-3 text-lg font-semibold text-white">{notificationLabel}</p>
                <p className="mt-2 text-sm text-white/58">
                  {notificationPreference
                    ? `In-app ${notificationPreference.inAppEnabled ? "on" : "off"} | Email ${notificationPreference.emailEnabled ? "on" : "off"}`
                    : "Booking reminders stay ready here when they exist."}
                </p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="inline-flex items-center gap-2 text-sm text-white/78"><MapPinned className="h-4 w-4 text-[#baff69]" />Preferred location</div>
                <p className="mt-3 text-lg font-semibold text-white">{primaryShop?.name ?? "Choose a shop"}</p>
                <p className="mt-2 text-sm text-white/58">
                  {primaryShop ? `${primaryShop.neighborhood} | ${primaryShop.city}` : "Discovery and booking will center on your preferred shop when it exists."}
                </p>
              </div>
              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="inline-flex items-center gap-2 text-sm text-white/78"><Repeat2 className="h-4 w-4 text-[#d7ffab]" />Standing routine</div>
                <p className="mt-3 text-lg font-semibold text-white">{routineLabel}</p>
                <p className="mt-2 text-sm text-white/58">
                  {routineTiming ? `Next comeback window ${routineTiming}.` : "Save a cadence in Activity if you want your next appointment rhythm to stay visible."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Preferences"
        title="Preferred setup"
        subtitle="This is where favorite barbers, preferred location, and repeat habits live."
      >
        <div id="profile-preferences" className="grid scroll-mt-6 gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78"><Heart className="h-4 w-4 text-[#d7ffab]" />Preferred barbers</div>
            <p className="mt-3 text-lg font-semibold text-white">{favoriteBarber?.barber.name ?? "No preferred barber yet"}</p>
            <p className="mt-2 text-sm text-white/58">{favoriteBarber?.profile.headline ?? "Use Search and barber profiles to keep trusted talent one tap away."}</p>
            {/* Canonical client profile currently stores one favorite barber reference. Expand to a top-three preference set only after the schema supports it safely. */}
            <div className="mt-4">
              <ClientActionLink href={CLIENT_PRIMARY_TAB_HREFS.search} size="md" variant="secondary">
                Find barbers
              </ClientActionLink>
            </div>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78"><MapPinned className="h-4 w-4 text-[#baff69]" />Preferred location</div>
            <p className="mt-3 text-lg font-semibold text-white">{primaryShop?.name ?? "No preferred location yet"}</p>
            <div className="mt-3 space-y-2 text-sm text-white/58">
              {preferredShops.length ? preferredShops.map((shop) => (
                <p key={shop.id}>{shop.name}</p>
              )) : <p>Your preferred shops will appear here once they are saved.</p>}
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Wallet"
        title="Wallet and payment methods"
        subtitle="Saved payment methods, defaults, and booking-linked receipts all stay grounded in canonical payment truth."
      >
        <div id="profile-wallet" className="scroll-mt-6 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[0.94fr_1.06fr]">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><WalletCards className="h-4 w-4 text-[#baff69]" />Wallet summary</div>
              <p className="mt-3 text-lg font-semibold text-white">
                {paymentMethods.length
                  ? `${paymentMethods.length} saved payment method${paymentMethods.length === 1 ? "" : "s"}`
                  : "No saved payment methods yet"}
              </p>
              <p className="mt-2 text-sm text-white/58">
                {defaultPaymentMethod
                  ? `${defaultPaymentMethod.label} is your current default for booking payments.`
                  : "Add a saved card so booking and rebooking stay fast."}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <ClientActionLink href={CLIENT_PRIMARY_TAB_HREFS.activity} size="md" variant="secondary">
                  Receipts and history
                </ClientActionLink>
                <ClientActionLink href={CLIENT_PRIMARY_TAB_HREFS.activity} size="md" variant="outline">
                  Upcoming bookings
                </ClientActionLink>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><CreditCard className="h-4 w-4 text-[#d7ffab]" />Default payment method</div>
              <p className="mt-3 text-lg font-semibold text-white">{defaultPaymentMethod?.label ?? "No default card saved"}</p>
              <p className="mt-2 text-sm text-white/58">
                {defaultPaymentMethod
                  ? "This method is reused when the live booking flow asks for payment."
                  : "Add a card below to make booking payments smoother."}
              </p>
            </div>
          </div>

          <ClientPaymentMethodsPanel initialMethods={paymentMethods} isSignedInClient={isSignedInClient} />
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Rewards"
        title="BVR Points and membership"
        subtitle="Full reward balance, recent ledger movement, and membership posture all live here instead of on Home."
      >
        <div id="profile-rewards" className="scroll-mt-6 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
            <div className="rounded-[24px] border border-[#a8ff47]/16 bg-[linear-gradient(180deg,rgba(124,255,0,0.12),rgba(8,8,8,0.98))] p-5">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><Gift className="h-4 w-4 text-[#d7ffab]" />BVR Points</div>
              <p className="mt-3 text-3xl font-semibold text-white" data-display="true">{pointsBalance?.unlockedPoints ?? 0} pts</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">In-app value</p>
                  <p className="mt-3 text-lg font-semibold text-white">{currency(pointsBalance?.inAppValue ?? 0)}</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Pending</p>
                  <p className="mt-3 text-lg font-semibold text-white">{pointsBalance?.pendingPoints ?? 0} pts</p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                  <p className="surface-label">Progress</p>
                  <p className="mt-3 text-lg font-semibold text-white">{pointsBalance?.explanation.progressLabel ?? "No milestone yet"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><ShieldCheck className="h-4 w-4 text-[#baff69]" />Membership</div>
              <p className="mt-3 text-lg font-semibold text-white">
                {activeMembership ? activeMembership.planName : "No active membership"}
              </p>
              <p className="mt-2 text-sm text-white/58">
                {membershipValue?.valueMessage ?? "Membership status and benefits appear here when a live subscription exists."}
              </p>
              {membershipValue?.perkLabels?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {membershipValue.perkLabels.map((perk) => (
                    <span key={perk} className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-white/74">
                      {perk}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78"><Link2 className="h-4 w-4 text-[#d7ffab]" />Rewards activity</div>
            <div className="mt-4 space-y-3">
              {rewardsEmpty ? (
                <div className="rounded-[20px] border border-dashed border-white/10 bg-black/18 px-4 py-4 text-sm leading-7 text-white/58">
                  No rewards or membership history yet. Completed paid services, qualified referrals, and live subscriptions will show up here when they exist.
                </div>
              ) : (
                recentPointsActivity.map((item) => (
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
                    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-white/42">{formatOccurredAt(item.occurredAt) ?? "Recently"}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Referrals"
        title="Referral boost and invite status"
        subtitle="Referral sharing, conversion progress, and earned rewards belong in Profile, not Search."
      >
        <div id="profile-referrals" className="scroll-mt-6">
          <ReferralsWorkspace />
        </div>
      </ClientSectionBlock>

      <ClientSectionBlock
        eyebrow="Settings"
        title="Settings and support"
        subtitle="Account controls, notifications, and help links stay together in one predictable place."
      >
        <div id="profile-settings" className="grid scroll-mt-6 gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78"><Settings2 className="h-4 w-4 text-[#d7ffab]" />Settings</div>
            <p className="mt-3 text-lg font-semibold text-white">Account and notification controls</p>
            <p className="mt-2 text-sm text-white/58">Manage session safety, notification behavior, and account preferences.</p>
            <div className="mt-4">
              <Link href="/settings" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
                Open settings
              </Link>
            </div>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78"><LifeBuoy className="h-4 w-4 text-[#baff69]" />Support</div>
            <p className="mt-3 text-lg font-semibold text-white">Need help with a booking or payment?</p>
            <p className="mt-2 text-sm text-white/58">Use the message rail for booking issues or jump into Activity when a receipt or appointment needs attention.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/messages" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
                Messages
              </Link>
              <Link href={CLIENT_PRIMARY_TAB_HREFS.activity} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
                Activity
              </Link>
            </div>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="inline-flex items-center gap-2 text-sm text-white/78"><BellRing className="h-4 w-4 text-[#d7ffab]" />Communication</div>
            <p className="mt-3 text-lg font-semibold text-white">Stay in the loop without clutter</p>
            <p className="mt-2 text-sm text-white/58">Reminder settings, communication preferences, and support follow-up stay organized here.</p>
          </div>
        </div>
      </ClientSectionBlock>
    </div>
  );
}
