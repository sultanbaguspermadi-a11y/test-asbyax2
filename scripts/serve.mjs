// Tiny static server for local use. Applies the headers from vercel.json so CSP problems show up locally.
// Usage: node scripts/serve.mjs [dir=public] [port=5173]
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const root = process.argv[2] || 'public', port = +(process.argv[3] || process.env.PORT || 5173)
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
const rules = (vercel.headers || []).map(h => ({ re: new RegExp('^' + h.source.replace(/[.]/g, '\\.').replace(/\(\\\.\*\)|\(\.\*\)/g, '.*') + '$'), headers: h.headers }))
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' }

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const rel = normalize(path === '/' ? '/index.html' : path).replace(/^([/\\])+/, '')
  const file = join(root, rel)
  if (!file.startsWith(root)) { res.writeHead(403).end(); return }
  const headers = { 'Cache-Control': 'public, max-age=0, must-revalidate' }
  for (const r of rules) if (r.re.test(path)) for (const h of r.headers) headers[h.key] = h.value
  try {
    if (!(await stat(file)).isFile()) throw new Error('nf')
    headers['Content-Type'] ||= types[extname(file)] || 'application/octet-stream'
    res.writeHead(200, headers).end(await readFile(file))
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...headers }).end('404') }
}).listen(port, () => console.log(`serving ${root}/ at http://localhost:${port}/`))
