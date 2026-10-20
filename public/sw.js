// PhaseTwo service worker: shows period reminders and opens the app when tapped.
const CACHE = "phasetwo-static-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("phasetwo-static-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Saves mobile data: hashed build files and web fonts never change, so after the first visit they come from the device.
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOriginAsset = url.origin === self.location.origin && (url.pathname.startsWith("/assets/") || /\.(png|ico|svg|webmanifest)$/.test(url.pathname));
  const font = url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com";
  if (!sameOriginAsset && !font) return;
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response && (response.ok || response.type === "opaque")) cache.put(request, response.clone());
          return response;
        }).catch(() => cached);
        // Fonts and icons refresh quietly in the background; hashed files are final, so the cached copy wins.
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
