import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ownerSettings = readFileSync(
  "components/operations/owner-settings-workspace.tsx",
  "utf8"
);
const discoveryMap = readFileSync(
  "components/marketplace/discovery-map.tsx",
  "utf8"
);

describe("Mapbox server-rendering boundaries", () => {
  it("loads the address search package only in the browser", () => {
    expect(ownerSettings).toContain("dynamic<ShopAddressMapboxFieldProps>");
    expect(ownerSettings).toContain('import("@/components/marketplace/shop-address-mapbox-field")');
    expect(ownerSettings).toContain("ssr: false");
    expect(ownerSettings).not.toContain(
      'import { ShopAddressMapboxField } from "@/components/marketplace/shop-address-mapbox-field"'
    );
  });

  it("loads mapbox-gl only behind the discovery client boundary", () => {
    expect(discoveryMap).toContain("dynamic<MapboxDiscoveryCanvasProps>");
    expect(discoveryMap).toContain('import("@/components/marketplace/mapbox-discovery-canvas")');
    expect(discoveryMap).toContain("ssr: false");
    expect(discoveryMap).not.toContain(
      'import { MapboxDiscoveryCanvas } from "@/components/marketplace/mapbox-discovery-canvas"'
    );
  });
});
