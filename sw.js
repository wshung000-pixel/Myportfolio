const CACHE = 'asset-tracker-v1';
const SHELL = ['./'];   // index.html 的別名；視伺服器設定可改成 ['index.html']

/* ── 安裝：預先快取 app shell ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

/* ── 啟動：清除舊版快取 ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── 攔截請求：cache-first，成功後背景更新 ── */
self.addEventListener('fetch', e => {
  // 只處理同源的 GET，外部 API（股價、匯率）讓瀏覽器自己處理
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      const fetchPromise = fetch(e.request)
        .then(res => {
          if (res && res.status === 200) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => null);

      // 有快取就先回傳，同時背景更新；無快取就等網路
      return cached || fetchPromise;
    })
  );
});
