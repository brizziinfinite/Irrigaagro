// IrrigaAgro Service Worker
// Estratégias:
//   - BYPASS: tudo que passa por *.supabase.co (nunca cachear dados do banco)
//   - cache-first: assets estáticos (_next/static, icons, manifest)
//   - network-first: HTML/navegação (sempre tenta rede; offline.html como fallback)

const CACHE_NAME = 'irrigaagro-v1'
const OFFLINE_URL = '/offline.html'
const STATIC_ASSETS = [
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 1. BYPASS: Supabase (nunca interceptar — auth, RLS, realtime dependem de rede)
  if (url.hostname.includes('supabase.co')) {
    return
  }

  // 2. BYPASS: rotas de API internas do Next.js
  if (url.pathname.startsWith('/api/')) {
    return
  }

  // 3. Cache-first: assets estáticos do Next.js (_next/static, fontes, icons)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // 4. Network-first: HTML / navegação
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || new Response('Offline', { status: 503 }))
      )
    )
    return
  }

  // 5. Default: network only (deixa passar sem interferir)
})
