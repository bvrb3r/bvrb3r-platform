"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LockKeyhole, TabletSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useKioskDeviceState, useKioskPayloadQuery } from "@/lib/kiosk/client";
import { getReadableActionError } from "@/lib/utils/feedback";

type KioskControlShop = {
  id: string;
  label: string;
};

function MetricSkeleton() {
  return (
    <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-16" />
      <Skeleton className="mt-3 h-4 w-28" />
    </div>
  );
}

export function KioskControlPanel({
  shops,
  compact = false
}: {
  shops: KioskControlShop[];
  compact?: boolean;
}) {
  const router = useRouter();
  const kioskDevice = useKioskDeviceState();
  const [selectedShopId, setSelectedShopId] = useState(shops[0]?.id ?? "");
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const resolvedShopId = selectedShopId || kioskDevice.state.activeShopId || shops[0]?.id || "";
  const kioskQuery = useKioskPayloadQuery(resolvedShopId);
  const payload = kioskQuery.data;
  const activeShop = kioskDevice.state.activeShopId;
  const activeShopLabel = useMemo(
    () => shops.find((shop) => shop.id === activeShop)?.label ?? activeShop,
    [activeShop, shops]
  );

  useEffect(() => {
    if (!selectedShopId && shops[0]?.id) {
      setSelectedShopId(shops[0].id);
    }
  }, [selectedShopId, shops]);

  const selectedShopLabel = shops.find((shop) => shop.id === resolvedShopId)?.label ?? resolvedShopId;

  return (
    <Card className="rounded-[32px] p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="surface-label">Kiosk mode</p>
          <p className="mt-2 text-sm text-white/58">
            {compact
              ? "Launch a branded public intake flow on this device."
              : "Turn this device into a locked front-desk intake flow for bookings and walk-ins."}
          </p>
        </div>
        <span className={`status-pill ${kioskDevice.isActive ? "text-[#e4f9b8]" : "text-white/58"}`}>
          {kioskDevice.isActive ? "Active on this device" : "Inactive"}
        </span>
      </div>

      {kioskDevice.isActive ? (
        <div className="mt-4">
          <FeedbackBanner
            tone="info"
            message={`Kiosk mode is active on this device for ${activeShopLabel ?? "the selected shop"}. Staff unlock runs through the existing sign-in flow.`}
          />
        </div>
      ) : null}

      {shops.length > 1 ? (
        <div className="mt-4">
          <label className="mb-3 block surface-label">Shop kiosk</label>
          <Select value={resolvedShopId} onChange={(event) => setSelectedShopId(event.target.value)}>
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>{shop.label}</option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="mt-4 rounded-[24px] border border-white/8 bg-black/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="surface-label">Public preview</p>
            <p className="mt-3 text-lg font-semibold text-white">{payload?.shop.shopName ?? selectedShopLabel ?? "Shop kiosk"}</p>
            <p className="mt-2 text-sm text-white/58">{payload?.shop.subtitle ?? "Check in or book your appointment"}</p>
          </div>
          <div className="rounded-full border border-[#C4F24E]/16 bg-[#C4F24E]/8 p-3 text-[#e4f9b8]">
            <TabletSmartphone className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-4 text-sm text-white/52">
          {payload?.shop.locationLabel ?? "Front-desk intake stays branded to the shop, not the internal admin shell."}
        </p>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {kioskQuery.isLoading && !payload ? (
          <>
            <MetricSkeleton />
            <MetricSkeleton />
            {!compact ? <MetricSkeleton /> : null}
          </>
        ) : (
          <>
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Captured today</p>
              <p className="mt-3 text-2xl font-semibold" data-display="true">{payload?.queue.kioskEntriesToday ?? 0}</p>
              <p className="mt-2 text-sm text-white/58">Guests created from kiosk intake today.</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
              <p className="surface-label">Live wait</p>
              <p className="mt-3 text-2xl font-semibold" data-display="true">{payload?.queue.averageWaitMinutes ?? 0} min</p>
              <p className="mt-2 text-sm text-white/58">{payload?.queue.activeCount ?? 0} guests in the current queue.</p>
            </div>
            {!compact ? (
              <div className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                <p className="surface-label">Fastest chair engine</p>
                <p className="mt-3 text-2xl font-semibold" data-display="true">{payload?.barbers.filter((barber) => barber.acceptsWalkIns).length ?? 0}</p>
                <p className="mt-2 text-sm text-white/58">Walk-in-ready barbers visible to kiosk routing.</p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {kioskQuery.error ? (
        <div className="mt-4">
          <FeedbackBanner tone="error" message={getReadableActionError(kioskQuery.error)} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          className="min-w-[11rem]"
          disabled={!resolvedShopId || isLaunching}
          onClick={() => {
            if (!resolvedShopId) {
              return;
            }

            setLaunchError(null);
            setIsLaunching(true);
            void (async () => {
              try {
                // The device session is the server-side launch credential —
                // kiosk bookings and queue joins are refused without it.
                const response = await fetch("/api/kiosk/session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ scope: "shop", targetReference: resolvedShopId })
                });
                const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
                if (!response.ok) {
                  const sessionError = new Error(body.error ?? `Request failed with status ${response.status}`) as Error & { status?: number; code?: string };
                  sessionError.status = response.status;
                  sessionError.code = body.code;
                  throw sessionError;
                }
                kioskDevice.activate(resolvedShopId);
                router.push(`/kiosk/shop/${resolvedShopId}`);
              } catch (error) {
                setLaunchError(getReadableActionError(error as { message?: string; status?: number; code?: string }));
              } finally {
                setIsLaunching(false);
              }
            })();
          }}
        >
          {isLaunching ? "Starting kiosk…" : "Launch kiosk"}
        </Button>
        <Link
          href={resolvedShopId ? `/kiosk/shop/${resolvedShopId}` : "#"}
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-black/20 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#c4f24e]/20 hover:text-[#e4f9b8] sm:px-5 sm:text-[11px] sm:tracking-[0.22em]"
        >
          Preview
        </Link>
        {kioskDevice.isActive ? (
          <Button
            variant="ghost"
            className="min-w-[11rem]"
            disabled={isDeactivating}
            onClick={() => {
              setLaunchError(null);
              setIsDeactivating(true);
              void (async () => {
                try {
                  // Ends the server session too — clearing local state alone
                  // would leave this device able to keep booking.
                  await fetch("/api/kiosk/session", { method: "DELETE" });
                } finally {
                  kioskDevice.deactivate();
                  setIsDeactivating(false);
                }
              })();
            }}
          >
            {isDeactivating ? "Ending session…" : "Deactivate here"}
          </Button>
        ) : null}
      </div>

      {launchError ? (
        <div className="mt-3">
          <FeedbackBanner tone="error" message={launchError} />
        </div>
      ) : null}

      <div className="mt-4 rounded-[24px] border border-white/8 bg-black/18 p-4 text-sm text-white/62">
        <div className="flex items-center gap-2 text-[#e4f9b8]">
          <LockKeyhole className="h-4 w-4" />
          Unlock requires staff sign-in
        </div>
        <p className="mt-2 leading-6">
          Kiosk uses the existing booking and queue rails, then returns to the welcome screen automatically after each guest flow.
        </p>
      </div>
    </Card>
  );
}
