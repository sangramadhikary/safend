// Safend service worker: offline shell + bounded caching for public/static resources.
const VERSION = 'v3';
const CACHE_PREFIX = 'safend-';
const SHELL_CACHE = `${CACHE_PREFIX}shell-${VERSION}`;
const STATIC_CACHE = `${CACHE_PREFIX}static-${VERSION}`;
const PRECACHE_URLS = ['/offline', '/favicon.png', '/icon-maskable.png'];
const MAX_STATIC_ENTRIES = 120;
const STATIC_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_MAX_AGE_MS = 60 * 60 * 1000;
const PUBLIC_PAGE_PREFIXES = [
  '/about', '/blog', '/careers', '/contact', '/pricing',
  '/privacy-policy', '/services', '/terms', '/offline',
];
const STATIC_EXTENSIONS = /\.(?:css|js|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf)$/i;
const PORTAL_HOST = /^(?:office|client|ops)\./i;

function isPublicPage(url) {
  if (PORTAL_HOST.test(url.hostname)) return url.pathname === '/offline';
  return url.pathname === '/' || PUBLIC_PAGE_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
}

function responseMayBeCached(response) {
  if (!response || !response.ok || response.type === 'opaque') return false;
  const cacheControl = response.headers.get('cache-control') || '';
  return !/(?:no-store|private)/i.test(cacheControl);
}

function stampedResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sw-cached-at', String(Date.now()));
  return new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function put(cacheName, request, response, maxEntries) {
  if (!responseMayBeCached(response)) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, stampedResponse(response));
  if (!maxEntries) return;
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)));
}
async function freshMatch(cacheName, request, maxAgeMs) {
  const cache = await caches.open(cacheName);
  const response = await cache.match(request);
  if (!response) return undefined;
  const cachedAt = Number(response.headers.get('x-sw-cached-at') || 0);
  if (cachedAt && Date.now() - cachedAt > maxAgeMs) {
    await cache.delete(request);
    return undefined;
  }
  return response;
}

async function cacheFirst(request) {
  const cached = await freshMatch(STATIC_CACHE, request, STATIC_MAX_AGE_MS);
  if (cached) return cached;
  const response = await fetch(request);
  await put(STATIC_CACHE, request, response, MAX_STATIC_ENTRIES);
  return response;
}

async function publicPageNetworkFirst(request) {
  try {
    const response = await fetch(request);
    const finalUrl = new URL(response.url || request.url);
    if (isPublicPage(finalUrl)) await put(SHELL_CACHE, request, response);
    return response;
  } catch {
    return (
      (await freshMatch(SHELL_CACHE, request, PAGE_MAX_AGE_MS)) ||
      (await caches.match('/offline')) ||
      Response.error()
    );
  }
}

async function networkWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match('/offline')) || Response.error();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(PRECACHE_URLS.map(async (url) => {
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (responseMayBeCached(response)) await cache.put(url, stampedResponse(response));
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, STATIC_CACHE].includes(name))
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      isPublicPage(url) ? publicPageNetworkFirst(request) : networkWithOfflineFallback(request),
    );
    return;
  }

  const isStatic = url.pathname.startsWith('/_next/static/') || STATIC_EXTENSIONS.test(url.pathname);
  if (isStatic) event.respondWith(cacheFirst(request));
});
