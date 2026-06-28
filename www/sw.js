/* Penalty Kings — service worker (offline support) */
const CACHE = "pk-v7";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=1.1.2",
  "./manifest.webmanifest",
  "./js/teams.js?v=1.1.2",
  "./js/tournament.js?v=1.1.2",
  "./js/shootout.js?v=1.1.2",
  "./js/store.js?v=1.1.2",
  "./js/game.js?v=1.1.2",
  "./favicon.png",
  "./apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        if (res && res.ok && res.type === "basic") {   // only cache our own successful responses
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match("./index.html").then(
        (r) => r || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
      ))
    )
  );
});
