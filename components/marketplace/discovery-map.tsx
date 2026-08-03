"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { ArrowRight, MapPinned, MessageCircle, Navigation, Route as RouteIcon } from "lucide-react";
import {
  MapboxDiscoveryCanvas,
  type DiscoveryMapBounds
} from "@/components/marketplace/mapbox-discovery-canvas";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketplaceRoutePreviewMutation, type MarketplaceMapViewport } from "@/lib/marketplace/client";
import { dateLabel } from "@/lib/utils";
import type { MapDiscoveryMarker } from "@/types/domain";

function MarkerSkeleton() {
  return (
    <div className="rounded-[22px] border border-white/8 bg-black/20 p-4">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-4 w-36" />
      <Skeleton className="mt-3 h-4 w-24" />
    </div>
  );
}

export function DiscoveryMapPanel({
  markers,
  isLoading,
  error,
  onSearchBounds,
  origin
}: {
  markers: MapDiscoveryMarker[];
  isLoading: boolean;
  error?: string | null;
  onSearchBounds?: (bounds: DiscoveryMapBounds) => void;
  origin?: Pick<MarketplaceMapViewport, "latitude" | "longitude">;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(markers[0]?.id ?? null);
  const routePreview = useMarketplaceRoutePreviewMutation();
  const resetRoutePreview = routePreview.reset;

  useEffect(() => {
    if (!markers.length) {
      setSelectedId(null);
      return;
    }

    setSelectedId((current) => current && markers.some((marker) => marker.id === current) ? current : markers[0].id);
  }, [markers]);

  const selectedMarker = markers.find((marker) => marker.id === selectedId) ?? markers[0] ?? null;

  useEffect(() => {
    resetRoutePreview();
  }, [origin?.latitude, origin?.longitude, resetRoutePreview, selectedId]);

  return (
    <Card className="rounded-[36px] p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="surface-label">Map discovery</p>
          <p className="mt-2 text-sm text-white/58">List and map now share one activation-aware discovery source of truth, including featured and trusted profiles.</p>
        </div>
        <MapPinned className="h-5 w-5 text-[#d9f985]" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.04fr_0.96fr]">
        <div className="order-2 space-y-4 lg:order-1">
          {isLoading && !markers.length ? (
            <div className="grid min-h-[320px] gap-3 rounded-[30px] border border-white/8 bg-black/30 p-4 sm:grid-cols-2">
              <MarkerSkeleton />
              <MarkerSkeleton />
              <MarkerSkeleton />
            </div>
          ) : (
            <MapboxDiscoveryCanvas
              markers={markers}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onSearchBounds={onSearchBounds}
              routeCoordinates={routePreview.data?.geometry.coordinates}
            />
          )}
          {selectedMarker ? (
            <div className="rounded-[24px] border border-white/8 bg-black/25 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{selectedMarker.label}</p>
                  <p className="mt-2 text-sm text-white/58">{selectedMarker.shopName ?? "Independent route coverage"}</p>
                </div>
                <span className="status-pill text-[#e4f9b8]">{selectedMarker.kind === "shop" ? "Shop" : "Barber"}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] border border-white/8 bg-black/30 px-3 py-3 text-sm text-white/72">Rating {selectedMarker.rating.toFixed(1)}</div>
                <div className="rounded-[18px] border border-white/8 bg-black/30 px-3 py-3 text-sm text-white/72">{selectedMarker.priceRangeLabel}</div>
                <div className="rounded-[18px] border border-white/8 bg-black/30 px-3 py-3 text-sm text-white/72">{selectedMarker.distanceMiles === undefined ? dateLabel(selectedMarker.nextAvailableAt) : `${selectedMarker.distanceMiles.toFixed(1)} mi`}</div>
              </div>
              {selectedMarker.driveTimeMinutes ? (
                <div className="mt-3 rounded-[18px] border border-[#C4F24E]/14 bg-[#C4F24E]/[0.055] px-3 py-3 text-sm text-white/72">
                  About {selectedMarker.driveTimeMinutes} min by car
                  {selectedMarker.driveDistanceMiles ? ` · ${selectedMarker.driveDistanceMiles.toFixed(1)} road mi` : ""}
                </div>
              ) : null}
              {routePreview.data ? (
                <div role="status" className="mt-3 rounded-[18px] border border-[#C4F24E]/18 bg-[#C4F24E]/[0.07] px-3 py-3 text-sm text-white/72">
                  Route overview: about {routePreview.data.durationMinutes} min · {routePreview.data.distanceMiles.toFixed(1)} road mi.
                  <span className="mt-1 block text-xs text-white/48">Overview only. Open Apple Maps or Google Maps for live navigation.</span>
                </div>
              ) : null}
              {routePreview.error ? (
                <div role="status" className="mt-3 rounded-[18px] border border-red-400/20 bg-red-500/[0.07] px-3 py-3 text-sm text-red-100">
                  {routePreview.error instanceof Error ? routePreview.error.message : "The route preview is unavailable."}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {selectedMarker.featuredLabel ? <span className="status-pill text-[#C9A24D]">{selectedMarker.featuredLabel}</span> : null}
                {selectedMarker.trustLabel ? <span className="status-pill text-white/72">{selectedMarker.trustLabel}</span> : null}
                {selectedMarker.cityLabel ? <span className="status-pill text-white/72">{selectedMarker.cityLabel}</span> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {origin ? (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#C4F24E]/30 bg-[#C4F24E]/8 px-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#e4f9b8] disabled:cursor-wait disabled:opacity-55"
                    disabled={routePreview.isPending}
                    onClick={() => routePreview.mutate({ markerId: selectedMarker.id, origin })}
                  >
                    {routePreview.isPending ? "Loading route..." : routePreview.data ? "Refresh route" : "Preview route"}
                    <RouteIcon className="h-4 w-4" />
                  </button>
                ) : null}
                {selectedMarker.username ? (
                  <Link
                    href={`/${selectedMarker.kind === "shop" ? "shop" : "barber"}/${selectedMarker.username}` as Route}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/14 bg-black/35 px-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white"
                  >
                    View profile
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : null}
                {selectedMarker.bookingHref ? (
                  <Link href={selectedMarker.bookingHref as Route} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#e0f6a0]/40 bg-[#C4F24E] px-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-black">
                    Book
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : null}
                <a
                  href={`https://maps.apple.com/?daddr=${encodeURIComponent(`${selectedMarker.latitude},${selectedMarker.longitude}`)}&dirflg=d`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/14 bg-black/35 px-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white"
                >
                  Apple Maps
                  <Navigation className="h-4 w-4" />
                </a>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${selectedMarker.latitude},${selectedMarker.longitude}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/14 bg-black/35 px-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white"
                >
                  Google Maps
                  <MapPinned className="h-4 w-4" />
                </a>
                <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed border-white/10 px-4 text-[10px] uppercase tracking-[0.14em] text-white/38" title="Messaging opens after a verified relationship or booking thread exists.">
                  <MessageCircle className="h-4 w-4" />
                  Message after booking
                </span>
              </div>
            </div>
          ) : null}
        </div>
        <div className="order-1 space-y-3 lg:order-2">
          {error ? <FeedbackBanner tone="error" message={error} /> : null}
          {isLoading && !markers.length ? (
            <>
              <MarkerSkeleton />
              <MarkerSkeleton />
              <MarkerSkeleton />
            </>
          ) : markers.length ? markers.slice(0, 6).map((marker) => (
            <button
              key={marker.id}
              type="button"
              className={`block w-full rounded-[24px] border p-4 text-left transition ${marker.id === selectedId ? "border-[#C4F24E]/24 bg-[#C4F24E]/8" : "border-white/8 bg-black/20 hover:border-[#C4F24E]/18 hover:bg-black/30"}`}
              onClick={() => setSelectedId(marker.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{marker.label}</p>
                <span className="status-pill text-[#e4f9b8]">{marker.kind === "shop" ? "Shop pin" : "Barber pin"}</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Rating {marker.rating.toFixed(1)}</div>
                <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">{marker.priceRangeLabel}</div>
                <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">{dateLabel(marker.nextAvailableAt)}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {marker.featuredLabel ? <span className="status-pill text-[#e4f9b8]">{marker.featuredLabel}</span> : null}
                {marker.trustLabel ? <span className="status-pill text-white/72">{marker.trustLabel}</span> : null}
              </div>
            </button>
          )) : (
            <div className="empty-state-panel rounded-[24px] p-5 text-sm text-white/55">No visible markers matched this filter set.</div>
          )}
        </div>
      </div>
    </Card>
  );
}



