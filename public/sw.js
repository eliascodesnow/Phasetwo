// PhaseTwo service worker: works offline, shows period reminders and opens the app when tapped.
// The build fills in VERSION and BUILD_FILES (see vite.config.ts), so every release precaches exactly its own files.
const VERSION = "dev";
const BUILD_FILES = [];
const CACHE = `phasetwo-static-${VERSION}`;
const FONTS = "phasetwo-fonts-v1";
const SHELL = ["/", "/privacy", "/terms", "/favicon.ico", "/favicon-32x32.png", "/favicon-16x16.png", "/apple-touch-icon.png", "/android-chrome-192x192.png", "/android-chrome-512x512.png", "/site.webmanifest", "/phasetwo-mark.svg"];

// Download the whole app once, so the next visit (even with no connection) opens straight from the device.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled([...new Set([...SHELL, ...BUILD_FILES])].map((url) => cache.add(new Request(url, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("phasetwo-static-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Pages: network first (so releases arrive quickly), but fall back to the saved app when offline or the connection is slow.
function handleNavigation(request) {
  return caches.open(CACHE).then((cache) => {
    const saved = () => cache.match(request, { ignoreSearch: true }).then((hit) => hit || cache.match("/"));
    const network = fetch(request).then((response) => {
      if (response && response.ok && response.type === "basic") cache.put(request.url.includes("?") ? "/" : request, response.clone());
      return response;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, 4000, null));
    return Promise.race([network, timeout.then(saved)]).catch(saved).then((response) => response || saved());
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(handleNavigation(request));
    return;
  }

  const font = url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com";
  const sameOriginAsset = url.origin === self.location.origin && (url.pathname.startsWith("/assets/") || /\.(png|ico|svg|webmanifest|html)$/.test(url.pathname));
  if (!sameOriginAsset && !font) return;

  event.respondWith(
    caches.open(font ? FONTS : CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response && (response.ok || response.type === "opaque")) cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        // Hashed build files never change, so the saved copy wins; fonts and icons refresh quietly in the background.
        return cached || network;
      }),
    ),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  event.waitUntil(
    self.registration.showNotification(data.title || "PhaseTwo", {
      body: data.body || "",
      icon: "/android-chrome-192x192.png",
      badge: "/favicon-32x32.png",
      tag: data.tag || "phasetwo-reminder",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
