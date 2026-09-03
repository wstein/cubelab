// Keep one cache across service-worker revisions. A new shell replaces its HTML
// entries at install time while previously downloaded hashed assets stay available
// for an already-open version when the device goes offline mid-update.
const CACHE = "cubelab-app-shell";
const APP_SHELL = [
  "/",
  "/academy/",
  "/workbench/",
  "/patterns/",
  "/timer/",
  "/player/",
  "/manifest.webmanifest",
  "/favicon.png",
  "/favicon.svg",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) void caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) void caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
          return response;
        }),
    ),
  );
});
