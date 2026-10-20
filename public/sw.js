/* Arabic Scrabble service worker.
 * The two @@ placeholders below are replaced by scripts/build.mjs (content-hash of every file), so each deploy
 * gets its own cache and an update is detected by the browser comparing sw.js bytes.
 *
 *  - install:    precache every app file (cache:'reload' bypasses the HTTP cache). A missing file fails the install on
 *                purpose, so "ready offline" is only announced when true. Does NOT skipWaiting: the page offers an update
 *                button (game state is autosaved, but we never swap code under a player mid-move).
 *  - navigation: network-first (3 s timeout) so new deploys show up immediately; falls back to the cached shell offline.
 *  - assets:     cache-first from the precache (they are versioned by the cache name).
 *  - fonts:      stale-while-revalidate in a separate runtime cache (Google Fonts CSS + files).
 *  - everything else cross-origin is left to the network. Non-GET and range requests are never touched.
 */
'use strict'
const BUILD = '@@BUILD@@'
const PRECACHE = '@@PRECACHE@@'
const CACHE = `asb-${BUILD}`
const FONTS = 'asb-fonts'
const SHELL = '/index.html'
const FILES = PRECACHE.startsWith('@@') ? [] : JSON.parse(PRECACHE)

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    await cache.addAll(FILES.map(u => new Request(u, { cache: 'reload' })))
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('asb-') && k !== CACHE && k !== FONTS) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('message', event => { if (event.data === 'SKIP_WAITING') self.skipWaiting() })

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET' || request.headers.has('range')) return
  const url = new URL(request.url)
  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') event.respondWith(navigation(event))
    else event.respondWith(precached(request))
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(event))
  }
})

async function navigation(event) {
  const cache = await caches.open(CACHE)
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 3000)
    const res = await fetch(event.request, { signal: ctl.signal })
    clearTimeout(timer)
    // A captive portal may answer 200 with someone else's HTML: only trust real HTML from our origin.
    if (res.ok && /text\/html/i.test(res.headers.get('content-type') || '')) { event.waitUntil(cache.put(SHELL, res.clone())); return res }
  } catch { /* offline or slow: use the shell */ }
  return (await cache.match(SHELL)) || Response.error()
}

async function precached(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request, { ignoreSearch: true })
  if (hit) return hit
  try { return await fetch(request) } catch { return Response.error() }
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(FONTS)
  const hit = await cache.match(event.request)
  const refresh = fetch(event.request).then(res => { if (res.ok) cache.put(event.request, res.clone()); return res }).catch(() => null)
  if (hit) { event.waitUntil(refresh); return hit }
  return (await refresh) || Response.error()
}
