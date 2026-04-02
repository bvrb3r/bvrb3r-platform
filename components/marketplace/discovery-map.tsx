"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, MapPinned } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { Skeleton } from "@/components/ui/skeleton";
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

function normalizePosition(value: number, min: number, max: number) {
  if (max === min) {
    return 50;
  }

  return 12 + ((value - min) / (max - min)) * 76;
}

export function DiscoveryMapPanel({ markers, isLoading, error }: { markers: MapDiscoveryMarker[]; isLoading: boolean; error?: string | null; }) {
  const [selectedId, setSelectedId] = useState<string | null>(markers[0]?.id ?? null);

  useEffect(() => {
    if (!markers.length) {
      setSelectedId(null);
      return;
    }

    setSelectedId((current) => current && markers.some((marker) => marker.id === current) ? current : markers[0].id);
  }, [markers]);

  const selectedMarker = markers.find((marker) => marker.id === selectedId) ?? markers[0] ?? null;
  const bounds = useMemo(() => {
    if (!markers.length) {
      return { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 };
    }

    return {
      minLat: Math.min(...markers.map((marker) => marker.latitude)),
      maxLat: Math.max(...markers.map((marker) => marker.latitude)),
      minLng: Math.min(...markers.map((marker) => marker.longitude)),
      maxLng: Math.max(...markers.map((marker) => marker.longitude))
    };
  }, [markers]);

  return (
    <Card className="rounded-[36px] p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="surface-label">Map discovery</p>
          <p className="mt-2 text-sm text-white/58">List and map now share one activation-aware discovery source of truth, including featured and trusted profiles.</p>
        </div>
        <MapPinned className="h-5 w-5 text-[#baff69]" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.04fr_0.96fr]">
        <div className="order-2 relative min-h-[280px] overflow-hidden rounded-[30px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(124,255,0,0.14),rgba(8,8,8,0.98))] p-4 sm:min-h-[320px] lg:order-1 lg:min-h-[360px]">
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:48px_48px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(124,255,0,0.12),transparent_24%),radial-gradient(circle_at_74%_62%,rgba(124,255,0,0.08),transparent_22%)]" />
          {isLoading && !markers.length ? (
            <div className="relative z-10 grid gap-3 sm:grid-cols-2">
              <MarkerSkeleton />
              <MarkerSkeleton />
              <MarkerSkeleton />
            </div>
          ) : markers.length ? (
            <>
              <div className="relative z-10 h-[280px] sm:h-[320px] rounded-[24px] border border-white/8 bg-black/18">
                {markers.map((marker) => {
                  const left = normalizePosition(marker.longitude, bounds.minLng, bounds.maxLng);
                  const top = 100 - normalizePosition(marker.latitude, bounds.minLat, bounds.maxLat);
                  const isActive = marker.id === selectedId;
                  return (
                    <button
                      key={marker.id}
                      type="button"
                      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition ${isActive ? "border-[#cfff93]/70 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] text-black shadow-[0_12px_28px_rgba(124,255,0,0.28)]" : "border-white/14 bg-black/70 text-white hover:border-[#7CFF00]/28 hover:text-[#d7ffab]"}`}
                      style={{ left: `${left}%`, top: `${top}%` }}
                      onClick={() => setSelectedId(marker.id)}
                    >
                      {marker.kind === "shop" ? "Shop" : "Chair"}
                    </button>
                  );
                })}
              </div>
              <div className="relative z-10 mt-4 rounded-[24px] border border-white/8 bg-black/25 p-4">
                {selectedMarker ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold">{selectedMarker.label}</p>
                        <p className="mt-2 text-sm text-white/58">{selectedMarker.shopName ?? "Independent route coverage"}</p>
                      </div>
                      <span className="status-pill text-[#d7ffab]">{selectedMarker.kind === "shop" ? "Shop" : "Barber"}</span>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[18px] border border-white/8 bg-black/30 px-3 py-3 text-sm text-white/72">Rating {selectedMarker.rating.toFixed(1)}</div>
                      <div className="rounded-[18px] border border-white/8 bg-black/30 px-3 py-3 text-sm text-white/72">{selectedMarker.priceRangeLabel}</div>
                      <div className="rounded-[18px] border border-white/8 bg-black/30 px-3 py-3 text-sm text-white/72">{dateLabel(selectedMarker.nextAvailableAt)}</div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedMarker.featuredLabel ? <span className="status-pill text-[#d7ffab]">{selectedMarker.featuredLabel}</span> : null}
                      {selectedMarker.trustLabel ? <span className="status-pill text-white/72">{selectedMarker.trustLabel}</span> : null}
                      {selectedMarker.cityLabel ? <span className="status-pill text-white/72">{selectedMarker.cityLabel}</span> : null}
                    </div>
                    {selectedMarker.bookingHref ? (
                      <Link href={selectedMarker.bookingHref as Route} className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#cfff93]/40 bg-[linear-gradient(135deg,#7cff00_0%,#b7ff58_100%)] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-black shadow-[0_14px_34px_rgba(124,255,0,0.24)] transition hover:translate-y-[-1px] hover:shadow-[0_18px_38px_rgba(124,255,0,0.28)]">
                        Book from map
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    ) : null}
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div className="relative z-10 empty-state-panel rounded-[24px] p-5 text-sm text-white/55">No visible markers matched this filter set.</div>
          )}
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
              className={`block w-full rounded-[24px] border p-4 text-left transition ${marker.id === selectedId ? "border-[#7CFF00]/24 bg-[#7CFF00]/8" : "border-white/8 bg-black/20 hover:border-[#7CFF00]/18 hover:bg-black/30"}`}
              onClick={() => setSelectedId(marker.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{marker.label}</p>
                <span className="status-pill text-[#d7ffab]">{marker.kind === "shop" ? "Shop pin" : "Barber pin"}</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">Rating {marker.rating.toFixed(1)}</div>
                <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">{marker.priceRangeLabel}</div>
                <div className="rounded-[18px] border border-white/8 bg-black/25 px-3 py-3 text-sm text-white/72">{dateLabel(marker.nextAvailableAt)}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {marker.featuredLabel ? <span className="status-pill text-[#d7ffab]">{marker.featuredLabel}</span> : null}
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






