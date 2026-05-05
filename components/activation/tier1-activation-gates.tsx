import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type ActivationHref = string;

export type ActivationChecklistItem = {
  id: string;
  label: string;
  complete: boolean;
  completeLabel: string;
  missingLabel: string;
  actionLabel: string;
  href: ActivationHref;
  optional?: boolean;
};

export type ActivationActionHandlers = Partial<Record<string, () => void>>;

export type BarberActivationInput = {
  approvalStatus?: string | null;
  accountStatus?: string | null;
  hasActiveService: boolean;
  hasAvailability: boolean;
  isProfilePublic: boolean;
  isAcceptingBookings: boolean;
  payoutsReady: boolean;
  payoutsRequired?: boolean;
  hasServiceLocation?: boolean;
  serviceLocationRequired?: boolean;
  hasShopLink: boolean;
  shopLinkRequired?: boolean;
  hasPendingShopInvite?: boolean;
};

export type OwnerActivationInput = {
  approvalStatus?: string | null;
  accountStatus?: string | null;
  hasShopProfile: boolean;
  hasAddress: boolean;
  hasShopHours: boolean;
  payoutsReady: boolean;
  hasInvitedBarber: boolean;
  hasAcceptedBarber: boolean;
  hasBookableBarber: boolean;
  publicProfileEnabled?: boolean;
};

export type ClientActivationInput = {
  emailVerified: boolean;
  phoneVerified: boolean;
  hasDefaultPaymentMethod: boolean;
  hasLocation: boolean;
  hasPreferredSupply?: boolean;
};

function isApproved(value?: string | null) {
  return value === "approved" || value === "active" || value === "verified";
}

function isSuspended(value?: string | null) {
  return value === "suspended" || value === "banned" || value === "deactivated";
}

function readableStatus(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return value.replaceAll("_", " ");
}

export function getBarberActivationItems(input: BarberActivationInput): ActivationChecklistItem[] {
  const approvalComplete = isApproved(input.approvalStatus) && !isSuspended(input.accountStatus);
  const payoutsComplete = input.payoutsRequired === false || input.payoutsReady;
  const shopComplete = input.shopLinkRequired === false || input.hasShopLink;
  const serviceLocationRequired = input.serviceLocationRequired !== false;
  const serviceLocationComplete = !serviceLocationRequired || Boolean(input.hasServiceLocation || input.hasShopLink);

  return [
    {
      id: "barber-approval",
      label: "Approval status",
      complete: approvalComplete,
      completeLabel: "Approved",
      missingLabel: `Approval ${readableStatus(input.approvalStatus)}`,
      actionLabel: "Open activation",
      href: "/activation-status"
    },
    {
      id: "barber-services",
      label: "Add at least 1 active service",
      complete: input.hasActiveService,
      completeLabel: "Service ready",
      missingLabel: "Services missing",
      actionLabel: "Add service",
      href: "/dashboard/barber/services"
    },
    {
      id: "barber-availability",
      label: "Set working hours / availability",
      complete: input.hasAvailability,
      completeLabel: "Availability set",
      missingLabel: "Availability missing",
      actionLabel: "Set availability",
      href: "/dashboard/barber/availability"
    },
    {
      id: "barber-service-location",
      label: "Add service location or connect shop",
      complete: serviceLocationComplete,
      completeLabel: input.hasShopLink ? "Shop location ready" : "Service location ready",
      missingLabel: "Service location missing",
      actionLabel: "Add location",
      href: "/dashboard/barber/more?section=system"
    },
    {
      id: "barber-visibility",
      label: "Set profile visibility to public",
      complete: input.isProfilePublic,
      completeLabel: "Public profile ready",
      missingLabel: "Profile not public",
      actionLabel: "Turn public",
      href: "/dashboard/barber/profile"
    },
    {
      id: "barber-booking-status",
      label: "Set booking status to active",
      complete: input.isAcceptingBookings,
      completeLabel: "Accepting bookings",
      missingLabel: "Booking is not active",
      actionLabel: "Go active",
      href: "/dashboard/barber/more?section=system"
    },
    {
      id: "barber-payouts",
      label: "Connect payouts if required for paid bookings",
      complete: payoutsComplete,
      completeLabel: input.payoutsRequired === false ? "Not required" : "Payouts ready",
      missingLabel: "Finish Stripe payouts to accept paid bookings",
      actionLabel: "Finish payouts",
      href: "/dashboard/barber/payouts"
    },
    {
      id: "barber-shop-link",
      label: "Join or connect to a shop if applicable",
      complete: shopComplete,
      completeLabel: input.shopLinkRequired === false ? "Independent lane ready." : "Shop connected",
      missingLabel: input.hasPendingShopInvite ? "Shop invite waiting" : "No shop link",
      actionLabel: input.hasPendingShopInvite ? "View invites" : "Join shop",
      href: "/dashboard/barber/more?section=system"
    }
  ];
}

export function getOwnerActivationItems(input: OwnerActivationInput): ActivationChecklistItem[] {
  const approvalComplete = isApproved(input.approvalStatus) && !isSuspended(input.accountStatus);

  return [
    {
      id: "owner-approval",
      label: "Shop approval status",
      complete: approvalComplete,
      completeLabel: "Approved",
      missingLabel: `Approval ${readableStatus(input.approvalStatus)}`,
      actionLabel: "Open activation",
      href: "/activation-status"
    },
    {
      id: "owner-profile",
      label: "Shop profile completed",
      complete: input.hasShopProfile,
      completeLabel: "Profile started",
      missingLabel: "Shop profile incomplete",
      actionLabel: "Edit shop profile",
      href: "/onboarding/owner/shop"
    },
    {
      id: "owner-address",
      label: "Shop address/city exists",
      complete: input.hasAddress,
      completeLabel: "Address set",
      missingLabel: "Address missing",
      actionLabel: "Add address",
      href: "/onboarding/owner/shop"
    },
    {
      id: "owner-hours",
      label: "Shop hours set",
      complete: input.hasShopHours,
      completeLabel: "Hours set",
      missingLabel: "Hours missing",
      actionLabel: "Set shop hours",
      href: "/onboarding/owner/structure"
    },
    {
      id: "owner-payouts",
      label: "Stripe Connect / payout setup ready",
      complete: input.payoutsReady,
      completeLabel: "Payouts ready",
      missingLabel: "Stripe payouts need setup",
      actionLabel: "Finish payouts",
      href: "/dashboard/owner/money?view=fintech"
    },
    {
      id: "owner-invite",
      label: "Invite at least 1 barber",
      complete: input.hasInvitedBarber,
      completeLabel: "Team invite started",
      missingLabel: "No barber invite",
      actionLabel: "Invite barber",
      href: "/dashboard/owner/team?invite=1"
    },
    {
      id: "owner-accepted-barber",
      label: "At least 1 barber accepted team invite",
      complete: input.hasAcceptedBarber,
      completeLabel: "Accepted barber linked",
      missingLabel: input.hasInvitedBarber ? "Waiting for barber to accept" : "No accepted barber",
      actionLabel: input.hasInvitedBarber ? "View invites" : "Review team",
      href: "/dashboard/owner/team"
    },
    {
      id: "owner-bookable-barber",
      label: "At least 1 assigned barber is approved/bookable",
      complete: input.hasBookableBarber,
      completeLabel: "Bookable barber ready",
      missingLabel: input.hasAcceptedBarber ? "Barber setup incomplete" : "No bookable barber",
      actionLabel: "Review team",
      href: "/dashboard/owner/team"
    },
    {
      id: "owner-public-profile",
      label: "Shop public profile enabled",
      complete: input.publicProfileEnabled !== false,
      completeLabel: "Public profile allowed",
      missingLabel: "Shop profile hidden",
      actionLabel: "Turn shop public",
      href: "/onboarding/owner/shop"
    }
  ];
}

export function getClientActivationItems(input: ClientActivationInput): ActivationChecklistItem[] {
  return [
    {
      id: "client-email",
      label: "Email verified",
      complete: input.emailVerified,
      completeLabel: "Email verified",
      missingLabel: "Email pending",
      actionLabel: "Verify email",
      href: "/verify-contact"
    },
    {
      id: "client-phone",
      label: "Phone verified",
      complete: input.phoneVerified,
      completeLabel: "Phone verified",
      missingLabel: "Phone pending",
      actionLabel: "Verify phone",
      href: "/verify-contact"
    },
    {
      id: "client-payment",
      label: "Add default payment method",
      complete: input.hasDefaultPaymentMethod,
      completeLabel: "Payment method ready",
      missingLabel: "Payment method missing",
      actionLabel: "Add card",
      href: "/dashboard/client/profile?section=wallet"
    },
    {
      id: "client-location",
      label: "Add city/location",
      complete: input.hasLocation,
      completeLabel: "Location saved",
      missingLabel: "Location missing",
      actionLabel: "Set location",
      href: "/dashboard/client/profile?section=location"
    },
    {
      id: "client-preferred-supply",
      label: "Optional: save preferred barber/shop after first booking",
      complete: input.hasPreferredSupply === true,
      completeLabel: "Preferred barber/shop saved",
      missingLabel: "Optional preference not saved",
      actionLabel: "Open search",
      href: "/dashboard/client/search",
      optional: true
    }
  ];
}

function ActivationChecklistCard({
  title,
  subtitle,
  items,
  testId,
  actionHandlers
}: {
  title: string;
  subtitle: string;
  items: ActivationChecklistItem[];
  testId: string;
  actionHandlers?: ActivationActionHandlers;
}) {
  const completedCount = items.filter((item) => item.complete).length;

  return (
    <section
      data-testid={testId}
      className="overflow-hidden rounded-[28px] border border-[#A3FF12]/18 bg-[linear-gradient(180deg,rgba(163,255,18,0.09),rgba(255,255,255,0.025)_34%,rgba(5,5,5,0.92))] p-5 text-white shadow-[0_18px_50px_rgba(0,0,0,0.42),0_0_30px_rgba(163,255,18,0.10)] sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#A3FF12]">Activation Gate</p>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
            {title}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/62">{subtitle}</p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-[#A3FF12]/25 bg-[#A3FF12]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#A3FF12]">
          {completedCount}/{items.length} ready
        </span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {items.map((item) => {
          const actionHandler = actionHandlers?.[item.id];

          return (
            <div
              key={item.id}
              className={cn(
                "grid min-h-[86px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] border px-4 py-3",
                item.complete
                  ? "border-[#A3FF12]/16 bg-[#A3FF12]/[0.055]"
                  : item.optional
                    ? "border-white/8 bg-black/24"
                    : "border-amber-300/18 bg-amber-300/[0.065]"
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border",
                  item.complete
                    ? "border-[#A3FF12]/25 bg-[#A3FF12]/12 text-[#A3FF12]"
                    : item.optional
                      ? "border-white/10 bg-white/[0.04] text-white/56"
                      : "border-amber-300/25 bg-amber-300/10 text-amber-200"
                )}
              >
                {item.complete ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-white">{item.label}</span>
                <span className={cn("mt-1 block text-sm", item.complete ? "text-[#A3FF12]" : "text-white/58")}>
                  {item.complete ? item.completeLabel : item.missingLabel}
                </span>
              </span>
              {!item.complete ? (
                actionHandler ? (
                  <button
                    type="button"
                    onClick={actionHandler}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 text-xs font-black text-white transition hover:border-[#A3FF12]/35 hover:text-[#A3FF12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A3FF12]/60"
                  >
                    {item.actionLabel}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <Link
                    href={item.href as Route}
                    className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-3 text-xs font-black text-white transition hover:border-[#A3FF12]/35 hover:text-[#A3FF12]"
                  >
                    {item.actionLabel}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function BarberActivationGate({ input, actionHandlers }: { input: BarberActivationInput; actionHandlers?: ActivationActionHandlers }) {
  const items = getBarberActivationItems(input);
  const hasBlockingGap = items.some((item) => !item.complete && !item.optional);
  if (!hasBlockingGap) {
    return null;
  }

  return (
    <ActivationChecklistCard
      testId="barber-activation-gate"
      title={isApproved(input.approvalStatus) ? "You're approved. Finish setup to go live." : "Finish setup before your profile can go live."}
      subtitle="Set your hours first. Then choose where clients can book you."
      items={items}
      actionHandlers={actionHandlers}
    />
  );
}

export function OwnerActivationGate({ input, actionHandlers }: { input: OwnerActivationInput; actionHandlers?: ActivationActionHandlers }) {
  const items = getOwnerActivationItems(input);
  const hasBlockingGap = items.some((item) => !item.complete && !item.optional);
  if (!hasBlockingGap) {
    return null;
  }

  return (
    <ActivationChecklistCard
      testId="owner-activation-gate"
      title={isApproved(input.approvalStatus) ? "Your shop is approved. Finish setup to go live." : "Finish shop setup before clients can book through it."}
      subtitle="Approval unlocks eligibility. Team, hours, payouts, and bookable barbers unlock public shop booking."
      items={items}
      actionHandlers={actionHandlers}
    />
  );
}

export function ClientActivationGate({ input, actionHandlers }: { input: ClientActivationInput; actionHandlers?: ActivationActionHandlers }) {
  const items = getClientActivationItems(input);
  const requiredItems = items.filter((item) => !item.optional);
  const hasRequiredGap = requiredItems.some((item) => !item.complete);
  if (!hasRequiredGap) {
    return null;
  }

  return (
    <ActivationChecklistCard
      testId="client-activation-gate"
      title="Finish setup for faster booking."
      subtitle="You can still search BVRB3R while contact, payment, and location details get completed."
      items={items}
      actionHandlers={actionHandlers}
    />
  );
}
