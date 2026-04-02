"use client";

import { BellRing, Building2, MessageSquareText, ShieldCheck, UserRound, WalletCards } from "lucide-react";
import { GalleryManagerCard, ProfilePhotoManagerCard } from "@/components/profile/profile-media-manager";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { demoBarbers, demoLocations, permissionMatrix } from "@/lib/data/demo";
import { useBarberFintechReadinessQuery } from "@/lib/fintech/client";
import { useMutateProfileMediaMutation, useProfileMediaWorkspaceQuery } from "@/lib/profile/client";
import { uploadMediaAsset } from "@/lib/storage/media";
import { useBarberTrustSummary } from "@/lib/trust/client";
import type { UserAccount } from "@/types/domain";

function getRoleProfileCopy(user: UserAccount) {
  switch (user.role) {
    case "owner":
      return "Owner profile keeps identity, permissions, location scope, and protected controls close without turning this into a settings maze.";
    case "manager":
      return "Manager profile keeps shift visibility, communications, and operational permissions readable at a glance.";
    case "front_desk":
      return "Front desk profile keeps queue access, guest communication, and shop coverage visible in one clean layer.";
    case "commission_barber":
      return "Commission barber profile keeps chair identity, payout model, and guest-facing trust signals close together.";
    case "booth_rent_barber":
      return "Booth-rent profile keeps independent chair identity, payout posture, and public-facing shop presence visible together.";
    default:
      return "Profile workspace";
  }
}

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

export function StaffProfileWorkspace({ user }: { user: UserAccount; }) {
  const mediaQuery = useProfileMediaWorkspaceQuery(true);
  const mediaMutation = useMutateProfileMediaMutation();
  const visibleLocations = demoLocations.filter((location) => user.locationIds.includes(location.id));
  const permissions = permissionMatrix.find((group) => group.role === user.role);
  const barber = user.barberId ? demoBarbers.find((entry) => entry.id === user.barberId) : undefined;
  const trustQuery = useBarberTrustSummary(Boolean(barber));
  const fintechQuery = useBarberFintechReadinessQuery(Boolean(barber));
  const verificationDecision = trustQuery.data?.verificationDecision;
  const badgeGate = verificationDecision?.gates.badge;
  const payoutGate = verificationDecision?.gates.payout;
  const badgeBlocker = badgeGate && !badgeGate.allowed ? badgeGate.reasons[0] : null;
  const payoutBlocker = payoutGate && !payoutGate.allowed ? payoutGate.reasons[0] : null;
  const verificationHealthy = Boolean(
    verificationDecision?.canonicalOverallStatus === "approved" && (!badgeGate || badgeGate.allowed)
  );
  const viewerPhotoUrl = mediaQuery.data?.viewer.profilePhotoUrl;
  const notificationPreference = mediaQuery.data?.viewer.notificationPreference;
  const barberMedia = mediaQuery.data?.barberProfile ?? null;
  const shops = mediaQuery.data?.shops ?? [];
  const enabledCommunicationCount = [
    notificationPreference?.inAppEnabled,
    notificationPreference?.emailEnabled,
    notificationPreference?.smsEnabled,
    notificationPreference?.pushEnabled
  ].filter(Boolean).length;
  const status = mediaMutation.error
    ? { tone: "error" as const, message: readableError(mediaMutation.error, "Unable to update profile media right now.") }
    : null;

  async function uploadWithPath(path: string, file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    return uploadMediaAsset(`${path}/${Date.now()}.${extension}`, file);
  }

  async function handleViewerPhotoUpload(file: File) {
    const uploaded = await uploadWithPath(`profiles/staff/${toStorageSafeSegment(user.email)}/profile`, file);
    await mediaMutation.mutateAsync({
      action: "set_viewer_photo",
      storagePath: uploaded.path,
      imageUrl: uploaded.publicUrl
    });
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

  async function handleShopPhotoUpload(shopId: string, file: File) {
    const uploaded = await uploadWithPath(`profiles/shops/${shopId}/profile`, file);
    await mediaMutation.mutateAsync({
      action: "set_shop_photo",
      shopId,
      storagePath: uploaded.path,
      imageUrl: uploaded.publicUrl
    });
  }

  async function handleShopGalleryUpload(shopId: string, file: File, options: { caption: string; featured: boolean }) {
    const uploaded = await uploadWithPath(`profiles/shops/${shopId}/gallery`, file);
    await mediaMutation.mutateAsync({
      action: "add_shop_gallery_image",
      shopId,
      storagePath: uploaded.path,
      imageUrl: uploaded.publicUrl,
      caption: options.caption,
      featured: options.featured
    });
  }

  async function handleNotificationToggle(
    field: "inAppEnabled" | "smsEnabled" | "emailEnabled" | "pushEnabled",
    value: boolean
  ) {
    await mediaMutation.mutateAsync({
      action: "update_viewer_notification_preference",
      inAppEnabled: field === "inAppEnabled" ? value : notificationPreference?.inAppEnabled ?? true,
      smsEnabled: field === "smsEnabled" ? value : notificationPreference?.smsEnabled ?? false,
      emailEnabled: field === "emailEnabled" ? value : notificationPreference?.emailEnabled ?? true,
      pushEnabled: field === "pushEnabled" ? value : notificationPreference?.pushEnabled ?? true
    });
  }

  return (
    <div className="space-y-4" data-testid="staff-profile-workspace">
      {status ? <FeedbackBanner tone={status.tone} message={status.message} /> : null}

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[32px] p-6">
          <div className="flex flex-wrap items-center gap-4">
            {viewerPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewerPhotoUrl}
                alt={user.name}
                className="h-20 w-20 rounded-[26px] border border-white/10 object-cover shadow-[0_18px_36px_rgba(124,255,0,0.12)]"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-[26px] border border-[#7CFF00]/20 bg-[linear-gradient(135deg,rgba(124,255,0,0.18),rgba(15,15,15,0.96))] text-2xl font-semibold tracking-[0.18em] text-[#d7ffab] shadow-[0_18px_36px_rgba(124,255,0,0.12)]">
                {initialsForName(user.name)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="surface-label">Profile workspace</p>
              <h3 className="mt-3 text-3xl font-semibold sm:text-5xl" data-display="true">{user.name}</h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-white/62">{getRoleProfileCopy(user)}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><UserRound className="h-4 w-4 text-[#baff69]" />Role and title</div>
              <p className="mt-3 text-lg font-semibold text-white">{user.title}</p>
              <p className="mt-2 text-sm text-white/58">{user.email}</p>
            </div>
            <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="inline-flex items-center gap-2 text-sm text-white/78"><Building2 className="h-4 w-4 text-[#d7ffab]" />Location scope</div>
              <p className="mt-3 text-lg font-semibold text-white">{visibleLocations.map((location) => location.name).join(" | ") || "No assigned locations"}</p>
              <p className="mt-2 text-sm text-white/58">Assigned footprint and default operating territory.</p>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          {barber ? (
            <Card className="rounded-[32px] p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Account health</p>
                  <p className="mt-3 text-lg font-semibold">
                    {verificationHealthy ? "Verified barber account" : "Verification still needs action"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/60">
                    {badgeBlocker ?? payoutBlocker ?? "Keep identity, payout posture, and guest communication confidence visible in one calm place."}
                  </p>
                </div>
                <ShieldCheck className="h-5 w-5 text-[#baff69]" />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-4">
                  <p className="surface-label">Verified</p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {badgeGate?.allowed ? "Yes" : "Blocked"}
                  </p>
                  <p className="mt-2 text-sm text-white/58">
                    {badgeGate?.allowed
                      ? `Trust score ${trustQuery.data?.trustScore ?? 0} | Progress ${trustQuery.data?.verificationProgress ?? 0}%`
                      : "Guest-facing trust badges are hidden until this verification lane clears."}
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/8 bg-black/18 p-4">
                  <p className="surface-label">Payout health</p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {fintechQuery.data?.connectedAccount.operationalStatus.replaceAll("_", " ") ?? "Loading"}
                  </p>
                  <p className="mt-2 text-sm text-white/58">
                    {payoutBlocker ?? `${fintechQuery.data?.routingSummary.blockedPaymentsCount ?? 0} payout blocker${(fintechQuery.data?.routingSummary.blockedPaymentsCount ?? 0) === 1 ? "" : "s"}`}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="status-pill text-[#d7ffab]">
                  {badgeGate?.allowed ? trustQuery.data?.publicBadgePreview?.[0] ?? "Verification visible" : "Verification restricted"}
                </span>
                <span className="status-pill text-white/72">
                  {enabledCommunicationCount} channels enabled
                </span>
                {fintechQuery.data?.connectedAccount.payoutsEnabled && payoutGate?.allowed ? (
                  <span className="status-pill text-white/72">Payout ready</span>
                ) : null}
              </div>
            </Card>
          ) : null}

          <Card className="rounded-[32px] p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="surface-label">Communications</p>
                <p className="mt-3 text-lg font-semibold">Channel controls</p>
                <p className="mt-2 text-sm leading-6 text-white/60">Messaging alerts, reminders, and operational updates stay grounded in the existing notification preference system.</p>
              </div>
              <BellRing className="h-5 w-5 text-[#baff69]" />
            </div>

            <div className="mt-4 grid gap-3">
              {[
                { key: "inAppEnabled", label: "In-app messaging", icon: MessageSquareText },
                { key: "emailEnabled", label: "Email alerts", icon: BellRing },
                { key: "smsEnabled", label: "SMS updates", icon: BellRing },
                { key: "pushEnabled", label: "Push notifications", icon: BellRing }
              ].map((item) => {
                const Icon = item.icon;
                const checked = notificationPreference?.[item.key as keyof NonNullable<typeof notificationPreference>] ?? false;
                return (
                  <label key={item.key} className="flex items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-black/20 px-4 py-3 text-sm text-white/72">
                    <span className="inline-flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[#baff69]" />
                      {item.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked as boolean}
                      disabled={mediaMutation.isPending}
                      onChange={(event) => void handleNotificationToggle(item.key as "inAppEnabled" | "smsEnabled" | "emailEnabled" | "pushEnabled", event.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-black"
                    />
                  </label>
                );
              })}
            </div>
          </Card>
          <Card className="rounded-[32px] p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="surface-label">Permissions</p>
                <p className="mt-3 text-lg font-semibold">{permissions?.allows.length ?? 0} active capabilities</p>
                <p className="mt-2 text-sm leading-6 text-white/60">Role boundaries remain visible so staff always know what sits inside this workspace.</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-[#baff69]" />
            </div>
          </Card>
          {barber ? (
            <Card className="rounded-[32px] p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="surface-label">Payout posture</p>
                  <p className="mt-3 text-lg font-semibold">{barber.compensationModel === "booth_rent" ? "Independent chair revenue" : "Commission split visibility"}</p>
                  <p className="mt-2 text-sm leading-6 text-white/60">Barber-facing revenue settings stay readable without leaking owner-only financial configuration.</p>
                </div>
                <WalletCards className="h-5 w-5 text-[#baff69]" />
              </div>

              <div className="mt-4 rounded-[20px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Role posture</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={`status-pill ${barber.compensationModel === "commission" ? "text-[#d7ffab]" : "text-white/72"}`}>Commission</span>
                  <span className={`status-pill ${barber.compensationModel === "booth_rent" ? "text-[#d7ffab]" : "text-white/72"}`}>Booth rent</span>
                  <span className="status-pill text-white/52">Freelance</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/58">
                  Compensation posture changes stay protected because they affect payout routing. Cooldown remains seven days after an approved change.
                </p>
              </div>

              <div className="mt-4 rounded-[20px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Location logic</p>
                <p className="mt-3 text-sm leading-6 text-white/62">
                  {barber.compensationModel === "commission" || barber.compensationModel === "booth_rent"
                    ? "This barber operates from shop-based chair territory. Location assignment stays attached to the active shop scope."
                    : "Freelance territory can be edited when the payout posture allows independent location control."}
                </p>
              </div>
            </Card>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <ProfilePhotoManagerCard
          title="Identity photo"
          subtitle="This image anchors the signed-in staff profile and trusted communication surfaces without turning this into a separate settings stack."
          imageUrl={viewerPhotoUrl}
          fallbackLabel={initialsForName(user.name)}
          uploadLabel="Upload photo"
          onUpload={handleViewerPhotoUpload}
          onRemove={async () => {
            await mediaMutation.mutateAsync({ action: "remove_viewer_photo" });
          }}
          isBusy={mediaMutation.isPending}
        />

        {barberMedia ? (
          <ProfilePhotoManagerCard
            title="Public barber profile photo"
            subtitle="This is the photo clients see first on the barber marketplace profile and booking entry points."
            imageUrl={barberMedia.profilePhotoUrl}
            fallbackLabel={initialsForName(user.name)}
            uploadLabel="Update barber photo"
            onUpload={handleBarberPhotoUpload}
            onRemove={async () => {
              await mediaMutation.mutateAsync({ action: "remove_barber_photo" });
            }}
            isBusy={mediaMutation.isPending}
          />
        ) : (
          <Card className="rounded-[28px] border border-white/8 bg-black/20 p-5">
            <p className="surface-label">Public profile media</p>
            <p className="mt-3 text-sm leading-7 text-white/58">
              Barber image controls appear here for barber accounts. Shop-facing roles can manage shop media below without leaving the existing profile workspace.
            </p>
          </Card>
        )}
      </section>

      {barberMedia ? (
        <GalleryManagerCard
          title="Haircut gallery"
          subtitle="Before-and-after work, featured cuts, and real portfolio proof stay on the existing barber portfolio layer."
          assets={barberMedia.gallery}
          uploadLabel="Add haircut image"
          emptyCopy="No haircut gallery images yet. Upload real work here so the public barber profile feels trustworthy and current."
          onUpload={handleBarberGalleryUpload}
          onRemove={async (assetId) => {
            await mediaMutation.mutateAsync({
              action: "remove_barber_gallery_image",
              assetId
            });
          }}
          isBusy={mediaMutation.isPending}
        />
      ) : null}

      {shops.length ? (
        <section className="space-y-4">
          {shops.map((shop) => (
            <div key={shop.shopId} className="grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
              <ProfilePhotoManagerCard
                title={`${shop.label} photo`}
                subtitle="The shop image appears alongside public profile and discovery surfaces without creating a second shop model."
                imageUrl={shop.profilePhotoUrl}
                fallbackLabel={shop.label.slice(0, 2).toUpperCase()}
                uploadLabel="Upload shop photo"
                onUpload={(file) => handleShopPhotoUpload(shop.shopId, file)}
                onRemove={async () => {
                  await mediaMutation.mutateAsync({
                    action: "remove_shop_photo",
                    shopId: shop.shopId
                  });
                }}
                isBusy={mediaMutation.isPending}
              />
              <GalleryManagerCard
                title={`${shop.label} gallery`}
                subtitle="Use the shop gallery for interior, atmosphere, and social-proof imagery on public-facing surfaces."
                assets={shop.gallery}
                uploadLabel="Add shop image"
                emptyCopy="No shop gallery images yet. Upload a few real space images so the public experience feels trustworthy."
                onUpload={(file, options) => handleShopGalleryUpload(shop.shopId, file, options)}
                onRemove={async (assetId) => {
                  await mediaMutation.mutateAsync({
                    action: "remove_shop_gallery_image",
                    shopId: shop.shopId,
                    assetId
                  });
                }}
                isBusy={mediaMutation.isPending}
              />
            </div>
          ))}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[32px] p-6">
          <p className="surface-label">Allowed</p>
          <div className="mt-4 space-y-3">
            {(permissions?.allows ?? []).map((item) => (
              <div key={item} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-3 text-sm text-white/72">{item}</div>
            ))}
          </div>
        </Card>

        <Card className="rounded-[32px] p-6">
          <p className="surface-label">Restricted</p>
          <div className="mt-4 space-y-3">
            {(permissions?.restricted.length ? permissions.restricted : ["No additional restrictions recorded."]).map((item) => (
              <div key={item} className="rounded-[22px] border border-white/8 bg-black/20 px-4 py-3 text-sm text-white/72">{item}</div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
