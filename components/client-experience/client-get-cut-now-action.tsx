"use client";

import type { Route } from "next";
import { useMemo, useState } from "react";
import { CreditCard, MapPin, Scissors, Store } from "lucide-react";
import {
  ClientActionLink,
  getClientActionClassName
} from "@/components/client-experience/client-action-link";
import { CLIENT_PRIMARY_TAB_HREFS } from "@/components/client-experience/client-tab-config";
import type {
  ClientHomeResponse,
  ClientPaymentMethodSummary
} from "@/lib/booking/client";
import { getClientFacingBarberName } from "@/lib/marketplace/client-facing";
import { buildMarketplaceBookingHref } from "@/lib/marketplace/links";
import { cn, currency } from "@/lib/utils";

function formatDateLabel(iso?: string | null) {
  if (!iso) {
    return "Not scheduled";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatTimeLabel(iso?: string | null) {
  if (!iso) {
    return "Not scheduled";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

type ActionSize = "md" | "lg";
type ActionVariant = "primary" | "secondary" | "outline";

type ClientGetCutNowActionProps = {
  hasResolvedLocation: boolean;
  nextAvailableChair: ClientHomeResponse["nextAvailableChair"];
  defaultPaymentMethod?: ClientPaymentMethodSummary | null;
  size?: ActionSize;
  variant?: ActionVariant;
  className?: string;
};

export function ClientGetCutNowAction({
  hasResolvedLocation,
  nextAvailableChair,
  defaultPaymentMethod = null,
  size = "lg",
  variant = "primary",
  className
}: ClientGetCutNowActionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const locationHref = `${CLIENT_PRIMARY_TAB_HREFS.profile}?section=location` as Route;
  const walletHref = `${CLIENT_PRIMARY_TAB_HREFS.profile}?section=wallet` as Route;
  const barberSearchHref = `${CLIENT_PRIMARY_TAB_HREFS.search}?type=barbers` as Route;
  const bookingHref = useMemo<Route | null>(() => {
    if (!nextAvailableChair) {
      return null;
    }

    return buildMarketplaceBookingHref({
      barberId: nextAvailableChair.barberId,
      username: nextAvailableChair.username,
      locationId: nextAvailableChair.locationId,
      appointmentTime: nextAvailableChair.appointmentTime,
      sourceKind: "haircut_now",
      matchedFrom: nextAvailableChair.matchedFrom
    });
  }, [nextAvailableChair]);

  const state = !hasResolvedLocation
    ? "location"
    : !nextAvailableChair
      ? "unavailable"
      : !defaultPaymentMethod
        ? "payment"
        : "ready";
  const barberName = nextAvailableChair
    ? getClientFacingBarberName({
      username: nextAvailableChair.username,
      barberName: nextAvailableChair.barberName
    })
    : "";

  const ctaHref = state === "location"
    ? locationHref
    : state === "unavailable"
      ? barberSearchHref
      : state === "payment"
        ? walletHref
        : bookingHref;

  return (
    <div className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={getClientActionClassName({ size, variant })}
      >
        Get a Cut Now
      </button>

      {isOpen ? (
        <div className="rounded-[24px] border border-white/10 bg-black/24 p-4">
          {state === "location" ? (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <MapPin className="h-4 w-4 text-[#e4f9b8]" />
                Add your location to find the next available barber near you.
              </div>
              <p className="text-sm leading-7 text-white/60">
                Save your local booking area first so BVRB3R can match you to a real barber close enough to book right now.
              </p>
              <ClientActionLink href={locationHref} size="md">
                Add Location
              </ClientActionLink>
            </div>
          ) : null}

          {state === "unavailable" ? (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <Store className="h-4 w-4 text-[#e4f9b8]" />
                No available barber near you right now.
              </div>
              <p className="text-sm leading-7 text-white/60">
                Search nearby barbers instead and pick the next chair that fits your timing.
              </p>
              <ClientActionLink href={barberSearchHref} size="md">
                Search Barbers
              </ClientActionLink>
            </div>
          ) : null}

          {(state === "payment" || state === "ready") && nextAvailableChair ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-semibold text-white">{barberName}</p>
                  <p className="mt-2 text-sm text-white/64">
                    {nextAvailableChair.shopName ?? "Location available in booking"}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/18 px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[#e4f9b8]">
                  {nextAvailableChair.matchedFrom.replaceAll("_", " ")}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[18px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Date</p>
                  <p className="mt-2 text-sm font-semibold text-white">{formatDateLabel(nextAvailableChair.appointmentTime)}</p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Time</p>
                  <p className="mt-2 text-sm font-semibold text-white">{formatTimeLabel(nextAvailableChair.appointmentTime)}</p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Service</p>
                  <p className="mt-2 text-sm font-semibold text-white">Select in booking flow</p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-black/18 p-3">
                  <p className="surface-label">Price</p>
                  <p className="mt-2 text-sm font-semibold text-white">From {currency(nextAvailableChair.priceFrom)}</p>
                </div>
              </div>

              {state === "payment" ? (
                <div className="rounded-[18px] border border-[#e4f9b8]/18 bg-[#e4f9b8]/8 px-4 py-3 text-sm text-white/74">
                  <div className="inline-flex items-center gap-2 text-white">
                    <CreditCard className="h-4 w-4 text-[#e4f9b8]" />
                    Add a payment method to confirm this booking.
                  </div>
                  <p className="mt-2 leading-7 text-white/60">
                    BVRB3R keeps the next available match intact, but payment setup still has to happen inside the existing wallet flow before the appointment can be confirmed.
                  </p>
                </div>
              ) : (
                <div className="rounded-[18px] border border-white/8 bg-black/18 px-4 py-3 text-sm text-white/74">
                  <div className="inline-flex items-center gap-2 text-white">
                    <Scissors className="h-4 w-4 text-[#e4f9b8]" />
                    You will confirm the chair inside the existing booking flow.
                  </div>
                  <p className="mt-2 leading-7 text-white/60">
                    Payment, service selection, and appointment creation still run through the current canonical booking and checkout rules.
                  </p>
                  {defaultPaymentMethod ? (
                    <p className="mt-2 text-white/68">Payment method ready: {defaultPaymentMethod.label}</p>
                  ) : null}
                </div>
              )}

              {ctaHref ? (
                <ClientActionLink href={ctaHref} size="md">
                  {state === "payment" ? "Add Payment Method" : "Continue to Booking"}
                </ClientActionLink>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
