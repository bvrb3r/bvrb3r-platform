import { readFileSync } from "node:fs";
import path from "node:path";

describe("pwa service worker compatibility guard", () => {
  const serviceWorkerSource = readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");

  it("keeps authenticated and sensitive navigations out of the offline HTML cache", () => {
    expect(serviceWorkerSource).toContain("SENSITIVE_NAVIGATION_PREFIXES");
    expect(serviceWorkerSource).toContain('"/dashboard"');
    expect(serviceWorkerSource).toContain('"/architect"');
    expect(serviceWorkerSource).toContain('"/messages"');
    expect(serviceWorkerSource).toContain('"/settings"');
    expect(serviceWorkerSource).toContain('"/checkout"');
    expect(serviceWorkerSource).toContain('"/kiosk"');
    expect(serviceWorkerSource).toContain("isCacheableAppShellNavigation(url.pathname) ? networkFirst(request) : networkOnlyWithOfflineFallback(request)");
  });

  it("uses network-only fallback for private HTML navigations instead of caching them", () => {
    const privateNavigationFallback = serviceWorkerSource.match(/async function networkOnlyWithOfflineFallback[\s\S]*?\n}/)?.[0] ?? "";

    expect(privateNavigationFallback).toContain("return await fetch(request)");
    expect(privateNavigationFallback).toContain('cache.match("/offline")');
    expect(privateNavigationFallback).not.toContain("cache.put");
  });

  it("limits cached HTML shell navigations to public app-shell routes", () => {
    expect(serviceWorkerSource).toContain("CACHEABLE_NAVIGATION_PATHS");
    expect(serviceWorkerSource).toContain('"/"');
    expect(serviceWorkerSource).toContain('"/offline"');
    expect(serviceWorkerSource).toContain('"/discover"');
    expect(serviceWorkerSource).toContain('"/booking/new"');
    expect(serviceWorkerSource).not.toContain('"/dashboard/client"');
    expect(serviceWorkerSource).not.toContain('"/architect/finance"');
  });
});
