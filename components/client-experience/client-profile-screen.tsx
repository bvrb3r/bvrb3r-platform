"use client";

import Link from "next/link";
import { BellRing, CreditCard, Heart, MapPinned, Repeat2, Receipt, UserRound } from "lucide-react";
import { ClientPaymentMethodsPanel } from "@/components/client-experience/client-payment-methods-panel";
import { ClientSectionBlock } from "@/components/client-experience/client-section-block";
import { ProfilePhotoManagerCard } from "@/components/profile/profile-media-manager";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import type { ClientProfilePayload } from "@/lib/booking/platform-service";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import { uploadMediaAsset } from "@/lib/storage/media";

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
        subtitle="Account basics, favorite barber context, reminders, and wallet controls all stay in one clean client surface."
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
                  <p className="surface-label">Default payment method</p>
                  <p className="mt-3 text-sm text-white/78">{defaultPaymentMethod?.label ?? "No default card saved"}</p>
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
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><Heart className="h-4 w-4 text-[#baff69]" />Preferred barber</div>
              <p className="mt-3 text-lg font-semibold text-white">{favoriteBarber?.barber.name ?? "Choose a favorite"}</p>
              <p className="mt-2 text-sm text-white/58">{favoriteBarber?.profile.specialties.slice(0, 2).join(" | ") ?? "Your go-to barber will show up here after you book and save one."}</p>
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
              <p className="mt-2 text-sm text-white/58">{primaryShop ? `${primaryShop.neighborhood} | ${primaryShop.city}` : "Discovery and booking will center on your preferred shop when it exists."}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><Repeat2 className="h-4 w-4 text-[#d7ffab]" />Standing routine</div>
              <p className="mt-3 text-lg font-semibold text-white">{routineLabel}</p>
              <p className="mt-2 text-sm text-white/58">{routineTiming ? `Next comeback window ${routineTiming}.` : "Save a cadence in Bookings if you want your next appointment rhythm to stay visible."}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4 sm:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 text-sm text-white/78"><CreditCard className="h-4 w-4 text-[#baff69]" />Wallet basics</div>
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
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href="/bookings" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
                    <Receipt className="h-4 w-4" />
                    Receipts
                  </Link>
                  <Link href="/bookings" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
                    <UserRound className="h-4 w-4" />
                    Booking history
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ClientSectionBlock>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <ClientSectionBlock
          eyebrow="Saved"
          title="Favorites and preferences"
          subtitle="The profile layer keeps the real pieces of repeat usage close at hand."
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
          eyebrow="Wallet"
          title="Saved payment methods"
          subtitle="Tokenized payment references live here so booking, receipts, and future payments stay consistent."
        >
          <div className="space-y-3">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><CreditCard className="h-4 w-4 text-[#baff69]" />Default payment method</div>
              <p className="mt-3 text-lg font-semibold text-white">{defaultPaymentMethod?.label ?? "No default card saved"}</p>
              <p className="mt-2 text-sm text-white/58">
                {defaultPaymentMethod
                  ? "This method is used when a booking payment is created from the live appointment flow."
                  : "Add a card below to make booking payments smoother."}
              </p>
            </div>
            <Link href="/bookings" className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#7CFF00]/24 hover:text-[#d7ffab]">
              Open bookings and receipts
            </Link>
          </div>
        </ClientSectionBlock>
      </section>

      <ClientSectionBlock
        eyebrow="Payments"
        title="Manage saved methods"
        subtitle="Payment controls stay grounded in canonical payment truth. No raw card numbers are stored here."
      >
        <ClientPaymentMethodsPanel initialMethods={paymentMethods} isSignedInClient={isSignedInClient} />
      </ClientSectionBlock>
    </div>
  );
}
