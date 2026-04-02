"use client";

import Link from "next/link";
import { BellRing, Heart, MapPinned, Repeat2, UserRound } from "lucide-react";
import { ClientPaymentMethodsPanel } from "@/components/client-experience/client-payment-methods-panel";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { ProfilePhotoManagerCard } from "@/components/profile/profile-media-manager";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import type { ClientProfilePayload } from "@/lib/booking/platform-service";
import { usePointsBalanceQuery } from "@/lib/points/client";
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
  isSignedInClient
}: {
  payload: ClientProfilePayload;
  isSignedInClient: boolean;
}) {
  const mediaQuery = useProfileMediaWorkspaceQuery(isSignedInClient);
  const mediaMutation = useMutateProfileMediaMutation();
  const client = payload.client;
  const favoriteBarber = payload.favoriteBarber;
  const preferredShops = payload.preferredShops;
  const notificationPreference = payload.notificationPreference;
  const routine = payload.routine;
  const primaryShop = preferredShops[0];
  const paymentMethods = payload.paymentMethods;
  const clientName = client?.fullName ?? (isSignedInClient ? "Client" : "Client profile preview");
  const clientEmail = client?.email ?? "No email on file yet";
  const clientPhone = client?.phone ?? "No phone on file yet";
  const pointsBalanceQuery = usePointsBalanceQuery(isSignedInClient);
  const pointsBalance = pointsBalanceQuery.data;
  const routineLabel = routine ? `${routine.label} with ${favoriteBarber?.barber.name ?? "your barber"}` : "No auto-book cadence yet";
  const routineTiming = formatRoutineDate(routine?.nextSuggestedAt);
  const notificationLabel = notificationPreference
    ? notificationPreference.smsEnabled
      ? "SMS reminders on"
      : "In-app reminders on"
    : "Reminders ready";
  const clientPhotoUrl = mediaQuery.data?.viewer.profilePhotoUrl;
  const status = mediaMutation.error
    ? { tone: "error" as const, message: readableError(mediaMutation.error, "Unable to update your profile photo.") }
    : null;

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

      <ClientSectionBlock
        eyebrow="Profile"
        title={clientName}
        subtitle="Account basics, saved preferences, favorite barber context, and your standing routine all stay client-friendly here."
      >
        <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
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
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="surface-label">BVR Points</p>
                      <p className="mt-3 text-sm text-white/78">
                        {pointsBalance ? `${pointsBalance.unlockedPoints} pts • ${currency(pointsBalance.inAppValue)} value` : "Rewards ready"}
                      </p>
                    </div>
                    <Link href="/activity" className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d7ffab] transition hover:text-[#efffd4]">
                      Rewards
                    </Link>
                  </div>
                </div>
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

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><UserRound className="h-4 w-4 text-[#baff69]" />Preferred barber</div>
              <p className="mt-3 text-lg font-semibold text-white">{favoriteBarber?.barber.name ?? "Choose a favorite"}</p>
              <p className="mt-2 text-sm text-white/58">{favoriteBarber?.profile.specialties.slice(0, 2).join(" | ") ?? "Your go-to barber will show up here."}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><BellRing className="h-4 w-4 text-[#d7ffab]" />Notifications</div>
              <p className="mt-3 text-lg font-semibold text-white">{notificationLabel}</p>
              <p className="mt-2 text-sm text-white/58">
                {notificationPreference
                  ? `In-app ${notificationPreference.inAppEnabled ? "on" : "off"} | Email ${notificationPreference.emailEnabled ? "on" : "off"}`
                  : "Booking reminders and comeback prompts stay ready to keep your routine moving."}
              </p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><MapPinned className="h-4 w-4 text-[#baff69]" />Preferred location</div>
              <p className="mt-3 text-lg font-semibold text-white">{primaryShop?.name ?? "Choose a shop"}</p>
              <p className="mt-2 text-sm text-white/58">{primaryShop ? `${primaryShop.neighborhood} | ${primaryShop.city}` : "Keep discovery and booking centered on the shop you trust most."}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><Repeat2 className="h-4 w-4 text-[#d7ffab]" />Standing routine</div>
              <p className="mt-3 text-lg font-semibold text-white">{routineLabel}</p>
              <p className="mt-2 text-sm text-white/58">{routineTiming ? `Next comeback window ${routineTiming}.` : "Save an auto-book cadence in Bookings so your routine stays easy to keep."}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 sm:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 text-sm text-white/78"><UserRound className="h-4 w-4 text-[#baff69]" />BVR Points</div>
                  <p className="mt-3 text-lg font-semibold text-white">
                    {pointsBalance ? `${pointsBalance.unlockedPoints} pts ready` : "Rewards ready"}
                  </p>
                  <p className="mt-2 text-sm text-white/58">
                    {pointsBalance
                      ? `${currency(pointsBalance.inAppValue)} in booking value. ${pointsBalance.explanation.progressLabel}`
                      : "Open Rewards to see your balance, milestone progress, and point activity."}
                  </p>
                </div>
                <Link href="/activity" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
                  Open rewards
                </Link>
              </div>
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <ClientSectionBlock
          eyebrow="Saved"
          title="Favorites and preferences"
          subtitle="The profile layer keeps the parts of the product that build repeat usage close at hand."
        >
          <div className="space-y-3">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><Heart className="h-4 w-4 text-[#d7ffab]" />Favorite barber</div>
              <p className="mt-3 text-lg font-semibold text-white">{favoriteBarber?.barber.name ?? "Not set yet"}</p>
              <p className="mt-2 text-sm text-white/58">{favoriteBarber?.profile.headline ?? "Use search and barber profiles to keep trusted talent one tap away."}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><MapPinned className="h-4 w-4 text-[#baff69]" />Saved shops</div>
              <div className="mt-3 space-y-2 text-sm text-white/72">
                {preferredShops.length ? preferredShops.map((shop) => (
                  <p key={shop.id}>{shop.name}</p>
                )) : <p>Your preferred shops will appear here once they are saved.</p>}
              </div>
            </div>
          </div>
        </ClientSectionBlock>

        <ClientSectionBlock
          eyebrow="Routine"
          title="Rebook without overthinking it"
          subtitle="Your profile now reflects the same standing-routine logic as Bookings, so your barber relationship stays visible in both places."
        >
          <div className="space-y-3">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><Repeat2 className="h-4 w-4 text-[#baff69]" />Auto-book</div>
              <p className="mt-3 text-lg font-semibold text-white">{routineLabel}</p>
              <p className="mt-2 text-sm leading-7 text-white/62">
                {routineTiming
                  ? `Saved cadence, next comeback window ${routineTiming}.`
                  : "Head to Bookings to save a weekly, biweekly, or monthly cadence with your barber."}
              </p>
            </div>
            <Link href="/bookings" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
              Manage bookings
            </Link>
          </div>
        </ClientSectionBlock>
      </section>

      <ClientSectionBlock
        eyebrow="Payments"
        title="Saved methods stay tokenized."
        subtitle="Client payment references now live inside the real ledger foundation, so booking, checkout, refunds, and tips can stay explainable later."
      >
        <ClientPaymentMethodsPanel initialMethods={paymentMethods} isSignedInClient={isSignedInClient} />
      </ClientSectionBlock>
    </div>
  );
}
