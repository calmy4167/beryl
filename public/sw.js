/* Beryl PWA Service Worker（v2 阶段 5）
 * 策略：network-first + 运行时缓存 + index.html 兜底。
 * 离线时页面可打开（内容来自缓存），数据仍在本地（localStorage/IndexedDB）。
 */
const CACHE = 'beryl-cache-v2'
const PRECACHE_URLS = ['./', './index.html', './manifest.webmanifest', './icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => Promise.all(PRECACHE_URLS.map(url => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.includes('/api/')) return

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(req, clone))
        }
        return res
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit
          // 离线 + 未缓存：回退到应用外壳（hash 路由，所有路径都能走 index.html）
          return caches.match('./index.html')
        })
      )
  )
})
