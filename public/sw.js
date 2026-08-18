const CACHE = 'bmail-v1'
const STATIC = [
  '/base.css', '/inbox.css', '/message.css', '/compose.css',
  '/settings.css', '/login.css',
  '/inbox.js', '/message.js', '/compose.js', '/settings.js',
  '/login.js', '/sent.js', '/crypto-worker.js', '/sw-register.js',
  '/favicon.svg', '/bmail_logo2.png'
]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Network-first for HTML and API — always want fresh email content
  if (request.headers.get('Accept')?.includes('text/html') || url.pathname.startsWith('/api/')) return
  // Cache-first for static assets
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()))
        return res
      })
    })
  )
})
