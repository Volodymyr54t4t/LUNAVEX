const CACHE_NAME = 'luna-ai-v1.1.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/common.css',
  '/js/home.js',
  '/energy/',
  '/energy/index.html',
  '/radiation/',
  '/radiation/index.html',
  '/thermo/',
  '/thermo/index.html',
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
