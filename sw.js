const cacheName = 'carecheck-directory-v1';
const assets = ['./', './index.html', './styles.css', './app.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(assets)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('carecheck-directory-') && key !== cacheName)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const saved = await cache.match(event.request);
    if (saved) return saved;
    try {
      return await fetch(event.request);
    } catch (error) {
      if (event.request.mode === 'navigate' && url.pathname === scope.pathname) {
        return (await cache.match('./index.html')) || Response.error();
      }
      return Response.error();
    }
  })());
});
