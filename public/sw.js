/* Service worker: app-shell caching + runtime cache for audio/images + study reminder support */
const SHELL_CACHE = 'fala-shell-v1'
const RUNTIME_CACHE = 'fala-runtime-v1'
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return

  // Audio files and images from storage: cache-first so they work offline
  // and only ever download once per device ("downloaded and retained").
  const isMedia =
    url.pathname.match(/\.(mp3|ogg|wav|m4a|png|jpg|jpeg|webp|gif)$/i) ||
    url.pathname.includes('/storage/v1/object/public/')
  if (isMedia) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const hit = await cache.match(event.request)
        if (hit) return hit
        const resp = await fetch(event.request)
        if (resp.ok) cache.put(event.request, resp.clone())
        return resp
      })
    )
    return
  }

  // Never cache API calls (supabase rest/auth/functions, anthropic)
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/') ||
      url.pathname.includes('/functions/v1/') || url.hostname.includes('anthropic')) {
    return
  }

  // App shell: network-first with cache fallback (so updates arrive, but offline works)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp.ok) {
            const clone = resp.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, clone))
          }
          return resp
        })
        .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/')))
    )
  }
})

// Daily study reminder via message from the page or periodic sync where available
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'show-reminder') {
    self.registration.showNotification('Time to study Portuguese! 🇧🇷', {
      body: event.data.body || 'Keep your streak going — review your words for a few minutes.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'daily-study-reminder',
    })
  }
})

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'study-reminder') {
    event.waitUntil(
      self.registration.showNotification('Time to study Portuguese! 🇧🇷', {
        body: 'Keep your streak going — review your words for a few minutes.',
        icon: '/icons/icon-192.png',
        tag: 'daily-study-reminder',
      })
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow('/')
    })
  )
})
