/**
 * Service worker do Visualizador Geoespacial NGEO/IDEFLOR-Bio.
 *
 * Estratégia:
 * - app shell (HTML, CSS, JS, fontes, ícones e layers.json) em cache;
 * - navegação e layers.json: rede primeiro, cache como reserva;
 * - demais assets do mesmo domínio: cache primeiro, atualizando em segundo plano;
 * - PMTiles e GeoJSON de download: passam direto (preservam Range e não incham o cache);
 * - tiles de mapa de base (outros domínios): passam direto.
 *
 * Ao publicar uma nova versão do app, incremente CACHE_VERSION para renovar o shell.
 */
const CACHE_VERSION = 'ngeo-visualizador-v3-pwa-3';

const PRECACHE = [
  './',
  './index.html',
  './documentacao.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './vendor/maplibre-gl.js',
  './vendor/maplibre-gl-worker.js',
  './vendor/maplibre-gl.css',
  './vendor/pmtiles.js',
  './vendor/sortable.min.js',
  './vendor/shp.min.js',
  './vendor/togeojson.umd.js',
  './data/layers.json',
  './assets/brand-mark.svg',
  './assets/logo-148.png',
  './assets/fonts/rawline/rawline-400.woff2',
  './assets/fonts/rawline/rawline-600.woff2',
  './assets/fonts/rawline/rawline-700.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Tiles de base, fontes externas etc. seguem direto para a rede.
  if (url.origin !== self.location.origin) return;

  // PMTiles usa Range Requests: não interceptar.
  if (req.headers.has('range') || url.pathname.endsWith('.pmtiles')) return;

  // GeoJSON de download é grande e sob demanda: não cachear.
  if (url.pathname.endsWith('.geojson')) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, './index.html'));
    return;
  }

  if (url.pathname.endsWith('/data/layers.json')) {
    event.respondWith(networkFirst(req, null));
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req, fallbackUrl) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await caches.match(req);
    if (hit) return hit;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response('Sem conexão.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await caches.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  return cached || network || new Response('', { status: 504 });
}
