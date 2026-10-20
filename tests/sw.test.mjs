import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Runs public/sw.js in a sandbox with a fake Cache Storage and fetch, then drives its event listeners.
function load({ files = ['/', '/index.html', '/js/main.js'], build = 'b1', network } = {}) {
  const src = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
    .replace("'@@BUILD@@'", JSON.stringify(build)).replace("'@@PRECACHE@@'", JSON.stringify(JSON.stringify(files)))
  const store = new Map(), listeners = {}, claimed = []
  const mkCache = name => { if (!store.has(name)) store.set(name, new Map()); const m = store.get(name); const key = r => new URL(typeof r === 'string' ? r : r.url, 'https://app.test').pathname
    return { addAll: async reqs => { for (const r of reqs) { const res = await sandbox.fetch(r); if (!res.ok) throw new Error('precache ' + key(r)); m.set(key(r), res) } }, put: async (r, res) => m.set(key(r), res), match: async r => m.get(key(r)) } }
  const sandbox = {
    URL, Request: class { constructor(u, o = {}) { this.url = new URL(u, 'https://app.test').href; this.method = 'GET'; this.headers = new Headers(); Object.assign(this, o) } },
    Response: class { constructor(body, o = {}) { this.body = body; this.status = o.status ?? 200; this.ok = this.status < 400; this.headers = new Headers(o.headers) } clone() { return this } static error() { return { error: true } } },
    Headers, AbortController, setTimeout, clearTimeout, JSON,
    caches: { open: async n => mkCache(n), keys: async () => [...store.keys()], delete: async n => store.delete(n) },
    fetch: async r => network(typeof r === 'string' ? r : r.url ?? r),
    self: { location: { origin: 'https://app.test' }, addEventListener: (t, fn) => { listeners[t] = fn }, skipWaiting: () => { sandbox.skipped = true }, clients: { claim: async () => claimed.push(1) } },
  }
  vm.runInNewContext(src, sandbox)
  const fire = async (type, ev) => { const waits = []; await listeners[type]({ ...ev, waitUntil: p => waits.push(p), respondWith: p => { ev._res = p } }); await Promise.all(waits); return ev._res }
  return { store, fire, sandbox, claimed }
}
const ok = (body = 'x', type = 'text/html; charset=utf-8') => new (class { constructor() { this.ok = true; this.status = 200; this.body = body; this.headers = new Headers({ 'content-type': type }) } clone() { return this } })()
const req = (url, o = {}) => ({ url: 'https://app.test' + url, method: 'GET', mode: 'cors', headers: new Headers(), ...o })

test('install precaches the whole list under a build-specific cache and does not skipWaiting', async () => {
  const sw = load({ network: () => ok() })
  await sw.fire('install', {})
  assert.deepEqual([...sw.store.get('asb-b1').keys()].sort(), ['/', '/index.html', '/js/main.js'])
  assert.ok(!sw.sandbox.skipped)
})
test('install fails (so the old worker stays) when a precached file is missing', async () => {
  const sw = load({ network: u => (u.includes('main.js') ? { ok: false, status: 404, headers: new Headers() } : ok()) })
  await assert.rejects(sw.fire('install', {}))
})
test('activate deletes old build caches but keeps fonts cache, then claims clients', async () => {
  const sw = load({ network: () => ok() })
  await sw.sandbox.caches.open('asb-old'); await sw.sandbox.caches.open('asb-fonts'); await sw.sandbox.caches.open('other-app')
  await sw.fire('install', {}); await sw.fire('activate', {})
  assert.deepEqual([...sw.store.keys()].sort(), ['asb-b1', 'asb-fonts', 'other-app'])
  assert.equal(sw.claimed.length, 1)
})
test('SKIP_WAITING message activates the waiting worker', async () => {
  const sw = load({ network: () => ok() }); await sw.fire('message', { data: 'SKIP_WAITING' }); assert.ok(sw.sandbox.skipped)
})
test('navigation: network first, shell cached; offline falls back to cached shell', async () => {
  let online = true
  const sw = load({ network: () => { if (!online) throw new TypeError('offline'); return ok('<html>fresh</html>') } })
  await sw.fire('install', {})
  const a = await sw.fire('fetch', { request: req('/', { mode: 'navigate' }) }); assert.equal((await a).body, '<html>fresh</html>')
  online = false
  const b = await sw.fire('fetch', { request: req('/', { mode: 'navigate' }) }); assert.equal((await b).body, '<html>fresh</html>', 'last good shell served offline')
})
test('navigation: a non-HTML answer (captive portal) is not cached or trusted', async () => {
  const sw = load({ network: u => (sw2 ? ok('{"portal":true}', 'application/json') : ok('<html>shell</html>')) })
  let sw2 = false; await sw.fire('install', {}); sw2 = true
  const r = await (await sw.fire('fetch', { request: req('/', { mode: 'navigate' }) }))
  assert.equal(r.body, '<html>shell</html>')
})
test('assets: served from precache; non-GET, range and foreign requests are left alone', async () => {
  const sw = load({ network: () => ok('asset', 'text/javascript') })
  await sw.fire('install', {})
  assert.equal((await sw.fire('fetch', { request: req('/js/main.js') })).body, 'asset')
  assert.equal(await sw.fire('fetch', { request: req('/api', { method: 'POST' }) }), undefined)
  assert.equal(await sw.fire('fetch', { request: req('/js/main.js', { headers: new Headers({ range: 'bytes=0-1' }) }) }), undefined)
  assert.equal(await sw.fire('fetch', { request: { url: 'https://evil.example/x.js', method: 'GET', mode: 'cors', headers: new Headers() } }), undefined)
})
test('fonts: stale-while-revalidate in a separate cache', async () => {
  let body = 'v1'; const sw = load({ network: () => ok(body, 'font/woff2') })
  const f = { url: 'https://fonts.gstatic.com/a.woff2', method: 'GET', mode: 'cors', headers: new Headers() }
  assert.equal((await sw.fire('fetch', { request: f })).body, 'v1')
  body = 'v2'
  assert.equal((await sw.fire('fetch', { request: f })).body, 'v1', 'cached copy returned immediately')
  assert.equal((await sw.fire('fetch', { request: f })).body, 'v2', 'and refreshed in the background')
})
test('the shipped sw.js template (unbuilt) still parses and has both placeholders for the build step', () => {
  const s = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.ok(s.includes("'@@BUILD@@'") && s.includes("'@@PRECACHE@@'"))
})
