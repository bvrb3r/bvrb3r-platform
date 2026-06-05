"use client";

import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  BriefcaseBusiness,
  ChevronRight,
  Mail,
  MoreVertical,
  Send,
  ShieldCheck,
  X
} from "lucide-react";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, GlassCard, SearchBar } from "@/design/components";
import { useFintechManagementQuery } from "@/lib/fintech/client";
import {
  useCreateOwnerTeamInviteMutation,
  useOwnerTeamInviteDirectoryQuery,
  useOwnerShopProfileQuery,
  useReleaseOwnerTeamRelationshipMutation,
  useRespondOwnerTeamJoinRequestMutation,
  useShopDashboardQuery,
  useUpdateOwnerShopProfileMutation,
  useUpdateOwnerTeamRelationshipMutation,
  type ShopDashboardAppointment,
  type ShopDashboardBarberSummary
} from "@/lib/operations/barber-client";
import { cn, currency } from "@/lib/utils";
import { getReadableActionError } from "@/lib/utils/feedback";

type StatusKind = "active" | "idle" | "offline" | "pending";

type TeamBarberView = {
  id: string;
  name: string;
  initials: string;
  roleLabel: string;
  statusKind: StatusKind;
  statusLabel: string;
  statusDetail: string;
  todayBookings: number | null;
  todayPostedAmount: number | null;
  utilization: number | null;
  rating: number | null;
  nextAppointmentStart: string | null;
  currentShopLabel: string | null;
  payoutStatus: string;
  payoutReadinessStatus: string;
  payoutBlockReason: string | null;
  relationshipId: string | null;
  publicTeamVisible: boolean;
  publicTeamOrder: number;
  featuredOnShopProfile: boolean;
};

type RelationshipUpdatePayload = {
  routingModel?: "freelance" | "booth_rent" | "commission";
  boothRentAmount?: number | null;
  boothRentFrequency?: "daily" | "weekly" | "monthly" | null;
  barberPercent?: number | null;
  shopPercent?: number | null;
  commissionCapAmount?: number | null;
  commissionCapFrequency?: "weekly" | "monthly" | null;
  publicTeamVisible?: boolean;
  publicTeamOrder?: number;
  featuredOnShopProfile?: boolean;
};

type ShopProfileDraft = {
  name: string;
  shopUsername: string;
  brandLine: string;
  publicBio: string;
  profilePhotoUrl: string;
  coverPhotoUrl: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  phone: string;
  publicHours: string;
  policies: string;
};

function formatTime(iso: string | null) {
  if (!iso) {
    return "No booking queued";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatRoutingLabel(value: string) {
  switch (value) {
    case "booth_rent":
      return "Booth rent";
    case "commission":
      return "Commission";
    case "freelance":
      return "Freelance";
    default:
      return value.replaceAll("_", " ");
  }
}

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "BV";
}

function getOptionalNumericField(source: object, keys: string[]) {
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getCompletedAppointmentRevenue(appointment: ShopDashboardAppointment) {
  if (appointment.status !== "completed") {
    return 0;
  }

  return appointment.totalAmount + appointment.tipAmount;
}

function getStatusKind({
  barber,
  isActive,
  onboardingStatus,
  payoutReadinessStatus,
  payoutBlockReason
}: {
  barber: ShopDashboardBarberSummary;
  isActive: boolean;
  onboardingStatus?: string;
  payoutReadinessStatus: string;
  payoutBlockReason: string | null;
}): StatusKind {
  const verificationReason = `${onboardingStatus ?? ""} ${payoutReadinessStatus} ${payoutBlockReason ?? ""}`.toLowerCase();
  if (
    onboardingStatus === "invited"
    || onboardingStatus === "pending"
    || onboardingStatus === "submitted"
    || verificationReason.includes("verification")
  ) {
    return "pending";
  }

  if (isActive || barber.liveAppointmentCount > 0 || barber.activeAppointmentCount > 0) {
    return "active";
  }

  if (barber.utilization > 0 || barber.bookedCount > 0 || barber.completedCount > 0 || barber.nextAppointmentStart) {
    return "idle";
  }

  return "offline";
}

function getStatusCopy(kind: StatusKind) {
  switch (kind) {
    case "active":
      return "Active";
    case "idle":
      return "Idle";
    case "offline":
      return "Offline";
    case "pending":
      return "Pending Verification";
  }
}

function getStatusDetail(kind: StatusKind, barber: ShopDashboardBarberSummary, reason: string | null) {
  switch (kind) {
    case "active":
      return barber.liveAppointmentCount > 0
        ? `${barber.liveAppointmentCount} live service${barber.liveAppointmentCount === 1 ? "" : "s"} in motion`
        : "Working or available in today's shop lane.";
    case "idle":
      return barber.nextAppointmentStart ? `Next booking at ${formatTime(barber.nextAppointmentStart)}.` : "Available capacity needs owner attention.";
    case "offline":
      return "Not active on the floor right now.";
    case "pending":
      return reason ?? "Verification or payout readiness is still pending.";
  }
}

function getStatusClasses(kind: StatusKind) {
  switch (kind) {
    case "active":
      return "bg-[#A3FF12] text-[#A3FF12]";
    case "idle":
      return "bg-amber-300 text-amber-300";
    case "offline":
      return "bg-white/45 text-white/58";
    case "pending":
      return "bg-sky-400 text-sky-300";
  }
}

function SectionEmptyState({
  title,
  detail,
  action
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <GlassCard className="p-6">
      <p className="text-xl font-extrabold text-white">{title}</p>
      <p className="mt-2 text-sm text-white/58">{detail}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </GlassCard>
  );
}

function TeamActionLink({
  href,
  children
}: {
  href: ComponentProps<typeof Link>["href"];
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-[14px] px-3 py-2.5 text-sm font-bold text-white/72 transition hover:bg-white/[0.05] hover:text-[#A3FF12]"
    >
      {children}
    </Link>
  );
}

export function OwnerTeamWorkspace() {
  const shopQuery = useShopDashboardQuery();
  const shopProfileQuery = useOwnerShopProfileQuery();
  const fintechQuery = useFintechManagementQuery();
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  const [shopProfileEditorOpen, setShopProfileEditorOpen] = useState(false);
  const [shopProfileDraft, setShopProfileDraft] = useState<ShopProfileDraft>({
    name: "",
    shopUsername: "",
    brandLine: "",
    publicBio: "",
    profilePhotoUrl: "",
    coverPhotoUrl: "",
    address: "",
    neighborhood: "",
    city: "",
    state: "",
    phone: "",
    publicHours: "",
    policies: ""
  });
  const [shopProfileFeedback, setShopProfileFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [relationshipFeedback, setRelationshipFeedback] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const relationshipDirectoryQuery = useOwnerTeamInviteDirectoryQuery("", true);
  const inviteDirectoryQuery = useOwnerTeamInviteDirectoryQuery(inviteSearch, inviteModalOpen);
  const createInviteMutation = useCreateOwnerTeamInviteMutation();
  const respondJoinRequestMutation = useRespondOwnerTeamJoinRequestMutation();
  const updateRelationshipMutation = useUpdateOwnerTeamRelationshipMutation();
  const releaseRelationshipMutation = useReleaseOwnerTeamRelationshipMutation();
  const updateShopProfileMutation = useUpdateOwnerShopProfileMutation();

  useEffect(() => {
    const shop = shopProfileQuery.data?.shop;
    if (!shop) {
      return;
    }

    setShopProfileDraft({
      name: shop.name ?? "",
      shopUsername: shop.shop_username ?? "",
      brandLine: shop.brand_line ?? "",
      publicBio: shop.public_bio ?? "",
      profilePhotoUrl: shop.profile_photo_url ?? shop.profile_photo_path ?? "",
      coverPhotoUrl: shop.cover_photo_url ?? "",
      address: shop.address ?? "",
      neighborhood: shop.neighborhood ?? "",
      city: shop.city ?? "",
      state: shop.state ?? "",
      phone: shop.phone ?? "",
      publicHours: typeof shop.public_hours === "string" ? shop.public_hours : "",
      policies: shop.policies ?? ""
    });
  }, [shopProfileQuery.data?.shop]);

  const isInitialLoading =
    (shopQuery.isLoading && !shopQuery.data)
    || (fintechQuery.isLoading && !fintechQuery.data);

  const errorMessage = shopQuery.error ?? fintechQuery.error ?? shopProfileQuery.error;
  const inviteErrorMessage = inviteDirectoryQuery.error ? getReadableActionError(inviteDirectoryQuery.error) : null;

  const barbers = useMemo(() => shopQuery.data?.barbers ?? [], [shopQuery.data?.barbers]);
  const activeBarbers = useMemo(() => shopQuery.data?.activeBarbers ?? [], [shopQuery.data?.activeBarbers]);
  const appointments = useMemo(() => shopQuery.data?.appointments ?? [], [shopQuery.data?.appointments]);
  const memberships = useMemo(() => fintechQuery.data?.memberships ?? [], [fintechQuery.data?.memberships]);
  const barberAccounts = useMemo(() => fintechQuery.data?.barbers ?? [], [fintechQuery.data?.barbers]);

  const team = useMemo(() => {
    const activeBarberIds = new Set(activeBarbers.map((barber) => barber.id));

    return barbers.map((barber): TeamBarberView => {
      const membership = memberships.find((entry) => entry.barberId === barber.id);
      const account = barberAccounts.find((entry) => entry.barberId === barber.id);
      const payoutReadinessStatus = account?.payoutReadinessStatus ?? "not_ready";
      const payoutBlockReason = membership?.payoutBlockReason ?? account?.missingSteps?.[0] ?? account?.disabledReason ?? null;
      const statusKind = getStatusKind({
        barber,
        isActive: activeBarberIds.has(barber.id),
        onboardingStatus: account?.onboardingStatus,
        payoutReadinessStatus,
        payoutBlockReason
      });
      const todayPostedAmount = appointments
        .filter((appointment) => appointment.barberId === barber.id)
        .reduce((sum, appointment) => sum + getCompletedAppointmentRevenue(appointment), 0);
      const rating = getOptionalNumericField(barber, ["averageRating", "rating", "reviewRating"]);
      const todayBookings = barber.bookedCount + barber.activeAppointmentCount + barber.liveAppointmentCount + barber.completedCount;
      const roleLabel = formatRoutingLabel(membership?.routingModel ?? barber.compensationModel);
      const statusLabel = getStatusCopy(statusKind);
      const currentShopLabel = membership?.shopLabel ?? account?.shopLabel ?? null;
      const membershipRecord = (membership ?? {}) as Record<string, unknown>;

      return {
        id: barber.id,
        name: barber.name,
        initials: getInitials(barber.name),
        roleLabel,
        statusKind,
        statusLabel,
        statusDetail: getStatusDetail(statusKind, barber, payoutBlockReason),
        todayBookings: statusKind === "pending" ? null : todayBookings,
        todayPostedAmount: statusKind === "pending" ? null : todayPostedAmount,
        utilization: statusKind === "pending" ? null : barber.utilization,
        rating,
        nextAppointmentStart: barber.nextAppointmentStart,
        payoutStatus: formatStatusLabel(account?.operationalStatus ?? "not_ready"),
        payoutReadinessStatus: formatStatusLabel(payoutReadinessStatus),
        payoutBlockReason,
        currentShopLabel,
        relationshipId: typeof membership?.id === "string" ? membership.id : null,
        publicTeamVisible: membershipRecord.publicTeamVisible !== false && membershipRecord.public_team_visible !== false,
        publicTeamOrder: getOptionalNumericField(membershipRecord, ["publicTeamOrder", "public_team_order"]) ?? 0,
        featuredOnShopProfile: membershipRecord.featuredOnShopProfile === true || membershipRecord.featured_on_shop_profile === true
      };
    });
  }, [activeBarbers, appointments, barberAccounts, barbers, memberships]);

  const selectedBarber = team.find((barber) => barber.id === selectedBarberId) ?? null;
  const activeCount = team.filter((barber) => barber.statusKind === "active").length;
  const relationshipDirectory = relationshipDirectoryQuery.data?.barbers ?? [];
  const pendingOwnerInvites = relationshipDirectory.filter((barber) => barber.inviteStatus === "invited");
  const incomingJoinRequests = relationshipDirectory.filter((barber) => barber.inviteStatus === "requested");
  const relationshipErrorMessage = relationshipDirectoryQuery.error ? getReadableActionError(relationshipDirectoryQuery.error) : null;
  const ownerShopProfile = shopProfileQuery.data?.shop ?? null;
  const publicShopHref = ownerShopProfile?.id ? `/shop/${encodeURIComponent(ownerShopProfile.id)}` : "/dashboard/client/search?type=shops";
  const todayRevenue = appointments.reduce((sum, appointment) => sum + getCompletedAppointmentRevenue(appointment), 0);
  const appointmentsToday = appointments.length;
  const openChairCapacity = team.filter((barber) => barber.statusKind === "idle" || barber.statusKind === "offline").length;
  const pendingActions = pendingOwnerInvites.length + incomingJoinRequests.length + team.filter((barber) => barber.statusKind === "pending").length;

  function updateShopProfileDraft(field: keyof ShopProfileDraft, value: string) {
    setShopProfileDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleShopProfileSave() {
    if (!ownerShopProfile?.id) {
      setShopProfileFeedback({ tone: "error", message: "Owner shop profile is not available yet." });
      return;
    }

    setShopProfileFeedback(null);
    try {
      await updateShopProfileMutation.mutateAsync({
        shopId: ownerShopProfile.id,
        name: shopProfileDraft.name,
        shopUsername: shopProfileDraft.shopUsername || null,
        brandLine: shopProfileDraft.brandLine || null,
        publicBio: shopProfileDraft.publicBio || null,
        profilePhotoUrl: shopProfileDraft.profilePhotoUrl || null,
        coverPhotoUrl: shopProfileDraft.coverPhotoUrl || null,
        address: shopProfileDraft.address || null,
        neighborhood: shopProfileDraft.neighborhood || null,
        city: shopProfileDraft.city || null,
        state: shopProfileDraft.state || null,
        phone: shopProfileDraft.phone || null,
        publicHours: shopProfileDraft.publicHours || null,
        policies: shopProfileDraft.policies || null
      });
      setShopProfileFeedback({ tone: "success", message: "Public shop profile saved." });
      setShopProfileEditorOpen(false);
    } catch (error) {
      setShopProfileFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    }
  }

  async function handleCreateInvite(barberId: string) {
    setInviteFeedback(null);
    try {
      const response = await createInviteMutation.mutateAsync({
        barberId,
        shopId: inviteDirectoryQuery.data?.shop.id
      });
      setInviteFeedback({
        tone: "success",
        message: `Invite sent to ${response.invite.barberName}. They can accept or decline it from their Barber More tab.`
      });
    } catch (error) {
      setInviteFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    }
  }

  async function handleJoinRequestResponse(inviteId: string, status: "accepted" | "rejected", barberName: string) {
    setRelationshipFeedback(null);
    try {
      await respondJoinRequestMutation.mutateAsync({ inviteId, status });
      setRelationshipFeedback({
        tone: "success",
        message: status === "accepted"
          ? `${barberName} is now connected to your shop team.`
          : `${barberName}'s join request was rejected and kept in relationship history.`
      });
    } catch (error) {
      setRelationshipFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    }
  }

  async function handleRelationshipUpdate(barber: TeamBarberView, payload: RelationshipUpdatePayload, successMessage: string) {
    if (!barber.relationshipId) {
      setRelationshipFeedback({ tone: "error", message: "Active relationship record is not available for this barber." });
      return;
    }

    setRelationshipFeedback(null);
    try {
      await updateRelationshipMutation.mutateAsync({
        ...payload,
        relationshipId: barber.relationshipId
      });
      setRelationshipFeedback({ tone: "success", message: successMessage });
    } catch (error) {
      setRelationshipFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    }
  }

  async function handleReleaseRelationship(barber: TeamBarberView) {
    if (!barber.relationshipId) {
      setRelationshipFeedback({ tone: "error", message: "Active relationship record is not available for this barber." });
      return;
    }

    setRelationshipFeedback(null);
    try {
      await releaseRelationshipMutation.mutateAsync({
        relationshipId: barber.relationshipId,
        reason: "Owner released barber from team."
      });
      setRelationshipFeedback({ tone: "success", message: `${barber.name} was released. Their effective model is freelance.` });
    } catch (error) {
      setRelationshipFeedback({ tone: "error", message: getReadableActionError(error as { message?: string; status?: number; code?: string }) });
    }
  }

  return (
    <div className="space-y-7" data-testid="owner-team-workspace">
      {errorMessage ? <FeedbackBanner tone="error" message={getReadableActionError(errorMessage)} /> : null}
      {inviteFeedback && !inviteModalOpen ? <FeedbackBanner tone={inviteFeedback.tone} message={inviteFeedback.message} /> : null}
      {relationshipFeedback ? <FeedbackBanner tone={relationshipFeedback.tone} message={relationshipFeedback.message} /> : null}
      {relationshipErrorMessage ? <FeedbackBanner tone="error" message={relationshipErrorMessage} /> : null}

      <GlassCard className="p-5 sm:p-6" data-testid="today-shop-snapshot">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Today Shop Snapshot</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">How the shop is doing today.</h2>
          </div>
          <Link href="/dashboard/owner/schedule" className="text-sm font-extrabold text-[#A3FF12] transition hover:text-[#d7ffab]">
            Open Schedule
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Today Revenue", currency(todayRevenue), "Completed services and tips"],
            ["Appointments Today", appointmentsToday.toString(), "Booked, active, and completed"],
            ["Active Barbers", activeCount.toString(), "Serving or ready now"],
            ["Open Chair Capacity", openChairCapacity.toString(), "Idle or offline chairs"],
            ["Pending Actions", pendingActions.toString(), "Invites, requests, or setup"]
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-[18px] border border-white/8 bg-black/24 p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-white/42">{label}</p>
              <p className="mt-3 text-2xl font-black tracking-[-0.04em] text-white">{value}</p>
              <p className="mt-1 text-xs leading-5 text-white/50">{detail}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-5 sm:p-6" data-testid="barbers-summary">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Barbers Summary</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-white">Connected barbers and today&apos;s performance.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/56">
              Active shop relationships stay separate from pending invitations so the owner view stays operational.
            </p>
          </div>
          {team.length ? (
            <Link href="/dashboard/owner/team" className="text-sm font-extrabold text-[#A3FF12] transition hover:text-[#d7ffab]">
              View Team
            </Link>
          ) : null}
        </div>

        <div className="mt-5 space-y-3">
          {isInitialLoading ? (
            <>
              <Skeleton className="h-28 rounded-[22px]" />
              <Skeleton className="h-28 rounded-[22px]" />
            </>
          ) : !team.length ? (
            <SectionEmptyState
              title="No active barbers yet."
              detail={pendingOwnerInvites.length ? "Pending invitations are waiting for barber approval before they join the active summary." : "Invite or approve a barber to build your shop team."}
              action={!pendingOwnerInvites.length ? (
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(true)}
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#A3FF12]/40 px-5 text-sm font-extrabold text-[#A3FF12] transition hover:bg-[#A3FF12]/10"
                >
                  Invite Barber
                </button>
              ) : undefined}
            />
          ) : (
            team.map((barber) => {
              const statusClasses = getStatusClasses(barber.statusKind);
              const isSelected = selectedBarber?.id === barber.id;

              return (
                <div key={barber.id} className="rounded-[22px] border border-white/8 bg-black/24">
                  <div className="grid gap-4 p-4 lg:grid-cols-[minmax(15rem,1.25fr)_0.75fr_0.65fr_0.75fr_0.65fr_auto] lg:items-center">
                    <button
                      type="button"
                      onClick={() => setSelectedBarberId(isSelected ? null : barber.id)}
                      className="flex min-w-0 items-center gap-4 rounded-[16px] text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/70"
                    >
                      <Avatar
                        alt={barber.name}
                        initials={barber.initials}
                        className={cn(
                          "h-16 w-16 border-2 text-base",
                          barber.statusKind === "active" && "border-[#A3FF12]/80 shadow-[0_0_18px_rgba(163,255,18,0.18)]",
                          barber.statusKind === "idle" && "border-amber-300/65",
                          barber.statusKind === "offline" && "border-white/18",
                          barber.statusKind === "pending" && "border-sky-400/70"
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xl font-extrabold tracking-[-0.035em] text-white">{barber.name}</span>
                        <span className="mt-1 block truncate text-sm font-semibold text-white/62">Service: {barber.roleLabel}</span>
                      </span>
                    </button>

                    <Link
                      href={barber.statusKind === "pending" ? "/dashboard/owner/more?section=verification" : "/dashboard/owner/team"}
                      className={cn("inline-flex items-center gap-2 text-base font-extrabold", statusClasses.split(" ")[1])}
                    >
                      <span className={cn("h-3 w-3 rounded-full shadow-[0_0_12px_currentColor]", statusClasses.split(" ")[0])} />
                      {barber.statusLabel}
                    </Link>

                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-white/42">Today</p>
                      <p className="mt-1 text-xl font-black text-white">{barber.todayPostedAmount === null ? "-" : currency(barber.todayPostedAmount)}</p>
                    </div>

                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-white/42">Appointments</p>
                      <p className="mt-1 text-xl font-black text-white">{barber.todayBookings ?? "-"}</p>
                    </div>

                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-white/42">Performance</p>
                      <p className="mt-1 text-xl font-black text-white">{barber.utilization === null ? "-" : `${barber.utilization}%`}</p>
                    </div>

                    <details className="relative justify-self-start lg:justify-self-end">
                      <summary className="inline-flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/62 transition hover:border-[#A3FF12]/30 hover:text-[#A3FF12]" aria-label={`Open actions for ${barber.name}`}>
                        <MoreVertical className="h-5 w-5" />
                      </summary>
                      <GlassCard className="absolute right-0 z-20 mt-2 w-56 p-2">
                        <TeamActionLink href={`/dashboard/owner/schedule?barberId=${encodeURIComponent(barber.id)}`}>
                          View Schedule
                        </TeamActionLink>
                        <TeamActionLink href={`/dashboard/owner/messages?threadWith=${encodeURIComponent(barber.id)}`}>
                          Message Barber
                        </TeamActionLink>
                        <TeamActionLink href={`/dashboard/owner/team?barber=${encodeURIComponent(barber.id)}`}>
                          View Profile
                        </TeamActionLink>
                      </GlassCard>
                    </details>
                  </div>

                  {isSelected ? (
                    <div className="border-t border-white/8 px-4 pb-4">
                      <div className="grid gap-3 rounded-[20px] border border-white/8 bg-black/24 p-4 text-sm text-white/62 md:grid-cols-[1fr_1fr_auto] md:items-center">
                        <div>
                          <p className="font-bold text-white">{barber.statusDetail}</p>
                          <p className="mt-1">Next up: {formatTime(barber.nextAppointmentStart)}</p>
                        </div>
                        <div>
                          <p className="font-bold text-white">Account health: {barber.payoutStatus}</p>
                          <p className="mt-1">{barber.payoutBlockReason ?? `Payout readiness ${barber.payoutReadinessStatus}.`}</p>
                        </div>
                        <Link href={`/dashboard/owner/money?barberId=${encodeURIComponent(barber.id)}`} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#A3FF12]/40 px-4 text-sm font-extrabold text-[#A3FF12] transition hover:bg-[#A3FF12]/10">
                          Inspect
                        </Link>
                      </div>
                      <div className="mt-3 grid gap-3 rounded-[20px] border border-[#A3FF12]/14 bg-[#A3FF12]/6 p-4 md:grid-cols-[1fr_1fr]">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A3FF12]">Operating model</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(["freelance", "booth_rent", "commission"] as const).map((model) => (
                              <button
                                key={`${barber.id}-${model}`}
                                type="button"
                                disabled={!barber.relationshipId || updateRelationshipMutation.isPending}
                                onClick={() => void handleRelationshipUpdate(
                                  barber,
                                  model === "commission"
                                    ? { routingModel: model, barberPercent: 0.7, shopPercent: 0.3 }
                                    : model === "booth_rent"
                                      ? { routingModel: model, boothRentAmount: 250, boothRentFrequency: "weekly", barberPercent: null, shopPercent: null }
                                      : { routingModel: model, boothRentAmount: null, boothRentFrequency: null, barberPercent: null, shopPercent: null },
                                  `${barber.name}'s operating model was set to ${formatRoutingLabel(model)}.`
                                )}
                                className={cn(
                                  "inline-flex min-h-10 items-center rounded-full border px-4 text-xs font-black transition",
                                  barber.roleLabel.toLowerCase() === formatRoutingLabel(model).toLowerCase()
                                    ? "border-[#A3FF12]/38 bg-[#A3FF12] text-black"
                                    : "border-white/10 bg-black/20 text-white/68 hover:border-[#A3FF12]/28 hover:text-[#A3FF12]",
                                  (!barber.relationshipId || updateRelationshipMutation.isPending) && "cursor-not-allowed opacity-55"
                                )}
                              >
                                {formatRoutingLabel(model)}
                              </button>
                            ))}
                          </div>
                          <p className="mt-3 text-xs leading-5 text-white/48">Commission defaults to 70/30. Booth rent terms can be refined in Money after the relationship is saved.</p>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#A3FF12]">Public shop profile</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={!barber.relationshipId || updateRelationshipMutation.isPending}
                              onClick={() => void handleRelationshipUpdate(
                                barber,
                                { publicTeamVisible: !barber.publicTeamVisible },
                                barber.publicTeamVisible ? `${barber.name} is hidden from the public shop team.` : `${barber.name} is visible on the public shop team.`
                              )}
                              className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-black/20 px-4 text-xs font-black text-white/72 transition hover:border-[#A3FF12]/28 hover:text-[#A3FF12] disabled:cursor-not-allowed disabled:opacity-55"
                            >
                              {barber.publicTeamVisible ? "Hide publicly" : "Show publicly"}
                            </button>
                            <button
                              type="button"
                              disabled={!barber.relationshipId || updateRelationshipMutation.isPending}
                              onClick={() => void handleRelationshipUpdate(
                                barber,
                                { featuredOnShopProfile: !barber.featuredOnShopProfile },
                                barber.featuredOnShopProfile ? `${barber.name} is no longer featured.` : `${barber.name} is featured on the shop profile.`
                              )}
                              className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-black/20 px-4 text-xs font-black text-white/72 transition hover:border-[#A3FF12]/28 hover:text-[#A3FF12] disabled:cursor-not-allowed disabled:opacity-55"
                            >
                              {barber.featuredOnShopProfile ? "Unfeature" : "Feature"}
                            </button>
                            <button
                              type="button"
                              disabled={!barber.relationshipId || updateRelationshipMutation.isPending}
                              onClick={() => void handleRelationshipUpdate(
                                barber,
                                { publicTeamOrder: Math.max(0, barber.publicTeamOrder - 1) },
                                `${barber.name} was moved earlier on the public shop team.`
                              )}
                              className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-black/20 px-4 text-xs font-black text-white/72 transition hover:border-[#A3FF12]/28 hover:text-[#A3FF12] disabled:cursor-not-allowed disabled:opacity-55"
                            >
                              Move up
                            </button>
                            <button
                              type="button"
                              disabled={!barber.relationshipId || updateRelationshipMutation.isPending}
                              onClick={() => void handleRelationshipUpdate(
                                barber,
                                { publicTeamOrder: barber.publicTeamOrder + 1 },
                                `${barber.name} was moved later on the public shop team.`
                              )}
                              className="inline-flex min-h-10 items-center rounded-full border border-white/10 bg-black/20 px-4 text-xs font-black text-white/72 transition hover:border-[#A3FF12]/28 hover:text-[#A3FF12] disabled:cursor-not-allowed disabled:opacity-55"
                            >
                              Move down
                            </button>
                            <button
                              type="button"
                              disabled={!barber.relationshipId || releaseRelationshipMutation.isPending}
                              onClick={() => void handleReleaseRelationship(barber)}
                              className="inline-flex min-h-10 items-center rounded-full border border-red-300/20 bg-red-400/10 px-4 text-xs font-black text-red-100 transition hover:border-red-200/36 hover:bg-red-400/14 disabled:cursor-not-allowed disabled:opacity-55"
                            >
                              Release barber
                            </button>
                          </div>
                          <p className="mt-3 text-xs leading-5 text-white/48">Public controls only affect the shop profile team surface. Barber accounts and past history stay intact.</p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Team relationship queue</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-white">Invites and join requests</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/56">
              Active relationships are exclusive. Accepted requests connect the barber to this shop; declined and ended records stay auditable.
            </p>
          </div>
          {team.length ? (
            <button
              type="button"
              onClick={() => setInviteModalOpen(true)}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-4 text-sm font-extrabold text-white/74 transition hover:border-[#A3FF12]/28 hover:text-[#A3FF12]"
            >
              Invite Barber
            </button>
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-white/48">Incoming requests</p>
              <span className="rounded-full border border-[#A3FF12]/20 bg-[#A3FF12]/10 px-3 py-1 text-xs font-black text-[#A3FF12]">
                {incomingJoinRequests.length}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {relationshipDirectoryQuery.isLoading ? (
                <>
                  <Skeleton className="h-20 rounded-[18px]" />
                  <Skeleton className="h-20 rounded-[18px]" />
                </>
              ) : incomingJoinRequests.length ? (
                incomingJoinRequests.slice(0, 4).map((barber) => (
                  <div key={barber.inviteId ?? barber.barberId} className="rounded-[18px] border border-white/8 bg-white/[0.035] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-extrabold text-white">{barber.name}</p>
                        <p className="mt-1 text-sm text-white/56">{formatRoutingLabel(barber.compensationModel)} request</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!barber.inviteId || respondJoinRequestMutation.isPending}
                          onClick={() => barber.inviteId ? void handleJoinRequestResponse(barber.inviteId, "accepted", barber.name) : undefined}
                          className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#A3FF12]/38 bg-[#A3FF12] px-4 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:border-white/8 disabled:bg-white/[0.04] disabled:text-white/34"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={!barber.inviteId || respondJoinRequestMutation.isPending}
                          onClick={() => barber.inviteId ? void handleJoinRequestResponse(barber.inviteId, "rejected", barber.name) : undefined}
                          className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/10 px-4 text-sm font-extrabold text-white/68 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:text-white/34"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                    <p className="mt-3 text-xs font-bold uppercase tracking-[0.13em] text-white/38">One active shop relationship at a time</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.025] p-4">
                  <p className="text-base font-extrabold text-white">No join requests waiting.</p>
                  <p className="mt-1 text-sm leading-6 text-white/54">Barbers who request this shop will appear here for owner approval.</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[20px] border border-white/8 bg-black/24 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black uppercase tracking-[0.16em] text-white/48">Sent invitations</p>
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-black text-amber-100">
                {pendingOwnerInvites.length}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {relationshipDirectoryQuery.isLoading ? (
                <>
                  <Skeleton className="h-20 rounded-[18px]" />
                  <Skeleton className="h-20 rounded-[18px]" />
                </>
              ) : pendingOwnerInvites.length ? (
                pendingOwnerInvites.slice(0, 4).map((barber) => (
                  <div key={barber.inviteId ?? barber.barberId} className="rounded-[18px] border border-white/8 bg-white/[0.035] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-extrabold text-white">{barber.name}</p>
                        <p className="mt-1 text-sm text-white/56">{barber.email || barber.username || "Waiting for barber response"}</p>
                      </div>
                      <span className="rounded-full border border-amber-300/18 bg-amber-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-amber-100">
                        Pending barber approval
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.025] p-4">
                  <p className="text-base font-extrabold text-white">No open invitations.</p>
                  <p className="mt-1 text-sm leading-6 text-white/54">Invite barbers when you are ready to connect your shop team.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden p-0">
        {ownerShopProfile?.cover_photo_url ? (
          <div className="h-36 overflow-hidden border-b border-white/8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ownerShopProfile.cover_photo_url} alt={`${ownerShopProfile.name} cover`} className="h-full w-full object-cover opacity-85" />
          </div>
        ) : null}
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <Avatar
            src={ownerShopProfile?.profile_photo_url ?? ownerShopProfile?.profile_photo_path ?? undefined}
            alt={ownerShopProfile?.name ?? "Shop profile"}
            initials={getInitials(ownerShopProfile?.name ?? "Shop")}
            className="h-20 w-20 rounded-[24px] border-2 border-[#A3FF12]/45 bg-[#A3FF12]/10"
          />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Public Shop Profile</p>
            <h2 className="mt-2 truncate text-3xl font-black tracking-[-0.045em] text-white">{ownerShopProfile?.name ?? "Finish shop profile"}</h2>
            <p className="mt-1 text-sm font-bold text-white/54">{ownerShopProfile?.shop_username ? `@${ownerShopProfile.shop_username}` : "Set your public shop handle"}</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
              {ownerShopProfile?.public_bio ?? ownerShopProfile?.brand_line ?? "Set your shop name, handle, address, photos, hours, and policies."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.13em] text-white/44">
              <span>{formatStatusLabel(ownerShopProfile?.app_approval_status ?? "pending")}</span>
              <span>{[ownerShopProfile?.address, ownerShopProfile?.city, ownerShopProfile?.state].filter(Boolean).join(", ") || "Address not set"}</span>
              <span>{team.filter((barber) => barber.publicTeamVisible).length} public barber{team.filter((barber) => barber.publicTeamVisible).length === 1 ? "" : "s"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link
              href="/dashboard/owner/public-profile"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#A3FF12]/38 bg-[#A3FF12] px-4 text-sm font-black text-black shadow-[0_14px_32px_rgba(163,255,18,0.2)] transition hover:-translate-y-0.5"
            >
              Public Profile
            </Link>
            <button
              type="button"
              onClick={() => setShopProfileEditorOpen((current) => !current)}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-sm font-extrabold text-white/72 transition hover:border-[#A3FF12]/28 hover:text-[#A3FF12]"
            >
              Quick edit
            </button>
            {ownerShopProfile?.id ? (
              <Link
                href={publicShopHref as Route}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-sm font-extrabold text-white/72 transition hover:border-[#A3FF12]/28 hover:text-[#A3FF12]"
              >
                Preview public profile
              </Link>
            ) : null}
          </div>
        </div>
        {shopProfileFeedback ? <div className="px-5 pb-5 sm:px-6"><FeedbackBanner tone={shopProfileFeedback.tone} message={shopProfileFeedback.message} /></div> : null}
        {shopProfileEditorOpen ? (
          <div className="border-t border-white/8 p-5 sm:p-6">
            <div className="grid gap-3 md:grid-cols-2">
              {([
                ["name", "Shop name"],
                ["shopUsername", "Public handle"],
                ["profilePhotoUrl", "Logo / profile photo URL"],
                ["coverPhotoUrl", "Cover photo URL"],
                ["brandLine", "Brand line"],
                ["phone", "Phone"],
                ["address", "Address"],
                ["neighborhood", "Neighborhood"],
                ["city", "City"],
                ["state", "State"]
              ] as Array<[keyof ShopProfileDraft, string]>).map(([field, label]) => (
                <label key={field} className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-white/42">{label}</span>
                  <input
                    value={shopProfileDraft[field]}
                    onChange={(event) => updateShopProfileDraft(field, event.target.value)}
                    className="min-h-12 w-full rounded-[16px] border border-white/10 bg-black/28 px-4 text-sm font-bold text-white outline-none transition placeholder:text-white/28 focus:border-[#A3FF12]/50"
                  />
                </label>
              ))}
              <label className="space-y-2 md:col-span-2">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-white/42">Public bio</span>
                <textarea
                  value={shopProfileDraft.publicBio}
                  onChange={(event) => updateShopProfileDraft("publicBio", event.target.value)}
                  rows={3}
                  className="w-full rounded-[16px] border border-white/10 bg-black/28 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-white/28 focus:border-[#A3FF12]/50"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-white/42">Hours</span>
                <textarea
                  value={shopProfileDraft.publicHours}
                  onChange={(event) => updateShopProfileDraft("publicHours", event.target.value)}
                  rows={3}
                  className="w-full rounded-[16px] border border-white/10 bg-black/28 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-white/28 focus:border-[#A3FF12]/50"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-white/42">Policies</span>
                <textarea
                  value={shopProfileDraft.policies}
                  onChange={(event) => updateShopProfileDraft("policies", event.target.value)}
                  rows={3}
                  className="w-full rounded-[16px] border border-white/10 bg-black/28 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-white/28 focus:border-[#A3FF12]/50"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={updateShopProfileMutation.isPending}
                onClick={() => void handleShopProfileSave()}
                className="inline-flex min-h-11 items-center rounded-full bg-[#A3FF12] px-5 text-sm font-black text-black transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55"
              >
                Save public profile
              </button>
              <button
                type="button"
                onClick={() => setShopProfileEditorOpen(false)}
                className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-black/20 px-5 text-sm font-black text-white/66 transition hover:border-[#A3FF12]/30 hover:text-[#A3FF12]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </GlassCard>

      <Link href="/dashboard/owner/money" className="group block">
        <GlassCard className="grid gap-4 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-6">
          <span className="flex h-16 w-16 items-center justify-center rounded-[18px] border border-[#A3FF12]/22 bg-[#A3FF12]/12 text-[#A3FF12] shadow-[0_0_24px_rgba(163,255,18,0.16)]">
            <BriefcaseBusiness className="h-7 w-7" />
          </span>
          <span>
            <span className="block text-2xl font-extrabold tracking-[-0.04em] text-white">Team Insights</span>
            <span className="mt-1 block text-base font-medium text-white/58">View performance trends & analytics</span>
          </span>
          <span className="inline-flex items-center gap-2 text-lg font-extrabold text-[#A3FF12]">
            View Insights
            <ChevronRight className="h-5 w-5 transition group-hover:translate-x-1" />
          </span>
        </GlassCard>
      </Link>

      {inviteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/78 px-4 py-5 backdrop-blur-xl sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="owner-team-invite-title">
          <GlassCard className="max-h-[88vh] w-full max-w-3xl overflow-hidden p-0">
            <div className="flex items-start justify-between gap-4 border-b border-white/8 p-5 sm:p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#A3FF12]">Team invite</p>
                <h2 id="owner-team-invite-title" className="mt-2 text-3xl font-black tracking-[-0.045em] text-white">Invite a barber</h2>
                <p className="mt-2 text-sm leading-6 text-white/58">
                  Search real barber accounts and send a canonical shop invite. Barbers join the team only after accepting.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close invite barber dialog"
                onClick={() => setInviteModalOpen(false)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.035] text-white/70 transition hover:border-[#A3FF12]/35 hover:text-[#A3FF12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/70"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[calc(88vh-9rem)] overflow-y-auto p-5 sm:p-6">
              {inviteFeedback ? <FeedbackBanner tone={inviteFeedback.tone} message={inviteFeedback.message} /> : null}
              {inviteErrorMessage ? <FeedbackBanner tone="error" message={inviteErrorMessage} /> : null}

              <SearchBar
                aria-label="Search app barbers to invite"
                placeholder="Search by name, email, username, or city"
                value={inviteSearch}
                onChange={(event) => setInviteSearch(event.target.value)}
                className="min-h-[4rem] rounded-[22px] px-5 text-base"
              />

              {inviteDirectoryQuery.data?.shop ? (
                <div className="mt-4 rounded-[20px] border border-[#A3FF12]/18 bg-[#A3FF12]/8 p-4 text-sm text-white/70">
                  Invites will be sent for <span className="font-extrabold text-white">{inviteDirectoryQuery.data.shop.label}</span>.
                  {inviteDirectoryQuery.data.shop.setupNote ? (
                    <p className="mt-2 text-xs leading-5 text-amber-100">{inviteDirectoryQuery.data.shop.setupNote}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-5 space-y-3">
                {inviteDirectoryQuery.isLoading ? (
                  <>
                    <Skeleton className="h-24 rounded-[22px]" />
                    <Skeleton className="h-24 rounded-[22px]" />
                    <Skeleton className="h-24 rounded-[22px]" />
                  </>
                ) : inviteDirectoryQuery.data?.barbers.length ? inviteDirectoryQuery.data.barbers.map((barber) => {
                  const statusText = barber.alreadyAssigned
                    ? "Assigned"
                    : barber.inviteStatus === "invited" || barber.inviteStatus === "requested"
                      ? "Invite pending"
                      : barber.canInvite
                        ? "Ready to invite"
                        : formatStatusLabel(barber.inviteStatus ?? "Unavailable");
                  const statusTone = barber.alreadyAssigned || barber.inviteStatus === "active" ? "text-[#A3FF12]" : barber.inviteStatus === "invited" || barber.inviteStatus === "requested" ? "text-amber-200" : "text-white/58";

                  return (
                    <div key={barber.barberId} className="grid gap-4 rounded-[24px] border border-white/8 bg-black/28 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="flex min-w-0 gap-4">
                        <Avatar
                          alt={barber.name}
                          initials={getInitials(barber.name)}
                          className="h-14 w-14 shrink-0 border-2 border-[#A3FF12]/45 bg-[#A3FF12]/10"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-3">
                            <p className="truncate text-xl font-extrabold tracking-[-0.03em] text-white">{barber.name}</p>
                            <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-extrabold", statusTone)}>
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              {statusText}
                            </span>
                          </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-sm text-white/56">
                          {barber.email ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5 text-[#A3FF12]" aria-hidden="true" />
                              {barber.email}
                            </span>
                          ) : null}
                          {barber.username ? <span>@{barber.username}</span> : null}
                          {barber.serviceAreaLabel ? <span>{barber.serviceAreaLabel}</span> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.13em] text-white/42">
                          <span>App {formatStatusLabel(barber.appApprovalStatus)}</span>
                          <span>Shop {formatStatusLabel(barber.shopApprovalStatus)}</span>
                          <span>{formatStatusLabel(barber.compensationModel)}</span>
                          <span>{barber.acceptsInstantBookings ? "Instant booking on" : "Instant booking off"}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(barber.readinessLabels ?? []).map((label) => (
                            <span
                              key={label}
                              className={cn(
                                "inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-extrabold",
                                label.includes("Bookable") || label.includes("Approved") || label.includes("team")
                                  ? "border-[#A3FF12]/25 bg-[#A3FF12]/10 text-[#A3FF12]"
                                  : label.includes("incomplete") || label.includes("invited") || label.includes("Not approved")
                                    ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                                    : "border-white/10 bg-white/[0.05] text-white/62"
                              )}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                        {!barber.canInvite && barber.inviteDisabledReason ? (
                          <p className="mt-3 rounded-[14px] border border-amber-300/18 bg-amber-300/8 px-3 py-2 text-xs font-bold leading-5 text-amber-100">
                            {barber.inviteDisabledReason}
                          </p>
                        ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        {barber.username ? (
                          <Link
                            href={`/barber/${encodeURIComponent(barber.username)}`}
                            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-4 text-sm font-extrabold text-white/72 transition hover:border-[#A3FF12]/28 hover:text-[#A3FF12]"
                          >
                            View Profile
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          disabled={!barber.canInvite || createInviteMutation.isPending}
                          onClick={() => void handleCreateInvite(barber.barberId)}
                          className={cn(
                            "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/70",
                            barber.canInvite
                              ? "border border-[#A3FF12]/42 bg-[#A3FF12] text-black shadow-[0_14px_32px_rgba(163,255,18,0.22)] hover:-translate-y-0.5"
                              : "cursor-not-allowed border border-white/8 bg-white/[0.035] text-white/38"
                          )}
                        >
                          <Send className="h-4 w-4" />
                          {barber.inviteStatus === "invited" || barber.inviteStatus === "requested" ? "Pending" : barber.alreadyAssigned ? "Assigned" : "Send Invite"}
                        </button>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-[24px] border border-dashed border-white/10 bg-black/28 p-6">
                    <p className="text-xl font-extrabold text-white">No matching barbers found.</p>
                    <p className="mt-2 text-sm leading-6 text-white/58">Try a different name, email, username, or service area.</p>
                  </div>
                )}
              </div>
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
