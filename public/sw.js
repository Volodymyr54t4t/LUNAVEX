const CACHE_NAME = 'lunavex-explorer-v1.14.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/common.css',
  '/css/platform-navigation.css',
  '/js/home.js',
  '/js/platform-navigation.js',
  '/energy/',
  '/energy/index.html',
  '/radiation/',
  '/radiation/index.html',
  '/thermo/',
  '/thermo/index.html',
  '/explorer/',
  '/explorer/index.html',
  '/explorer/style.css',
  '/explorer/overrides.css',
  '/explorer/features.css',
  '/explorer/script.js',
  '/illumination/',
  '/illumination/index.html',
  '/illumination/style.css',
  '/illumination/script.js',
  '/earthlink/',
  '/earthlink/index.html',
  '/earthlink/style.css',
  '/earthlink/script.js',
  '/account/',
  '/account/index.html',
  '/account/style.css',
  '/account/script.js',
  '/artemis/',
  '/artemis/index.html',
  '/analytics.html',
  '/about.html',
  '/contact.html',
  '/privacy-policy.html',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Інсталяція Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Кеш відкрито');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Активація Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Видаляю старий кеш:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Обробка запитів
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin === self.location.origin && requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Повертаємо з кешу, якщо є
        if (response) {
          return response;
        }

        // Клонування запиту для мережевого запиту
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then((response) => {
          // Перевіряємо, чи це валідна відповідь
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Клонування відповіді для кешування
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(() => {
          // Якщо немає мережі і немає в кеші, повертаємо офлайн сторінку
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Синхронізація в фоні (якщо потрібно)
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Логіка для синхронізації даних в фоні
  console.log('Фонова синхронізація виконана');
}
