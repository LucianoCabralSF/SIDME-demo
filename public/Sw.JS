// ── SIDME Service Worker — PWA Offline ──────────────────────────────────────
const CACHE_NAME = 'sidme-v1';

// Recursos que serão cacheados na instalação
const PRECACHE_URLS = [
  // App shells
  '/',
  '/index.html',

  // React + libs
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/recharts@2.12.7/umd/Recharts.js',
  'https://unpkg.com/prop-types@15.8.1/prop-types.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',

  // CSS / Fonts
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap',
];

// ── INSTALL: pré-cacheia tudo que conseguir ──
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Tenta cachear cada URL individualmente para não falhar tudo se uma der erro
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(() => {
            console.warn('[SW] Não foi possível cachear:', url);
          })
        )
      );
    })
  );
});

// ── ACTIVATE: remove caches antigos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Cache-first para libs, Network-first para dados ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignora requisições que não são GET
  if (event.request.method !== 'GET') return;

  // Ignora a API do Google Apps Script (dados reais — sempre online)
  if (url.hostname.includes('script.google.com')) return;

  // Ignora requisições de analytics / tracking
  if (url.hostname.includes('google-analytics') || url.hostname.includes('googletagmanager')) return;

  // ── Estratégia: Cache-first para libs estáticas (CDN) ──
  const isStatic =
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('cdn.tailwindcss.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com');

  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached); // se offline e não tiver cache, retorna o que tiver
      })
    );
    return;
  }

  // ── Estratégia: Network-first para o HTML principal ──
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // ── Estratégia: Stale-while-revalidate para o resto ──
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
      return cached || networkFetch;
    })
  );
});
