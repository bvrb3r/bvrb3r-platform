import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMapboxAddressFeature as parsePermanentMapboxAddressFeature } from "@/lib/marketplace/mapbox-geocoding";
import { coarsenMarketplaceOrigin } from "@/lib/marketplace/client";
import { orderMapMarkersByPostgis } from "@/lib/marketplace/postgis-map";
import type { MapDiscoveryMarker } from "@/types/domain";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const markers: MapDiscoveryMarker[] = [
  {
    id: "barber-barber-two",
    kind: "barber",
    label: "Two",
    latitude: 1,
    longitude: 1,
    rating: 4.8,
    priceRangeLabel: "$40 - $60",
    nextAvailableAt: "2026-08-04T15:00:00.000Z"
  },
  {
    id: "barber-barber-one",
    kind: "barber",
    label: "One",
    latitude: 2,
    longitude: 2,
    rating: 4.9,
    priceRangeLabel: "$45 - $65",
    nextAvailableAt: "2026-08-04T14:00:00.000Z"
  },
  {
    id: "shop-location-one",
    kind: "shop",
    label: "Shop One",
    latitude: 3,
    longitude: 3,
    rating: 4.9,
    priceRangeLabel: "$40 - $65",
    nextAvailableAt: "2026-08-04T14:00:00.000Z"
  }
];

describe("Product PR39 Mapbox + PostGIS stack", () => {
  it("uses PostGIS order and coordinates instead of letting the renderer rank listings", () => {
    const ordered = orderMapMarkersByPostgis(markers, [
      {
        listing_type: "barber",
        listing_reference: "barber-one",
        location_id: "location-one",
        public_username: "barber-one",
        latitude: 27.95,
        longitude: -82.45,
        distance_miles: 1.2,
        available_now: true,
        sponsored: false,
        bvrb3r_rank: 93
      },
      {
        listing_type: "shop",
        listing_reference: "shop-one",
        location_id: "location-one",
        public_username: "shop-one",
        latitude: 27.951,
        longitude: -82.451,
        distance_miles: 1.4,
        available_now: true,
        sponsored: false,
        bvrb3r_rank: 90
      }
    ]);
    expect(ordered.map((marker) => marker.id)).toEqual(["barber-barber-one", "shop-location-one"]);
    expect(ordered[0]).toMatchObject({
      latitude: 27.95,
      longitude: -82.45,
      distanceMiles: 1.2,
      availableNow: true
    });
  });

  it("extends the canonical locations table with indexed geography and hard privacy tiers", () => {
    const migration = read("supabase/migrations/20260803073233_product_pr39_postgis_marketplace.sql");
    expect(migration).toContain("create extension if not exists postgis with schema extensions");
    expect(migration).toContain("geo_point extensions.geography(point, 4326)");
    expect(migration).toContain("using gist (geo_point)");
    expect(migration).toContain("locations_hidden_coordinate_ck");
    expect(migration).toContain("or (geo_point is null and latitude is null and longitude is null)");
    expect(migration).toContain("locations_geo_point_consistency_ck");
    expect(migration).toContain("set geo_point = null,\n    latitude = null,\n    longitude = null");
    expect(migration).toContain("PR39 requires PostGIS to be installed in the extensions schema.");
    expect(migration).toContain("round(p_longitude::numeric, 3)");
    expect(migration).toContain("round(p_latitude::numeric, 3)");
    expect(migration).toContain("extensions.st_makepoint(saved_longitude, saved_latitude)");
    expect(migration).toContain("pr39_nearby_marketplace");
    expect(migration).toContain("coalesce(p_radius_miles, 25) between 0.25 and 50");
    expect(migration).toContain("coalesce(p_limit, 80) between 1 and 100");
    expect(migration).toContain("p_west < p_east");
    expect(migration).toContain(") from public, anon, authenticated;");
    expect(migration).toContain(") to service_role;");
    expect(migration).toContain("pr39_guard_location_geo_authority");
    expect(migration).toContain("before insert or update on public.locations");
    expect(migration).toContain("new.geo_point is distinct from old.geo_point");
    expect(migration).toContain("old.location_verified");
    expect(migration).toContain("Supabase filters and ranks; Mapbox only renders");
  });

  it("keeps temporary suggestions out of storage and permanent geocoding on the server", () => {
    const field = read("components/marketplace/shop-address-mapbox-field.tsx");
    const route = read("app/api/marketplace/locations/[shopId]/geocode/route.ts");
    const service = read("lib/marketplace/mapbox-geocoding.ts");
    expect(field).toContain("Suggestions stay temporary");
    expect(field).toContain("NEXT_PUBLIC_MAPBOX_TOKEN");
    expect(field).not.toContain("MAPBOX_SERVER_TOKEN");
    expect(service).toContain("MAPBOX_SERVER_TOKEN");
    expect(service).toContain('url.searchParams.set("permanent", "true")');
    expect(service).toContain('url.searchParams.set("autocomplete", "false")');
    expect(route).toContain("createSupabaseAdminClient");
    expect(route).toContain('admin.rpc("pr39_save_verified_shop_location"');
    expect(route).toContain("pr39_save_verified_shop_location");
    expect(route).not.toContain("NEXT_PUBLIC_MAPBOX_TOKEN");
  });

  it("ships real Mapbox clustering and search-this-area behavior", () => {
    const map = read("components/marketplace/mapbox-discovery-canvas.tsx");
    const route = read("app/api/marketplace/map/route.ts");
    const client = read("lib/marketplace/client.ts");
    const discoverRoute = read("app/discover/page.tsx");
    const clientSearch = read("components/client-experience/client-search-screen.tsx");
    expect(map).toContain('cluster: true');
    expect(map).toContain("getClusterExpansionZoom");
    expect(map).toContain("Search this area");
    expect(map).toContain('"#C4F24E"');
    expect(map).toContain('"#C9A24D"');
    expect(map).toContain('"#F0563C"');
    expect(map).toContain("rgba(245,241,232,0.55)");
    expect(map).toContain('role="region"');
    expect(route).toContain("map_location_required");
    expect(route).toContain('authority: "supabase_postgis"');
    expect(route).not.toContain("legacy_provider");
    expect(client).toContain("enabled: Boolean(viewport)");
    expect(discoverRoute).toContain("ClientSearchScreen");
    expect(clientSearch).toContain("DiscoveryMapPanel");
    expect(clientSearch).toContain("useMarketplaceMap");
    expect(clientSearch).toContain("coarsenMarketplaceOrigin");
    expect(clientSearch).toContain("Show nearby map");
  });

  it("keeps Matrix estimates bounded and Directions limited to an overview", () => {
    const travel = read("lib/marketplace/mapbox-travel.ts");
    const directions = read("lib/marketplace/mapbox-directions.ts");
    const panel = read("components/marketplace/discovery-map.tsx");
    expect(travel).toContain("directions-matrix/v1/mapbox/driving");
    expect(travel).toContain("slice(0, 6)");
    expect(travel).toContain('sources", "0"');
    expect(directions).toContain("directions/v5/mapbox/driving");
    expect(directions).toContain('url.searchParams.set("steps", "false")');
    expect(directions).toContain('url.searchParams.set("overview", "simplified")');
    expect(panel).toContain("Overview only");
    expect(panel).toContain("maps.apple.com");
    expect(panel).toContain("www.google.com/maps/dir");
  });

  it("coarsens device precision before nearby and Matrix requests", () => {
    expect(coarsenMarketplaceOrigin({ latitude: 27.9506123, longitude: -82.4572987 })).toEqual({
      latitude: 27.951,
      longitude: -82.457
    });
  });

  it("accepts only complete US address points from the permanent geocoder", () => {
    const feature = {
      id: "dXJuOm1ieGFkZHI6dmVyaWZpZWQ",
      geometry: { type: "Point", coordinates: [-82.4572, 27.9506] },
      properties: {
        mapbox_id: "dXJuOm1ieGFkZHI6dmVyaWZpZWQ",
        feature_type: "address",
        full_address: "101 Verified Ave, Tampa, Florida 33602, United States",
        coordinates: { accuracy: "rooftop" },
        context: {
          place: { name: "Tampa" },
          region: { name: "Florida", region_code: "FL", region_code_full: "US-FL" },
          postcode: { name: "33602" },
          country: { name: "United States", country_code: "US" }
        }
      }
    };

    expect(parsePermanentMapboxAddressFeature(feature)).toMatchObject({
      city: "Tampa",
      region: "FL",
      postalCode: "33602",
      providerReference: "dXJuOm1ieGFkZHI6dmVyaWZpZWQ"
    });
    expect(parsePermanentMapboxAddressFeature({
      ...feature,
      properties: {
        ...feature.properties,
        context: {
          ...feature.properties.context,
          country: { name: "Canada", country_code: "CA" }
        }
      }
    })).toBeNull();
    expect(parsePermanentMapboxAddressFeature({
      ...feature,
      geometry: { type: "Point", coordinates: [-82.4572, 95] }
    })).toBeNull();
  });
});
