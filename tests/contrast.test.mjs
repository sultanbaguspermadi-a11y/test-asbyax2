import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../public/css/app.css', import.meta.url), 'utf8')
const block = sel => { const i = css.indexOf(sel); return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i)) }
const vars = text => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map(m => [m[1], m[2]]))
const light = vars(block(":root, [data-theme='light']")), dark = { ...light, ...vars(block("[data-theme='dark']")) }
const lum = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)); return .2126 * r + .7152 * g + .0722 * b }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05) }

const PAIRS = [
  ['ink', 'bg'], ['ink', 'surface'], ['ink', 'surface-2'], ['muted', 'surface'], ['muted', 'bg'],
  ['on-accent', 'accent'], ['on-danger', 'danger'], ['on-topbar', 'topbar'],
  ['danger', 'surface'], ['warn', 'surface'], ['ok', 'surface'], ['accent-hi', 'surface'],
  ['tile-ink', 'tile-bg'], ['tile-ink', 'tile-hi'], ['tile-val', 'tile-bg'], ['blank-ink', 'tile-bg'],
  ['p-dl-ink', 'p-dl'], ['p-tl-ink', 'p-tl'], ['p-dw-ink', 'p-dw'], ['p-tw-ink', 'p-tw'], ['p-star-ink', 'p-star'],
]
for (const [name, t] of [['light', light], ['dark', dark]]) {
  test(`${name} theme: text/background pairs meet WCAG AA (4.5:1)`, () => {
    const bad = PAIRS.filter(([f, b]) => t[f] && t[b] && ratio(t[f], t[b]) < 4.5).map(([f, b]) => `${f} on ${b} = ${ratio(t[f], t[b]).toFixed(2)}`)
    assert.deepEqual(bad, [])
  })
  test(`${name} theme: focus ring and tile edge are distinguishable (3:1 non-text)`, () => {
    assert.ok(ratio(t.focus, t.bg) >= 3, 'focus vs bg')
    assert.ok(ratio(t['pending'], t['cell']) >= 3 || ratio(t.pending, t['tile-bg']) >= 1, 'pending ring')
  })
}
