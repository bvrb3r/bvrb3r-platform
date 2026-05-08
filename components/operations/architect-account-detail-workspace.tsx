"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Select } from "@/components/ui/select";
import { DataStatCard, GlassCard } from "@/design/components";
import {
  useArchitectAccountActionMutation,
  useArchitectBarberProfileRepairMutation,
  useArchitectAccountDetailQuery,
  useArchitectVerificationActionMutation
} from "@/lib/platform-admin/client";
import { cn } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";
import type {
  ArchitectAccountDetailPayload,
  PlatformAdminAccountStatus,
  PlatformAdminActionInput,
  PlatformAdminActionClass
} from "@/types/platform-admin";

type VerificationAction = "approve" | "reject" | "request-update" | "suspend" | "reactivate";
type ArchitectAccountDetailAccount = NonNullable<ArchitectAccountDetailPayload["account"]>;

type PendingAction =
  | {
      kind: "account";
      title: string;
      detail: string;
      confirmLabel: string;
      actionClass: PlatformAdminActionClass;
      payload: PlatformAdminActionInput;
    }
  | {
      kind: "verification";
      title: string;
      detail: string;
      confirmLabel: string;
      actionClass: PlatformAdminActionClass;
      verificationProfileId: string;
      action: VerificationAction;
    };

function formatLabel(value?: string | null) {
  if (!value) return "Not recorded";
  return value.replaceAll("_", " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not recorded";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function badgeClasses(value?: string | null) {
  const normalized = `${value ?? ""}`.toLowerCase();
  if (normalized.includes("approved") || normalized.includes("active") || normalized.includes("verified")) {
    return "border-[#7CFF00]/16 bg-[#7CFF00]/10 text-[#d7ffab]";
  }
  if (normalized.includes("pending") || normalized.includes("review") || normalized.includes("needs") || normalized.includes("submitted")) {
    return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  }
  if (normalized.includes("rejected") || normalized.includes("suspended") || normalized.includes("banned") || normalized.includes("missing") || normalized.includes("locked")) {
    return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  }
  return "border-white/10 bg-black/20 text-white/72";
}

function actionToneClasses(actionClass: PlatformAdminActionClass) {
  switch (actionClass) {
    case "critical":
      return "border-rose-400/20 bg-rose-400/10 text-rose-100";
    case "sensitive":
      return "border-amber-300/20 bg-amber-300/10 text-amber-100";
    default:
      return "border-[#7CFF00]/16 bg-[#7CFF00]/10 text-[#d7ffab]";
  }
}

function DetailMetric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <DataStatCard label={label} value={value} detail={detail} className="p-4" />
  );
}

function Field({ label, value }: { label: string; value?: string | number | boolean | null }) {
  return (
    <GlassCard className="p-4">
      <p className="surface-label">{label}</p>
      <p className="mt-3 break-words text-sm leading-6 text-white/68">{value === undefined || value === null || value === "" ? "Not recorded" : String(value)}</p>
    </GlassCard>
  );
}

function ReadinessItem({ label, complete, detail }: { label: string; complete: boolean; detail: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-black/24 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{label}</p>
        <span className={cn("status-pill", complete ? badgeClasses("approved") : badgeClasses("pending"))}>
          {complete ? "Ready" : "Blocked"}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/52">{detail}</p>
    </div>
  );
}

function accountActionClass(nextStatus: PlatformAdminAccountStatus): PlatformAdminActionClass {
  return nextStatus === "suspended" || nextStatus === "banned" ? "critical" : "sensitive";
}

function verificationActionClass(action: VerificationAction): PlatformAdminActionClass {
  return action === "approve" || action === "reactivate" ? "sensitive" : "critical";
}

function getMarketplaceStatus(account: ArchitectAccountDetailAccount) {
  if (!account.marketplaceLive) {
    return {
      label: "Not live",
      tone: "pending" as const
    };
  }

  return {
    label: "Live",
    tone: "approved" as const
  };
}

export function ArchitectAccountDetailWorkspace({
  profileId,
  initialData
}: {
  profileId: string;
  initialData: ArchitectAccountDetailPayload;
}) {
  const query = useArchitectAccountDetailQuery(profileId, initialData);
  const data = query.data ?? initialData;
  const account = data.account;
  const [selectedVerificationProfileId, setSelectedVerificationProfileId] = useState(account?.verificationProfileId ?? account?.verificationProfiles[0]?.id ?? "");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const accountActionMutation = useArchitectAccountActionMutation(profileId);
  const barberRepairMutation = useArchitectBarberProfileRepairMutation(profileId);
  const verificationActionMutation = useArchitectVerificationActionMutation(selectedVerificationProfileId || "__missing__");

  const selectedVerificationProfile = useMemo(
    () => account?.verificationProfiles.find((profile) => profile.id === selectedVerificationProfileId) ?? account?.verificationProfiles[0],
    [account?.verificationProfiles, selectedVerificationProfileId]
  );

  const queueAccountAction = (nextStatus: Exclude<PlatformAdminAccountStatus, "profile_only">) => {
    if (!account) return;
    const label = nextStatus === "active" ? "Reactivate" : nextStatus === "banned" ? "Ban" : formatLabel(nextStatus);
    setReason("");
    setInternalNotes("");
    setPendingAction({
      kind: "account",
      title: `${label} ${account.fullName}`,
      detail: "This changes account access through canonical Architect controls and records the action in the audit log.",
      confirmLabel: `${label} account`,
      actionClass: accountActionClass(nextStatus),
      payload: {
        type: "set_user_status",
        userId: account.profileId,
        nextStatus
      }
    });
  };

  const queueVerificationAction = (action: VerificationAction) => {
    if (!account || !selectedVerificationProfile) return;
    setReason("");
    setInternalNotes("");
    setPendingAction({
      kind: "verification",
      title: `${formatLabel(action)} ${account.fullName}`,
      detail: "This writes to the canonical verification profile, review history, approval state, and platform admin audit log.",
      confirmLabel: action === "request-update" ? "Request update" : `${formatLabel(action)} review`,
      actionClass: verificationActionClass(action),
      verificationProfileId: selectedVerificationProfile.id,
      action
    });
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    const trimmedReason = reason.trim();
    const trimmedInternalNotes = internalNotes.trim();

    if (!trimmedReason) {
      setFeedback({ tone: "error", message: "A reason is required for account and verification actions." });
      return;
    }

    try {
      if (pendingAction.kind === "account") {
        await accountActionMutation.mutateAsync({
          ...pendingAction.payload,
          note: trimmedReason
        });
      } else {
        await verificationActionMutation.mutateAsync({
          action: pendingAction.action,
          input: {
            reason: trimmedReason,
            internalNotes: trimmedInternalNotes || undefined
          }
        });
      }
      setFeedback({ tone: "success", message: `${pendingAction.confirmLabel} applied and written to audit history.` });
      setPendingAction(null);
      setReason("");
      setInternalNotes("");
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    }
  };

  const repairBarberProfile = async () => {
    if (!account) return;
    try {
      const result = await barberRepairMutation.mutateAsync();
      const checks = Object.entries(result.repair.readChecks)
        .map(([key, value]) => `${key}: ${value ? "yes" : "no"}`)
        .join(", ");
      setFeedback({ tone: "success", message: `${result.repair.message} Final read checks: ${checks}` });
    } catch (error) {
      setFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    }
  };

  if (!account) {
    return (
      <div className="app-screen safe-top-pad px-2 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] sm:px-3 sm:py-3 lg:px-5 lg:py-5">
        <div className="mx-auto max-w-4xl space-y-4">
          <Card className="rounded-[34px] p-6">
            <p className="surface-label">Account unavailable</p>
            <h1 className="mt-3 text-3xl font-semibold text-white" data-display="true">No real account found</h1>
            <p className="mt-4 text-sm leading-7 text-white/62">
              Architect searched live profile data for this account id and found no matching production profile.
            </p>
            <div className="mt-5">
              <Link href="/architect/users">
                <Button type="button" variant="secondary">Back to users</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const isPlatformAdmin = account.role === "platform_admin";
  const canManageAccountAccess = !isPlatformAdmin && account.profileExists;
  const canUseVerificationActions = Boolean(selectedVerificationProfile);
  const marketplaceStatus = getMarketplaceStatus(account);
  const marketplaceFacts = account.marketplaceFacts;
  const marketplaceFactLocation = marketplaceFacts
    ? [
        marketplaceFacts.address,
        [marketplaceFacts.city, marketplaceFacts.state].filter(Boolean).join(", ")
      ].filter(Boolean).join(", ")
    : "";
  const marketplaceSearchTerms = account.searchableTerms?.length
    ? account.searchableTerms.join(", ")
    : undefined;
  const readinessItems = account.barber
    ? [
        { label: "Approval", complete: account.approvalStatus === "approved", detail: `Approval: ${formatLabel(account.approvalStatus)}` },
        { label: "Services", complete: account.barber.servicesCount > 0, detail: `${account.barber.servicesCount} active service${account.barber.servicesCount === 1 ? "" : "s"}` },
        {
          label: "Availability",
          complete: account.barber.availabilityRulesCount + account.barber.workingHoursCount > 0,
          detail: `${account.barber.availabilityRulesCount} availability rules, ${account.barber.workingHoursCount} working-hour rows`
        },
        {
          label: "Location / shop",
          complete: account.barber.linkedShopIds.length > 0 || (account.barber.serviceLocationLabels?.length ?? 0) > 0,
          detail: account.barber.serviceLocationLabels?.length
            ? account.barber.serviceLocationLabels.join(" | ")
            : account.barber.linkedShopIds.length
              ? account.barber.linkedShopIds.join(", ")
              : "No service location or shop connection detected"
        },
        { label: "Visibility", complete: account.barber.visibilityState === "public" || account.barber.visibilityState === "featured", detail: `Visibility: ${formatLabel(account.barber.visibilityState)}` },
        { label: "Booking active", complete: account.barber.acceptingBookings === true || account.barber.acceptsInstantBookings === true, detail: `Status: ${formatLabel(account.barber.status)}` },
        { label: "Payout ready", complete: selectedVerificationProfile?.canReceivePayouts === true, detail: `Verification payout lane: ${selectedVerificationProfile?.canReceivePayouts ? "ready" : "not ready"}` },
        { label: "Marketplace", complete: account.marketplaceLive, detail: account.marketplaceBlockers.length ? account.marketplaceBlockers.join(" | ") : "Marketplace visible from account data" },
        { label: "Client home", complete: account.clientHomeIncluded ?? account.marketplaceLive, detail: account.clientHomeIncluded ?? account.marketplaceLive ? "Included in client home supply" : "Not included in client home" },
        { label: "Client search", complete: account.clientSearchIncluded ?? account.searchIncluded, detail: account.clientSearchIncluded ?? account.searchIncluded ? "Included in client search" : "Not included in client search" },
        { label: "Direct search Phillip", complete: account.directSearchMatch ?? account.searchIncluded, detail: account.directSearchMatch ?? account.searchIncluded ? "Phillip direct search matches canonical terms" : "Phillip direct search excluded by blockers or terms" },
        { label: "Feed content", complete: account.feedEligible, detail: account.feedAssetCount > 0 ? `${account.feedAssetCount} public feed asset${account.feedAssetCount === 1 ? "" : "s"}` : "No public feed content yet" }
      ]
    : account.shopOwner?.shopExists
      ? [
          { label: "Approval", complete: account.approvalStatus === "approved", detail: `Approval: ${formatLabel(account.approvalStatus)}` },
          { label: "Shop info", complete: Boolean(account.shopOwner.name && account.shopOwner.phone), detail: `${account.shopOwner.name ?? "No name"}${account.shopOwner.phone ? " with phone" : " without phone"}` },
          {
            label: "Location",
            complete: Boolean(account.shopOwner.city && account.shopOwner.state && account.shopOwner.address),
            detail: [account.shopOwner.address, account.shopOwner.city, account.shopOwner.state].filter(Boolean).join(", ") || "Missing address/city/state"
          },
          { label: "Team", complete: account.shopOwner.activeLinkedBarbers > 0, detail: `${account.shopOwner.activeLinkedBarbers} linked barber${account.shopOwner.activeLinkedBarbers === 1 ? "" : "s"}` },
          { label: "Booking active", complete: account.shopOwner.shopStatus === "active", detail: `Shop status: ${formatLabel(account.shopOwner.shopStatus)}` },
          { label: "Payout ready", complete: selectedVerificationProfile?.canReceivePayouts === true, detail: `Verification payout lane: ${selectedVerificationProfile?.canReceivePayouts ? "ready" : "not ready"}` },
          { label: "Marketplace", complete: account.marketplaceLive, detail: account.marketplaceBlockers.length ? account.marketplaceBlockers.join(" | ") : "Marketplace visible from account data" },
          { label: "Client home", complete: account.clientHomeIncluded ?? account.marketplaceLive, detail: account.clientHomeIncluded ?? account.marketplaceLive ? "Included in client home supply" : "Not included in client home" },
          { label: "Client search", complete: account.clientSearchIncluded ?? account.searchIncluded, detail: account.clientSearchIncluded ?? account.searchIncluded ? "Included in client search" : "Not included in client search" },
          { label: "Direct search Phillip", complete: account.directSearchMatch ?? account.searchIncluded, detail: account.directSearchMatch ?? account.searchIncluded ? "Phillip direct search matches canonical terms" : "Phillip direct search excluded by blockers or terms" },
          { label: "Feed content", complete: account.feedEligible, detail: account.feedAssetCount > 0 ? `${account.feedAssetCount} public feed asset${account.feedAssetCount === 1 ? "" : "s"}` : "No public feed content yet" }
        ]
      : [];

  return (
    <div className="app-screen safe-top-pad px-2 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] sm:px-3 sm:py-3 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-7xl space-y-4">
        <Card className="rounded-[34px] p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="editorial-kicker">
                <span className="accent-rule" />
                Real account detail
              </div>
              <h1 className="mt-3 break-words text-3xl font-semibold sm:text-5xl" data-display="true">{account.fullName}</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/62">
                {account.email || "No email on file"} - {account.roleLabel} - {account.profileId}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={cn("status-pill", badgeClasses(account.accountStatus))}>{formatLabel(account.accountStatus)}</span>
                <span className={cn("status-pill", badgeClasses(account.approvalStatus))}>Approval {formatLabel(account.approvalStatus)}</span>
                <span className={cn("status-pill", marketplaceStatus.tone === "approved" ? badgeClasses("approved") : badgeClasses("pending"))}>Marketplace {marketplaceStatus.label}</span>
                <span className={cn("status-pill", account.searchIncluded ? badgeClasses("approved") : badgeClasses("pending"))}>Search {account.searchIncluded ? "Included" : "Excluded"}</span>
                <span className={cn("status-pill", account.feedEligible ? badgeClasses("approved") : badgeClasses("pending"))}>Feed {account.feedEligible ? "Eligible" : "No content"}</span>
                <span className={cn("status-pill", badgeClasses(account.verificationStatus))}>Verification {formatLabel(account.verificationStatus)}</span>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:w-[25rem]">
              <Link href="/architect/users">
                <Button type="button" variant="secondary" className="w-full">User search</Button>
              </Link>
              <Link href="/architect/verifications">
                <Button type="button" variant="secondary" className="w-full">Review queue</Button>
              </Link>
            </div>
          </div>
        </Card>

        {query.error ? <FeedbackBanner tone="error" message={query.error.message} /> : null}
        {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}
        {data.warnings.length ? (
          <Card className="rounded-[28px] border border-amber-300/18 bg-amber-300/8 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-100" />
              <div className="space-y-1 text-sm leading-6 text-white/72">
                {data.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            </div>
          </Card>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-[32px] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="surface-label">Account basics</p>
                <p className="mt-2 text-sm text-white/58">Canonical profile and onboarding identity.</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-[#baff69]" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Profile id" value={account.profile.id} />
              <Field label="Auth-linked id" value={account.authUserId} />
              <Field label="Profile row" value={account.profile.exists ? "Present" : "Missing"} />
              <Field label="Auth providers" value={account.authIdentity?.providers.join(", ") || account.authProvider} />
              <Field label="Email" value={account.profile.email} />
              <Field label="Phone" value={account.profile.phone} />
              <Field label="Email verified" value={account.authIdentity?.emailVerified} />
              <Field label="Role" value={account.profile.role} />
              <Field label="Primary role" value={account.profile.primaryOnboardingRole} />
              <Field label="Onboarding state" value={account.profile.onboardingState} />
              <Field label="Phone verified" value={formatDateTime(account.profile.phoneVerifiedAt)} />
              <Field label="Last sign in" value={formatDateTime(account.authIdentity?.lastSignInAt)} />
              <Field label="Created" value={formatDateTime(account.profile.createdAt)} />
              <Field label="Updated" value={formatDateTime(account.profile.updatedAt)} />
            </div>
          </Card>

          <Card className="rounded-[32px] p-6">
            <p className="surface-label">Account actions</p>
            <p className="mt-2 text-sm leading-7 text-white/58">All actions require a reason and write audit history.</p>
            {canManageAccountAccess ? (
              <div className="mt-4 grid gap-2">
                {account.accountStatus !== "active" ? (
                  <Button type="button" onClick={() => queueAccountAction("active")}>
                    <RotateCcw className="h-4 w-4" />
                    Reactivate account
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" onClick={() => queueAccountAction("deactivated")}>Deactivate account</Button>
                )}
                {account.accountStatus !== "suspended" ? (
                  <Button type="button" variant="secondary" onClick={() => queueAccountAction("suspended")}>
                    <ShieldAlert className="h-4 w-4" />
                    Suspend account
                  </Button>
                ) : null}
                {account.accountStatus !== "banned" ? (
                  <Button type="button" variant="secondary" onClick={() => queueAccountAction("banned")}>
                    <Ban className="h-4 w-4" />
                    Ban account
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4 text-sm leading-7 text-white/58">
                {isPlatformAdmin
                  ? "Platform admin access cannot be changed from Architect account detail."
                  : "This auth identity is visible for support, but account access actions require a canonical profile row."}
              </div>
            )}
          </Card>
        </section>

        {account.barber ? (
          <Card className="rounded-[32px] p-6">
            <p className="surface-label">Barber state</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <DetailMetric label="Services" value={account.barber.servicesCount} detail="Active real service paths" />
              <DetailMetric label="Availability rules" value={account.barber.availabilityRulesCount} />
              <DetailMetric label="Working hours" value={account.barber.workingHoursCount} />
              <DetailMetric label="Linked shops" value={account.barber.linkedShopIds.length} />
              <DetailMetric label="Bookable" value={account.barber.acceptingBookings === true ? "Yes" : "No"} />
              <Field label="Barber id" value={account.barber.id} />
              <Field label="Reference" value={account.barber.referenceCode} />
              <Field label="Subtype" value={account.barber.barberSubtype} />
              <Field label="App approval" value={account.barber.appApprovalStatus} />
              <Field label="Shop approval" value={account.barber.shopApprovalStatus} />
              <Field label="Status" value={account.barber.status} />
              <Field label="Visibility" value={account.barber.visibilityState} />
              <Field label="Instant bookings" value={account.barber.acceptsInstantBookings} />
              <Field label="Next available" value={formatDateTime(account.barber.nextAvailableAt)} />
            </div>
          </Card>
        ) : null}

        {account.role === "shop_owner" || account.shopOwner?.shopExists ? (
          <Card className="rounded-[32px] p-6">
            <p className="surface-label">Shop owner state</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <DetailMetric label="Shop exists" value={account.shopOwner?.shopExists ? "Yes" : "No"} />
              <DetailMetric label="Linked barbers" value={account.shopOwner?.activeLinkedBarbers ?? 0} />
              <DetailMetric label="Shop services" value={account.shopOwner?.serviceCount ?? 0} />
              <DetailMetric label="Locations" value={account.shopOwner?.locationLabels.length ?? 0} />
              <DetailMetric label="Shop status" value={formatLabel(account.shopOwner?.shopStatus)} />
              <Field label="Shop id" value={account.shopOwner?.id} />
              <Field label="Shop name" value={account.shopOwner?.name} />
              <Field label="App approval" value={account.shopOwner?.appApprovalStatus} />
              <Field label="City" value={account.shopOwner?.city} />
              <Field label="State" value={account.shopOwner?.state} />
              <Field label="Address" value={account.shopOwner?.address} />
              <Field label="Phone" value={account.shopOwner?.phone} />
            </div>
          </Card>
        ) : null}

        {account.client ? (
          <Card className="rounded-[32px] p-6">
            <p className="surface-label">Client state</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <DetailMetric label="Bookings" value={account.client.bookingCounts.total} />
              <DetailMetric label="Completed" value={account.client.bookingCounts.completed} />
              <DetailMetric label="Active" value={account.client.bookingCounts.active} />
              <DetailMetric label="Cancelled" value={account.client.bookingCounts.cancelled} />
              <DetailMetric label="Loyalty points" value={account.client.loyaltyPoints ?? 0} />
              <Field label="Auth user exists" value={account.client.authUserExists ? "yes" : "no"} />
              <Field label="Client profile row exists" value={account.client.clientProfileRowExists ? "yes" : "no"} />
              <Field label="Client preferences row exists" value={account.client.clientPreferencesRowExists ? "yes" : "no"} />
              <Field label="Location saved" value={account.client.locationSaved ? "yes" : "no"} />
              <Field label="Repair status" value={account.client.repairStatus} />
              <Field label="Client id" value={account.client.id} />
              <Field label="Client reference" value={account.client.referenceCode} />
              <Field label="Retention tag" value={account.client.retentionTag} />
            </div>
          </Card>
        ) : null}

        {readinessItems.length ? (
          <Card className="rounded-[32px] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="surface-label">Marketplace readiness</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">Real account activation summary</h2>
                <p className="mt-3 text-sm leading-7 text-white/62">
                  Approval unlocks eligibility. Setup and payout readiness decide whether clients can discover and book.
                </p>
              </div>
              <span className={cn("status-pill", marketplaceStatus.tone === "approved" ? badgeClasses("approved") : badgeClasses("pending"))}>
                Marketplace {marketplaceStatus.label}
              </span>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {readinessItems.map((item) => (
                <ReadinessItem key={item.label} {...item} />
              ))}
            </div>
          </Card>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <Card className="rounded-[32px] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="surface-label">Marketplace blockers</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">Approval vs marketplace live</h2>
                <p className="mt-3 text-sm leading-7 text-white/62">
                  Approved means eligible. Live means clients can discover and book.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={cn("status-pill", badgeClasses(account.approvalStatus))}>Approval {formatLabel(account.approvalStatus)}</span>
                <span className={cn("status-pill", marketplaceStatus.tone === "approved" ? badgeClasses("approved") : badgeClasses("pending"))}>Marketplace {marketplaceStatus.label}</span>
              </div>
            </div>
            {account.marketplaceBlockers.length ? (
              <div className="mt-4 grid gap-2">
                {account.marketplaceBlockers.map((blocker) => (
                  <div key={blocker} className="rounded-[20px] border border-amber-300/18 bg-amber-300/8 p-4 text-sm text-white/72">
                    {blocker}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-[22px] border border-[#7CFF00]/16 bg-[#7CFF00]/8 p-4 text-sm leading-7 text-white/68">
                No marketplace blockers are currently detected from live account data.
              </div>
            )}
          </Card>

          <Card className="rounded-[32px] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="surface-label">Client discovery debug</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">Search and public route state</h2>
                <p className="mt-3 text-sm leading-7 text-white/62">
                  This mirrors the marketplace live decision used by client Home, Search, and public profile routing.
                </p>
              </div>
              <span className={cn("status-pill", account.searchIncluded ? badgeClasses("approved") : badgeClasses("pending"))}>
                Client search {account.searchIncluded ? "included" : "excluded"}
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Field label="Client Home included" value={(account.clientHomeIncluded ?? account.marketplaceLive) ? "yes" : "no"} />
              <Field label="Client Search included" value={(account.clientSearchIncluded ?? account.searchIncluded) ? "yes" : "no"} />
              <Field label="Direct search Phillip match" value={(account.directSearchMatch ?? account.searchIncluded) ? "yes" : "no"} />
              <Field label="Marketplace live" value={account.marketplaceLive ? "yes" : "no"} />
              <Field label="Current discovery location" value={marketplaceFactLocation || account.discoveryLocation} />
              <Field label="Public route" value={account.publicRoute} />
              <Field label="Payout mode" value={marketplaceFacts ? `${marketplaceFacts.payoutMode} / ${formatLabel(marketplaceFacts.payoutStatus)}` : account.payoutMode} />
              <Field label="Feed eligible" value={account.feedEligible ? "yes" : "no"} />
              <Field label="Search terms" value={marketplaceSearchTerms} />
              <Field label="Services" value={marketplaceFacts ? `${marketplaceFacts.serviceCount} total / ${marketplaceFacts.activeServiceCount} active` : account.serviceCount} />
              <Field label="Availability / working hours" value={marketplaceFacts ? `${marketplaceFacts.availabilityCount} availability / ${marketplaceFacts.workingHoursCount} working hours` : account.availabilityCount} />
              <Field label="Independent location" value={marketplaceFacts ? (marketplaceFacts.independentLocationExists ? "yes" : "no") : undefined} />
              <Field label="Accepted shops" value={marketplaceFacts?.acceptedShopCount} />
              <Field label="Profile visibility" value={marketplaceFacts?.profileVisibility} />
              <Field label="Booking status" value={marketplaceFacts?.bookingStatus} />
              <Field label="Username / fallback slug" value={marketplaceFacts ? `${marketplaceFacts.username ?? "no username"} / ${marketplaceFacts.fallbackSlug}` : account.username} />
              <Field label="Public media count" value={marketplaceFacts?.publicMediaCount ?? account.feedAssetCount} />
              {account.serviceHealth ? (
                <>
                  <Field label="Service rows found" value={account.serviceHealth.serviceRowsFound} />
                  <Field label="Active service rows" value={account.serviceHealth.activeServiceRows} />
                  <Field label="Client-visible services" value={account.serviceHealth.clientVisibleServiceRows} />
                  <Field label="Service source table" value={account.serviceHealth.serviceSourceTable} />
                  <Field label="First service" value={account.serviceHealth.firstServiceName} />
                  <Field label="First service price" value={account.serviceHealth.firstServicePrice} />
                  <Field label="First service duration" value={account.serviceHealth.firstServiceDurationMin ? `${account.serviceHealth.firstServiceDurationMin} min` : undefined} />
                  <Field label="Discovery service gate" value={account.serviceHealth.discoveryServiceGatePass ? "pass" : "fail"} />
                  <Field label="Service blocker" value={account.serviceHealth.serviceBlocker} />
                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={barberRepairMutation.isPending}
                      onClick={() => void repairBarberProfile()}
                    >
                      <RotateCcw className="h-4 w-4" />
                      {barberRepairMutation.isPending ? "Repairing..." : "Repair Service Visibility"}
                    </Button>
                  </div>
                </>
              ) : null}
              {account.barberRowHealth ? (
                <>
                  <Field label="Auth user exists" value={account.barberRowHealth.authUserExists ? "yes" : "no"} />
                  <Field label="Platform profile row" value={account.barberRowHealth.platformProfileExists ? "yes" : "no"} />
                  <Field label="Barber row exists" value={account.barberRowHealth.barberRowExists ? "yes" : "no"} />
                  <Field label="Barbers.id" value={account.barberRowHealth.barberRowId} />
                  <Field label="Barber profile row" value={account.barberRowHealth.barberProfileRowExists ? "yes" : "no"} />
                  <Field label="Barber profile id" value={account.barberRowHealth.barberProfileId} />
                  <Field label="Barber profile reference" value={account.barberRowHealth.barberProfileReference} />
                  <Field label="Barber profile barber_id" value={account.barberRowHealth.barberProfileBarberId} />
                  <Field label="Barber row linked to user" value={account.barberRowHealth.barberRowLinkedToUser ? "yes" : "no"} />
                  <Field label="Barber reference" value={account.barberRowHealth.barberReference} />
                  <Field label="Canonical username" value={account.barberRowHealth.username} />
                  <Field label="Repair attempted" value={account.barberRowHealth.repairAttempted ? "yes" : "no"} />
                  <Field label="Repair result" value={account.barberRowHealth.repairResult} />
                  <Field label="Write table" value={account.barberRowHealth.repairTable} />
                  <Field label="Write operation" value={account.barberRowHealth.repairOperation} />
                  <Field label="Write error code" value={account.barberRowHealth.repairErrorCode} />
                  <Field label="Write error message" value={account.barberRowHealth.repairErrorMessage} />
                  <Field label="Final read by reference" value={account.barberRowHealth.finalReadByReference ? "yes" : "no"} />
                  <Field label="Final read by barber id" value={account.barberRowHealth.finalReadByBarberId ? "yes" : "no"} />
                  <Field label="Final read by profile/user" value={account.barberRowHealth.finalReadByProfileUser ? "yes" : "no"} />
                  <Field label="Row health discoverable" value={account.barberRowHealth.discoverable ? "yes" : "no"} />
                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={barberRepairMutation.isPending}
                      onClick={() => void repairBarberProfile()}
                    >
                      <RotateCcw className="h-4 w-4" />
                      {barberRepairMutation.isPending ? "Repairing..." : "Repair Barber Profile"}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </Card>

          <Card className="rounded-[32px] p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="surface-label">Verification actions</p>
                <p className="mt-2 text-sm text-white/58">Actions apply to a real verification profile only.</p>
              </div>
              {account.verificationProfiles.length > 1 ? (
                <Select value={selectedVerificationProfile?.id ?? ""} onChange={(event) => setSelectedVerificationProfileId(event.target.value)} className="w-full sm:w-[18rem]">
                  {account.verificationProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{formatLabel(profile.role)} - {formatLabel(profile.overallStatus)}</option>
                  ))}
                </Select>
              ) : null}
            </div>
            {canUseVerificationActions && selectedVerificationProfile ? (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Field label="Verification profile" value={selectedVerificationProfile.id} />
                  <Field label="Overall" value={selectedVerificationProfile.overallStatus} />
                  <Field label="Identity" value={selectedVerificationProfile.identityStatus} />
                  <Field label="License" value={selectedVerificationProfile.licenseStatus} />
                  <Field label="Business" value={selectedVerificationProfile.businessStatus} />
                  <Field label="Compliance" value={selectedVerificationProfile.complianceStatus} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" onClick={() => queueVerificationAction("approve")}>
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => queueVerificationAction("request-update")}>Request update</Button>
                  <Button type="button" variant="secondary" onClick={() => queueVerificationAction("reject")}>Reject</Button>
                  <Button type="button" variant="secondary" onClick={() => queueVerificationAction("suspend")}>Suspend review</Button>
                  <Button type="button" variant="secondary" onClick={() => queueVerificationAction("reactivate")}>Reactivate review</Button>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
                No real verification profile is linked yet. The account can still be inspected here so missing pipeline state is visible.
              </div>
            )}
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="rounded-[32px] p-6">
            <p className="surface-label">Documents</p>
            <div className="mt-4 grid gap-3">
              {account.documents.length ? account.documents.map((document) => (
                <div key={document.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <p className="font-semibold text-white">{document.fileName}</p>
                  <p className="mt-2 text-sm text-white/58">{formatLabel(document.documentType ?? document.legacyCategory)} - {formatLabel(document.status)}</p>
                  <p className="mt-2 text-xs text-white/44">{formatDateTime(document.uploadedAt)}</p>
                </div>
              )) : (
                <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
                  No real verification documents are linked to this account.
                </div>
              )}
            </div>
          </Card>

          <Card className="rounded-[32px] p-6">
            <p className="surface-label">Review history</p>
            <div className="mt-4 grid gap-3">
              {account.reviews.length ? account.reviews.map((review) => (
                <div key={review.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{formatLabel(review.actionType)}</p>
                    <span className={cn("status-pill", badgeClasses(review.toStatus))}>{formatLabel(review.toStatus)}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/58">{review.reason ?? "No reason recorded."}</p>
                  <p className="mt-2 text-xs text-white/44">{formatDateTime(review.createdAt)} by {review.reviewerLabel}</p>
                </div>
              )) : (
                <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
                  No verification review actions have been recorded for this account.
                </div>
              )}
            </div>
          </Card>

          <Card className="rounded-[32px] p-6">
            <p className="surface-label">Audit trail</p>
            <div className="mt-4 grid gap-3">
              {account.auditTrail.length ? account.auditTrail.map((entry) => (
                <div key={entry.id} className="rounded-[22px] border border-white/8 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-white">{formatLabel(entry.actionType)}</p>
                    <span className={cn("status-pill", actionToneClasses(entry.actionClass))}>{formatLabel(entry.actionClass)}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/58">{entry.note ?? "No note recorded."}</p>
                  <p className="mt-2 text-xs text-white/44">{formatDateTime(entry.createdAt)}</p>
                </div>
              )) : (
                <div className="rounded-[22px] border border-dashed border-white/10 bg-black/20 p-5 text-sm leading-7 text-white/58">
                  No architect audit entries are linked to this account yet.
                </div>
              )}
            </div>
          </Card>
        </section>
      </div>

      {pendingAction ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/72 px-3 py-3 sm:items-center sm:px-6">
          <div className="w-full max-w-2xl rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(8,8,8,0.98))] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="surface-label">Confirm Architect action</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">{pendingAction.title}</h2>
              </div>
              <span className={cn("status-pill", actionToneClasses(pendingAction.actionClass))}>{formatLabel(pendingAction.actionClass)}</span>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/62">{pendingAction.detail}</p>
            <div className="mt-5">
              <label className="mb-2 block surface-label">Reason</label>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                placeholder="Why is this action necessary?"
                className="min-h-[7.5rem] w-full rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(9,9,9,0.98))] px-4 py-4 text-sm text-[#f5f1e8] outline-none transition placeholder:text-white/32 focus:border-[#7CFF00]/55 focus:shadow-[0_0_0_4px_rgba(124,255,0,0.10)]"
              />
            </div>
            {pendingAction.kind === "verification" ? (
              <div className="mt-4">
                <label className="mb-2 block surface-label">Internal notes</label>
                <textarea
                  value={internalNotes}
                  onChange={(event) => setInternalNotes(event.target.value)}
                  rows={3}
                  placeholder="Private review notes"
                  className="min-h-[6rem] w-full rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,18,18,0.98),rgba(9,9,9,0.98))] px-4 py-4 text-sm text-[#f5f1e8] outline-none transition placeholder:text-white/32 focus:border-[#7CFF00]/55 focus:shadow-[0_0_0_4px_rgba(124,255,0,0.10)]"
                />
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                type="button"
                className="min-w-[10rem]"
                disabled={accountActionMutation.isPending || verificationActionMutation.isPending}
                onClick={confirmAction}
              >
                {accountActionMutation.isPending || verificationActionMutation.isPending ? "Applying..." : pendingAction.confirmLabel}
              </Button>
              <Button type="button" variant="secondary" className="min-w-[8rem]" disabled={accountActionMutation.isPending || verificationActionMutation.isPending} onClick={() => setPendingAction(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
