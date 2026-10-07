/* asap – Offline-Cache (Service Worker)
   Wird nur genutzt, wenn die App über eine Web-Adresse läuft (z. B. GitHub Pages).
   Diese Datei gehört in denselben Ordner wie index.html; die App registriert sie
   automatisch. Strategie: sofort aus dem Cache starten und im Hintergrund die neueste
   Version holen (cache: 'no-cache' umgeht den HTTP-Cache von GitHub Pages).
   Ein Update erscheint dadurch spätestens beim zweiten Start. */
const CACHE = 'asap-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil((async () => {
  // Nur eigene, veraltete Caches löschen (andere Apps auf derselben Domain bleiben unberührt).
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith('asap-') && k !== CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isPage = req.mode === 'navigate';
  const key = isPage ? new URL('./', self.registration.scope).href : req;
  const netReq = isPage ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(req, { cache: 'no-cache' });
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(key, { ignoreSearch: true });
    const fresh = fetch(netReq)
      .then((res) => { if (res && res.ok) cache.put(key, res.clone()); return res; })
      .catch(() => cached);
    if (cached) { event.waitUntil(fresh.catch(() => {})); return cached; }
    return fresh;
  }));
});
