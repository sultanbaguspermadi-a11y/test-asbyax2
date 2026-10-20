// Dependency-free build: copies public/ -> dist/, content-hashes the lexicon files, and stamps sw.js
// with a build id + the exact precache list. Usage: node scripts/build.mjs
import { cpSync, rmSync, readdirSync, statSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative, sep } from 'node:path'

const SRC = 'public', OUT = 'dist'
const sha = buf => createHash('sha256').update(buf).digest('hex').slice(0, 10)
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })

rmSync(OUT, { recursive: true, force: true })
cpSync(SRC, OUT, { recursive: true })

// 1. Hash lexicon data files (immutable-cacheable names) and point meta.json at them.
const metaPath = join(OUT, 'data/lexicon/meta.json')
const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
for (const f of meta.files) {
  const from = join(OUT, 'data/lexicon', f.path)
  const h = sha(readFileSync(from))
  const to = f.path.replace(/(\.[^.]+)$/, `.${h}$1`)
  renameSync(from, join(OUT, 'data/lexicon', to))
  f.path = to
}
writeFileSync(metaPath, JSON.stringify(meta, null, 2))

// 2. Precache list = every file except sw.js itself; build id = hash over names + contents.
const files = walk(OUT).map(p => '/' + relative(OUT, p).split(sep).join('/')).filter(p => p !== '/sw.js').sort()
const h = createHash('sha256')
for (const f of files) { h.update(f); h.update(readFileSync(join(OUT, f))) }
const build = h.digest('hex').slice(0, 12)
const precache = ['/', ...files]   // '/' is served from the shell
const swPath = join(OUT, 'sw.js')
let sw = readFileSync(swPath, 'utf8')
if (!sw.includes("'@@BUILD@@'") || !sw.includes("'@@PRECACHE@@'")) throw new Error('sw.js placeholders missing')
sw = sw.replace("'@@BUILD@@'", JSON.stringify(build)).replace("'@@PRECACHE@@'", JSON.stringify(JSON.stringify(precache)))
writeFileSync(swPath, sw)

// 3. Sanity: everything referenced by the manifest and index exists.
const must = ['/index.html', '/manifest.webmanifest', '/js/main.js', '/css/app.css', ...JSON.parse(readFileSync(join(OUT, 'manifest.webmanifest'), 'utf8')).icons.map(i => i.src)]
for (const m of must) if (!existsSync(join(OUT, m))) throw new Error(`missing build output: ${m}`)
console.log(`build ${build}: ${files.length} files precached -> ${OUT}/`)
