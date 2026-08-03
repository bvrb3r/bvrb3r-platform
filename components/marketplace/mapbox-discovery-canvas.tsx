"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FeatureCollection, LineString, Point } from "geojson";
import mapboxgl from "mapbox-gl";
import { Crosshair } from "lucide-react";
import type { MapDiscoveryMarker } from "@/types/domain";

export type DiscoveryMapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type MarkerProperties = {
  id: string;
  selected: boolean;
  sponsored: boolean;
  availability: "available" | "unavailable" | "unknown";
  kind: string;
};

function hasValidCoordinate(marker: MapDiscoveryMarker) {
  return Number.isFinite(marker.longitude)
    && Number.isFinite(marker.latitude)
    && marker.longitude >= -180
    && marker.longitude <= 180
    && marker.latitude >= -90
    && marker.latitude <= 90;
}

function markerCollection(markers: MapDiscoveryMarker[], selectedId: string | null): FeatureCollection<Point, MarkerProperties> {
  return {
    type: "FeatureCollection",
    features: markers.filter(hasValidCoordinate).map((marker) => ({
      type: "Feature",
      id: marker.id,
      geometry: {
        type: "Point",
        coordinates: [marker.longitude, marker.latitude]
      },
      properties: {
        id: marker.id,
        selected: marker.id === selectedId,
        sponsored: Boolean(marker.featuredLabel),
        availability: marker.availableNow === true
          ? "available"
          : marker.availableNow === false
            ? "unavailable"
            : "unknown",
        kind: marker.kind
      }
    }))
  };
}

function routeCollection(coordinates?: Array<[number, number]>): FeatureCollection<LineString> {
  const valid = coordinates?.filter(([longitude, latitude]) =>
    Number.isFinite(longitude)
    && Number.isFinite(latitude)
    && longitude >= -180
    && longitude <= 180
    && latitude >= -90
    && latitude <= 90
  ) ?? [];
  return {
    type: "FeatureCollection",
    features: valid.length === coordinates?.length && valid.length >= 2
      ? [{
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: valid }
        }]
      : []
  };
}

export function MapboxDiscoveryCanvas({
  markers,
  selectedId,
  onSelect,
  onSearchBounds,
  routeCoordinates
}: {
  markers: MapDiscoveryMarker[];
  selectedId: string | null;
  onSelect: (markerId: string) => void;
  onSearchBounds?: (bounds: DiscoveryMapBounds) => void;
  routeCoordinates?: Array<[number, number]>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const fittedRef = useRef(false);
  const descriptionId = useId();
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [pendingBounds, setPendingBounds] = useState<DiscoveryMapBounds | null>(null);
  const collection = useMemo(() => markerCollection(markers, selectedId), [markers, selectedId]);
  const previewRoute = useMemo(() => routeCollection(routeCoordinates), [routeCoordinates]);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? "";

  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;

    mapboxgl.accessToken = token;
    try {
      const initialMarker = markers.find(hasValidCoordinate);
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: process.env.NEXT_PUBLIC_MAPBOX_STYLE_DARK?.trim() || "mapbox://styles/mapbox/dark-v11",
        center: initialMarker ? [initialMarker.longitude, initialMarker.latitude] : [-82.4572, 27.9506],
        zoom: initialMarker ? 11 : 9,
        attributionControl: true
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        map.addSource("bvrb3r-route-preview", {
          type: "geojson",
          data: previewRoute
        });
        map.addLayer({
          id: "bvrb3r-route-preview-line",
          type: "line",
          source: "bvrb3r-route-preview",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#C4F24E",
            "line-opacity": 0.82,
            "line-width": 5
          }
        });
        map.addSource("bvrb3r-marketplace", {
          type: "geojson",
          data: collection,
          cluster: true,
          clusterMaxZoom: 15,
          clusterRadius: 46
        });
        map.addLayer({
          id: "bvrb3r-clusters",
          type: "circle",
          source: "bvrb3r-marketplace",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#C4F24E",
            "circle-radius": ["step", ["get", "point_count"], 18, 10, 23, 30, 29],
            "circle-stroke-color": "#090A0B",
            "circle-stroke-width": 3
          }
        });
        map.addLayer({
          id: "bvrb3r-cluster-count",
          type: "symbol",
          source: "bvrb3r-marketplace",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 11
          },
          paint: { "text-color": "#090A0B" }
        });
        map.addLayer({
          id: "bvrb3r-listing-pins",
          type: "circle",
          source: "bvrb3r-marketplace",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "case",
              ["==", ["get", "selected"], true], "#C4F24E",
              ["==", ["get", "sponsored"], true], "#C9A24D",
              ["==", ["get", "availability"], "available"], "#C4F24E",
              ["==", ["get", "availability"], "unavailable"], "#F0563C",
              "rgba(245,241,232,0.55)"
            ],
            "circle-radius": ["case", ["==", ["get", "selected"], true], 12, 8],
            "circle-stroke-color": "#090A0B",
            "circle-stroke-width": 3
          }
        });

        map.on("click", "bvrb3r-clusters", (event) => {
          const feature = map.queryRenderedFeatures(event.point, { layers: ["bvrb3r-clusters"] })[0];
          const clusterId = Number(feature?.properties?.cluster_id);
          const source = map.getSource("bvrb3r-marketplace") as mapboxgl.GeoJSONSource | undefined;
          const coordinates = feature?.geometry.type === "Point"
            ? feature.geometry.coordinates as [number, number]
            : null;
          if (!source || !Number.isFinite(clusterId) || !coordinates) return;
          source.getClusterExpansionZoom(clusterId, (error, zoom) => {
            if (error || zoom === null || zoom === undefined) return;
            map.easeTo({ center: coordinates, zoom });
          });
        });
        map.on("click", "bvrb3r-listing-pins", (event) => {
          const markerId = event.features?.[0]?.properties?.id;
          if (typeof markerId === "string") onSelect(markerId);
        });
        ["bvrb3r-clusters", "bvrb3r-listing-pins"].forEach((layer) => {
          map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
        });
        map.on("moveend", () => {
          const bounds = map.getBounds();
          if (!bounds) return;
          setPendingBounds({
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth()
          });
        });
        setMapReady(true);
      });
      map.on("error", () => setMapError("The map style could not be loaded. Check the restricted Mapbox token and style access."));
    } catch {
      setMapError("The interactive map is unavailable on this device.");
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      fittedRef.current = false;
      setMapReady(false);
    };
    // Initialization is deliberately token-bound. Marker changes update the
    // existing source in the separate effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const source = map.getSource("bvrb3r-marketplace") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(collection);
    if (!fittedRef.current && markers.length) {
      const bounds = new mapboxgl.LngLatBounds();
      const validMarkers = markers.filter(hasValidCoordinate);
      validMarkers.forEach((marker) => bounds.extend([marker.longitude, marker.latitude]));
      if (validMarkers.length) {
        map.fitBounds(bounds, { padding: 52, maxZoom: 14, duration: 0 });
        fittedRef.current = true;
      }
    }
  }, [collection, mapReady, markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const source = map.getSource("bvrb3r-route-preview") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(previewRoute);
    if (!routeCoordinates || routeCoordinates.length < 2) return;
    const bounds = new mapboxgl.LngLatBounds();
    routeCoordinates.forEach((coordinate) => bounds.extend(coordinate));
    map.fitBounds(bounds, { padding: 64, maxZoom: 14, duration: 350 });
  }, [mapReady, previewRoute, routeCoordinates]);

  if (!token) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-[24px] border border-dashed border-white/12 bg-black/45 p-6 text-center">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#C9A24D]">Map honestly gated</p>
          <p className="mt-3 max-w-md text-sm leading-7 text-white/60">
            Configure the URL-restricted public Mapbox token to render this verified Supabase result set. No token is embedded in source code.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[320px] overflow-hidden rounded-[24px] border border-white/10 bg-black sm:min-h-[360px]">
      <p id={descriptionId} className="sr-only">
        Use the adjacent listing buttons for a keyboard-accessible view of every visible map result. Map movement never changes results until Search this area is selected.
      </p>
      <div
        ref={containerRef}
        className="absolute inset-0"
        role="region"
        aria-label="Interactive marketplace map"
        aria-describedby={descriptionId}
        aria-busy={!mapReady}
      />
      {mapError ? (
        <div role="status" className="absolute inset-x-4 bottom-4 rounded-2xl border border-red-400/25 bg-black/90 p-3 text-xs text-red-100">
          {mapError}
        </div>
      ) : null}
      {pendingBounds && onSearchBounds ? (
        <button
          type="button"
          className="absolute left-1/2 top-4 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-[#C4F24E]/35 bg-[#090A0B]/95 px-4 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#C4F24E] shadow-xl"
          onClick={() => {
            onSearchBounds(pendingBounds);
            setPendingBounds(null);
          }}
        >
          <Crosshair className="h-4 w-4" />
          Search this area
        </button>
      ) : null}
    </div>
  );
}
