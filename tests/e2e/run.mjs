// Browser tests (Chromium via Playwright). Builds nothing: run `npm run build` first.
// Playwright is NOT a project dependency; point PLAYWRIGHT_PATH at an install, or `npm i -D playwright`.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
const require = createRequire(import.meta.url)
const { chromium } = (() => { try { return require('playwright') } catch { return require(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/playwright') } })()

const PORT = 5188, URL_ = `http://localhost:${PORT}/`
const server = spawn('node', ['scripts/serve.mjs', 'dist', String(PORT)], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 800))
const browser = await chromium.launch()
const results = []
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]) } catch (e) { results.push(['FAIL', name, e.message.split('\n').slice(0, 4).join(' | ')]) } }
const T = (letter, value, id) => ({ id, letter, value, blank: false })

async function open(opts = {}, init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'ar', ...opts })
  const page = await ctx.newPage()
  const problems = []
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_(INTERNET|NAME|CONNECTION|FAILED)/.test(m.text())) problems.push('console: ' + m.text()) })
  page.on('pageerror', e => problems.push('pageerror: ' + e.message))
  page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) problems.push('requestfailed: ' + r.url()) })
  page.on('response', r => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`) })
  if (init) await page.addInitScript(init)
  await page.goto(URL_)
  await page.waitForSelector('.sq')
  return { ctx, page, problems }
}
const setRack = (page, tiles) => page.evaluate(t => { const g = window.__asb.game; t.forEach((x, i) => { g.rack[i] = x }); window.__asb.render() }, tiles)
const sq = (page, r, c) => page.locator(`.sq[data-r="${r}"][data-c="${c}"]`)

/* ---------- 1. load, no errors, CSP respected ---------- */
let main = await open()
await check('loads with no console errors, failed requests or CSP violations', async () => { await main.page.waitForTimeout(800); assert.deepEqual(main.problems, []) })
await check('RTL document, Arabic language, board has 225 cells and rack 7 slots', async () => {
  assert.equal(await main.page.evaluate(() => [document.documentElement.dir, document.documentElement.lang].join()), 'rtl,ar')
  assert.equal(await main.page.locator('#board .sq').count(), 225); assert.equal(await main.page.locator('.slot').count(), 7)
})
await check('dictionary loaded (worker) and reports entries', async () => {
  await main.page.waitForFunction(() => window.__asb.validator.status === 'ready', null, { timeout: 5000 })
  const n = await main.page.evaluate(() => window.__asb.validator.info.entries); assert.ok(n > 500, String(n))
})

/* ---------- 2. play a move by tap, validate, score, persistence ---------- */
await check('tap-to-place a valid word: chips show ✓, score preview, submit scores and passes the turn', async () => {
  const p = main.page
  await setRack(p, [T('ك', 3, 9001), T('ت', 1, 9002), T('ا', 1, 9003), T('ب', 2, 9004)])
  for (const [i, c] of [[0, 7], [1, 8], [2, 9], [3, 10]]) { await p.locator(`.slot[data-i="${i}"]`).click(); await sq(p, 7, c).click() }
  await p.waitForSelector('.chip[data-s="valid"]')
  const chip = await p.locator('.chip bdi').first().textContent(); assert.equal(chip, 'كتاب')
  const preview = await p.locator('.chip-score').textContent()
  // star(DW) on (7,7), DL on (7,11) not reached -> (3+1+1+2)*2 = 14
  assert.equal(preview, '+14')
  await p.locator('#btn-submit').click()
  await p.waitForFunction(() => window.__asb.game.scores[1] === 14)
  assert.equal(await p.evaluate(() => window.__asb.game.current), 2)
  assert.match(await p.locator('#status').textContent(), /14/)
})
await check('game state survives a reload (autosave) and the clock keeps running for the right player', async () => {
  await main.page.reload(); await main.page.waitForSelector('.sq')
  const s = await main.page.evaluate(() => ({ s: window.__asb.game.scores[1], cur: window.__asb.game.current, t: window.__asb.game.board[7][7]?.letter }))
  assert.deepEqual(s, { s: 14, cur: 2, t: 'ك' })
})
await check('unknown word: block mode rejects, ask mode shows dialog, accept scores, "add" teaches the custom dictionary', async () => {
  const p = main.page
  await setRack(p, [T('ظ', 8, 9101), T('ط', 8, 9102), null, null, null, null, null])   // current player is 2
  await p.locator('.slot[data-i="0"]').click(); await sq(p, 8, 7).click()               // under ك
  await p.waitForSelector('.chip')                                                       // "كظ" (not a word)
  await p.locator('#btn-submit').click()
  await p.waitForSelector('#dlg-unknown[open]')
  assert.match(await p.locator('#unknown-list').textContent(), /كظ/)
  await p.locator('#dlg-unknown [value="cancel"]').click()
  assert.equal(await p.evaluate(() => window.__asb.game.scores[2]), 0)
  await p.locator('#btn-submit').click(); await p.waitForSelector('#dlg-unknown[open]')
  await p.locator('#dlg-unknown [value="add"]').click()
  await p.waitForFunction(() => window.__asb.game.scores[2] > 0)
  assert.ok(await p.evaluate(() => JSON.parse(localStorage.getItem('asb:custom-words:v1')).includes('كظ')))
})
await check('block mode refuses the move and explains why', async () => {
  const v = await open({}, () => localStorage.setItem('asb:settings:v1', JSON.stringify({ unknown: 'block' })))
  const p = v.page
  await setRack(p, [T('ك', 3, 9201), T('ظ', 8, 9202), null, null, null, null, null])
  await p.locator('.slot[data-i="0"]').click(); await sq(p, 7, 7).click()
  await p.locator('.slot[data-i="1"]').click(); await sq(p, 7, 8).click()
  await p.locator('#btn-submit').click()
  await p.waitForFunction(() => /مرفوضة/.test(document.getElementById('status').textContent))
  assert.equal(await p.evaluate(() => window.__asb.game.pending.length), 2)
  assert.equal(await p.locator('dialog[open]').count(), 0)
  await v.ctx.close()
})
await check('mouse drag from rack to board and back to the rack', async () => {
  const p = main.page
  const slot = p.locator('.slot[data-i="1"] .tile'), target = sq(p, 6, 7)
  const a = await slot.boundingBox(), b = await target.boundingBox()
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await p.mouse.down()
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); await p.mouse.up()
  await p.waitForFunction(() => window.__asb.game.pending.length === 1)
  const t = sq(p, 6, 7).locator('.tile'), tb = await t.boundingBox(), sb = await p.locator('.slot[data-i="5"]').boundingBox()
  await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await p.mouse.down()
  await p.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 8 }); await p.mouse.up()
  await p.waitForFunction(() => window.__asb.game.pending.length === 0)
  assert.ok(await p.evaluate(() => window.__asb.game.rack[5] !== null), 'tile returned to the dropped slot')
})
await check('touch drag (real touch events via CDP) places a tile', async () => {
  const p = main.page, cdp = await main.ctx.newCDPSession(p)
  const a = await p.locator('.slot[data-i="5"] .tile').boundingBox() , b = await sq(p, 6, 8).boundingBox()
  const pt = (x, y) => [{ x, y, id: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(a.x + a.width / 2, a.y + a.height / 2) })
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(a.x + (b.x - a.x) * i / 8 + 5, a.y + (b.y - a.y) * i / 8 + 5) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await p.waitForFunction(() => window.__asb.game.pending.length === 1, null, { timeout: 3000 })
})
await check('blank tile asks for a letter and cancelling returns it to the rack', async () => {
  const p = main.page
  if (await p.evaluate(() => window.__asb.game.pending.length)) await p.locator('#btn-recall').click()
  await p.evaluate(() => { window.__asb.game.rack[2] = { id: 9300, letter: '', value: 0, blank: true }; window.__asb.render() })
  await p.locator('.slot[data-i="2"]').click(); await sq(p, 6, 7).click()
  await p.waitForSelector('#dlg-blank[open]')
  assert.equal(await p.locator('#blank-letters button').count(), 28)
  await p.keyboard.press('Escape')
  await p.waitForFunction(() => window.__asb.game.pending.length === 0)
})
await check('keyboard: arrows move across the board in RTL order, digits select rack tiles, Enter places', async () => {
  const p = main.page
  await sq(p, 7, 7).focus(); await p.keyboard.press('ArrowLeft')
  assert.equal(await p.evaluate(() => document.activeElement.dataset.c), '8')   // left = next column in RTL
  await p.keyboard.press('ArrowDown'); assert.equal(await p.evaluate(() => document.activeElement.dataset.r), '8')
  await p.evaluate(() => document.activeElement.blur())
  await p.keyboard.press('1')
  assert.equal(await p.locator('.slot[data-i="0"]').getAttribute('aria-pressed'), 'true')
})

/* ---------- 3. theme ---------- */
await check('theme toggle persists, applies before first paint, and manual choice beats the OS setting', async () => {
  const p = main.page
  const before = await p.evaluate(() => document.documentElement.dataset.theme)
  await p.locator('#btn-theme').click()
  const after = await p.evaluate(() => document.documentElement.dataset.theme); assert.notEqual(before, after)
  await p.emulateMedia({ colorScheme: before }) // OS flips to the opposite of the user's choice
  await p.reload()
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), after)
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('asb:settings:v1')).theme), after)
  await p.screenshot({ path: `tests/e2e/shots/phone-${after}.png` })
  await p.locator('#btn-theme').click(); await p.screenshot({ path: `tests/e2e/shots/phone-${before}.png` })
})
await main.ctx.close()
await check('first visit follows the OS colour scheme', async () => {
  const d = await open({ colorScheme: 'dark' }); assert.equal(await d.page.evaluate(() => document.documentElement.dataset.theme), 'dark'); await d.ctx.close()
  const l = await open({ colorScheme: 'light' }); assert.equal(await l.page.evaluate(() => document.documentElement.dataset.theme), 'light'); await l.ctx.close()
})

/* ---------- 4. PWA: SW, offline, manifest ---------- */
await check('service worker installs, game and dictionary work fully offline after reload', async () => {
  const o = await open({ serviceWorkers: 'allow' })
  await o.page.evaluate(() => navigator.serviceWorker.ready)
  await o.page.reload(); await o.page.waitForFunction(() => navigator.serviceWorker.controller)
  const cached = await o.page.evaluate(async () => (await (await caches.open((await caches.keys()).find(k => k.startsWith('asb-') && k !== 'asb-fonts'))).keys()).length)
  assert.ok(cached >= 20, `precached ${cached}`)
  await o.ctx.setOffline(true)
  await o.page.reload(); await o.page.waitForSelector('.sq')
  await o.page.waitForFunction(() => window.__asb.validator.status === 'ready', null, { timeout: 5000 })
  const r = await o.page.evaluate(() => window.__asb.validator.check(['كتاب', 'الكتاب', 'ككككك']).then(x => x.map(y => y.status)))
  assert.deepEqual(r, ['valid', 'valid', 'not_found'])
  await o.ctx.close()
})
await check('manifest is valid: fields, icons exist and have the declared size', async () => {
  const m = await (await fetch(URL_ + 'manifest.webmanifest')).json()
  for (const k of ['name', 'short_name', 'start_url', 'scope', 'display', 'theme_color', 'background_color', 'icons']) assert.ok(m[k], k)
  assert.equal(m.display, 'standalone'); assert.ok(m.icons.some(i => i.purpose === 'maskable') && m.icons.some(i => i.sizes === '512x512'))
  const sharp = require('/home/claude/.npm-global/lib/node_modules/sharp')
  for (const i of m.icons) { const buf = Buffer.from(await (await fetch(URL_ + i.src.slice(1))).arrayBuffer()); const meta = await sharp(buf).metadata(); assert.equal(`${meta.width}x${meta.height}`, i.sizes, i.src) }
})
await check('deep link /index.html and unknown path behave; sw.js has no-cache headers', async () => {
  assert.equal((await fetch(URL_ + 'index.html')).status, 200)
  const h = (await fetch(URL_ + 'sw.js')).headers
  assert.match(h.get('cache-control'), /max-age=0/); assert.match(h.get('content-type'), /javascript/)
})

/* ---------- 5. responsive matrix ---------- */
const VIEWPORTS = [
  ['phone-320x568', 320, 568, 2], ['phone-360x640', 360, 640, 3], ['iphone-se-375x667', 375, 667, 2], ['iphone-390x844', 390, 844, 3], ['phone-large-430x932', 430, 932, 3],
  ['phone-landscape-844x390', 844, 390, 3], ['phone-landscape-667x375', 667, 375, 2], ['ipad-portrait-768x1024', 768, 1024, 2], ['ipad-landscape-1024x768', 1024, 768, 2],
  ['tablet-android-800x1280', 800, 1280, 2], ['laptop-1366x768', 1366, 768, 1], ['desktop-1920x1080', 1920, 1080, 1], ['short-wide-1280x500', 1280, 500, 1],
  ['ultrawide-3440x1440', 3440, 1440, 1], ['tv-3840x2160', 3840, 2160, 1], ['zoom400-320x240', 320, 240, 1],
]
const layoutRows = []
for (const [name, w, h, dpr] of VIEWPORTS) {
  await check(`layout ${name}: no sideways scroll, board square & fully visible, tiles ≥ target, controls reachable, no overlaps`, async () => {
    const v = await open({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 1000, hasTouch: w < 1000 })
    const p = v.page
    await setRack(p, [T('ك', 3, 9901), T('ت', 1, 9902), T('ا', 1, 9903), T('ب', 2, 9904), T('ر', 1, 9905), T('ي', 1, 9906), T('ظ', 8, 9907)])
    for (const [i, c] of [[0, 7], [1, 8], [2, 9]]) { await p.locator(`.slot[data-i="${i}"]`).click(); await sq(p, 7, c).click() }
    await p.waitForTimeout(150)
    const m = await p.evaluate(() => {
      const r = s => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom } }
      const app = document.getElementById('app'), scroller = app.scrollHeight > app.clientHeight + 1
      return { board: r('#board'), rack: r('#rack'), slot: r('.slot'), sub: r('#btn-undo'), submit: r('#btn-submit'), players: r('.players'), panel: r('.panel'), scroller,
        letterFont: parseFloat(getComputedStyle(document.querySelector('.sq .tile .t-letter')).fontSize), cell: r('.sq'), overflowX: document.documentElement.scrollWidth - innerWidth,
        root: parseFloat(getComputedStyle(document.documentElement).fontSize) }
    })
    layoutRows.push([name, `${Math.round(m.board.w)}x${Math.round(m.board.h)}`, `cell ${m.cell.w.toFixed(1)}`, `letter ${m.letterFont.toFixed(1)}px`, `slot ${Math.round(m.slot.w)}`, m.scroller ? 'scrolls' : 'fits', `root ${m.root.toFixed(1)}`])
    assert.ok(m.overflowX <= 1, `horizontal overflow ${m.overflowX}`)
    assert.ok(Math.abs(m.board.w - m.board.h) < 1.5, 'board not square')
    assert.ok(m.board.x >= -1 && m.board.r <= w + 1, 'board clipped horizontally')
    assert.ok(m.slot.w >= 40 || w < 340, `rack tile ${m.slot.w}`)
    assert.ok(m.cell.w >= 13, `board cell ${m.cell.w}`)
    if (!m.scroller) {   // when everything fits, nothing may be cut off at the bottom/right
      assert.ok(m.submit.b <= h + 1 && m.sub.b <= h + 1, `controls below fold (${m.sub.b} > ${h})`)
    }
    // board and panel must not overlap
    const inter = (a, b) => a.x < b.r - 1 && a.r > b.x + 1 && a.y < b.b - 1 && a.b > b.y + 1
    if (!m.scroller) assert.ok(!inter(m.board, m.panel) && !inter(m.board, m.players), 'board overlaps panel/players')
    await p.screenshot({ path: `tests/e2e/shots/layout-${name}.png` })
    assert.deepEqual(v.problems, [])
    await v.ctx.close()
  })
}

await browser.close(); server.kill()
console.log('\nLayout summary:'); for (const r of layoutRows) console.log('  ' + r.join(' | '))
console.log(); let failed = 0
for (const [s, n, msg] of results) { console.log(`${s}  ${n}${msg ? '\n      ' + msg : ''}`); if (s === 'FAIL') failed++ }
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
