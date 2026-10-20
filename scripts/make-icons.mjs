// Regenerates public/icons/*.png from an inline SVG using sharp (devDependency-free: run with a global sharp or `npm i -D sharp`).
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
let sharp
try { sharp = require('sharp') } catch { sharp = require(process.env.SHARP_PATH || '/home/claude/.npm-global/lib/node_modules/sharp') }

const svg = ({ size, pad, round }) => {
  const t = size * (1 - 2 * pad), x = size * pad, r = size * 0.16 * (t / size)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f6a55"/><stop offset="1" stop-color="#082f27"/></linearGradient>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbea"/><stop offset="1" stop-color="#f1e1ac"/></linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${round ? size * 0.22 : 0}" fill="url(#bg)"/>
  <rect x="${x}" y="${x + t * 0.03}" width="${t}" height="${t}" rx="${r}" fill="#c9b36f"/>
  <rect x="${x}" y="${x}" width="${t}" height="${t}" rx="${r}" fill="url(#tile)"/>
  <text x="${size / 2}" y="${x + t * 0.74}" font-family="DejaVu Sans, Noto Naskh Arabic, sans-serif" font-weight="700" font-size="${t * 0.74}" text-anchor="middle" fill="#0d3a2f">س</text>
  <text x="${x + t * 0.16}" y="${x + t * 0.9}" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="${t * 0.15}" fill="#6a5517">3</text>
</svg>`
}
mkdirSync('public/icons', { recursive: true })
const jobs = [['icon-192.png', 192, 0.17, true], ['icon-512.png', 512, 0.17, true], ['icon-maskable-512.png', 512, 0.26, false], ['apple-touch-icon.png', 180, 0.15, false], ['favicon-32.png', 32, 0.08, true]]
for (const [file, size, pad, round] of jobs) { await sharp(Buffer.from(svg({ size, pad, round }))).png({ compressionLevel: 9 }).toFile(`public/icons/${file}`); console.log('wrote', file) }
