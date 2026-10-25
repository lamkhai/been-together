// Service worker: lưu sẵn các file của app để mở được khi không có mạng.
// MỖI LẦN SỬA CODE: tăng VERSION (và VERSION trong js/app.js) để điện thoại tải bản mới.
const VERSION = '1.1.0';
const CACHE = 'ben-nhau-' + VERSION;
const FILES = [
  './', './index.html', './app.css', './manifest.webmanifest',
  './js/app.js', './js/backup.js', './js/dates.js', './js/db.js', './js/editor.js',
  './js/model.js', './js/photos.js', './js/render.js', './js/sync.js', './js/ui.js',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ben-nhau-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return; // gọi Apps Script: đi thẳng ra mạng
  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (err) {
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
