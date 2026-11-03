/* Loan Repayment Tracker – service worker
   Makes the app installable and lets it open offline.
   Strategy: network first for the app's own files (so a new deploy shows up straight away),
   falling back to the cache when offline; cache first for Google Fonts.
   Bump VERSION when you want to clear old caches. */
const VERSION = "v4";
const APP_CACHE = "loan-app-" + VERSION;
const FONT_CACHE = "loan-fonts-" + VERSION;
const APP_SHELL = [
  "/",
  "/index.html",
  "/assets/styles.css?v=4",
  "/assets/app.js?v=4",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* Google Fonts: serve from cache, fetch once */
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }))
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  /* App files: network first, cache as fallback (offline) */
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(APP_CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: req.mode === "navigate" }).then((hit) => hit || (req.mode === "navigate" ? caches.match("/index.html") : undefined))
      )
  );
});
