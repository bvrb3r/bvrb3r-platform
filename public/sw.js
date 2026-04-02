const CACHE_NAME = "bvrb3r-app-shell-v3";
const APP_SHELL = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/discover",
  "/booking/new",
  "/barber/wave",
  "/apple-app-site-association",
  "/.well-known/assetlinks.json",
  "/icons/pwa-192.png",
  "/icons/pwa-512.png",
  "/icons/pwa-maskable-512.png",
  "/icons/apple-touch-180.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match("/offline"));
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  return cached || networkPromise || fetch(request);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/operations/") || url.pathname.startsWith("/api/payments/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (
    url.pathname.startsWith("/api/marketplace/")
    || url.pathname === "/api/mobile/deep-links"
    || url.pathname === "/api/mobile/native/bootstrap"
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  const acceptsHtml = request.headers.get("accept")?.includes("text/html");
  if (request.mode === "navigate" || acceptsHtml) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith("/_next/") || /\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {
        title: "BVRB3R Platform",
        body: event.data?.text() ?? "A new update is ready in the app."
      };
    }
  })();

  const title = payload.title ?? "BVRB3R Platform";
  const options = {
    body: payload.body ?? "A new update is ready in the app.",
    icon: "/icons/pwa-192.png",
    badge: "/icons/apple-touch-180.png",
    data: {
      url: payload.webUrl ?? payload.url ?? "/",
      deepLinkUrl: payload.deepLinkUrl ?? null,
      notificationId: payload.notificationId ?? null
    },
    tag: payload.notificationId ?? payload.tag ?? "bvrb3r-notification"
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      if ("focus" in client) {
        if ("navigate" in client) {
          await client.navigate(targetUrl);
        }
        return client.focus();
      }
    }

    return self.clients.openWindow(targetUrl);
  })());
});
