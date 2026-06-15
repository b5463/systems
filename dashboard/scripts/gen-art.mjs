#!/usr/bin/env node
/**
 * SYSTEMS. — ASCII docs-header generator.
 *
 * The Tinkerbell chaotic map is sampled into a monospace character grid; cell
 * density selects the glyph, producing an abstract white-on-black ASCII
 * sculpture for the docs/README banner. (The app's own art is the pastel
 * ribbon field — see components/FlowField.vue and scripts/gen-ribbon.mjs.)
 *
 * Run:  node scripts/gen-art.mjs
 * Emits: ../docs/assets/header.svg             (black panel, docs/README)
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ART = resolve(__dirname, '../public/art')
const DOCS = resolve(__dirname, '../../docs/assets')
mkdirSync(ART, { recursive: true })
mkdirSync(DOCS, { recursive: true })

const RAMP = ['·', '.', ':', ';', '-', '+', '*', 'o'] // light → heavy, XML-safe

// Tinkerbell map → density grid → glyph rows (auto-fit to the cell grid).
//   x' = x² − y² + a·x + b·y ;  y' = 2·x·y + c·x + d·y
function asciiRows({ cols, rows, iters, a = 0.9, b = -0.6013, c = 2.0, d = 0.5 }) {
  const grid = new Float32Array(cols * rows)
  const x0 = -0.72, y0 = -0.64, WARM = 100
  // pass 1: bounds
  let x = x0, y = y0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
  for (let i = 0; i < iters; i++) {
    const nx = x * x - y * y + a * x + b * y
    const ny = 2 * x * y + c * x + d * y
    x = nx; y = ny
    if (!isFinite(x) || Math.abs(x) > 1e3) { x = x0; y = y0; continue }
    if (i < WARM) continue
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  const px = (maxX - minX) * 0.05 || 0.1, py = (maxY - minY) * 0.05 || 0.1
  minX -= px; maxX += px; minY -= py; maxY += py
  const sx = cols / (maxX - minX), sy = rows / (maxY - minY)
  // pass 2: density
  x = x0; y = y0; let max = 1
  for (let i = 0; i < iters; i++) {
    const nx = x * x - y * y + a * x + b * y
    const ny = 2 * x * y + c * x + d * y
    x = nx; y = ny
    if (!isFinite(x) || Math.abs(x) > 1e3) { x = x0; y = y0; continue }
    if (i < WARM) continue
    const gx = ((x - minX) * sx) | 0
    const gy = ((y - minY) * sy) | 0
    if (gx >= 0 && gx < cols && gy >= 0 && gy < rows) {
      const v = ++grid[gy * cols + gx]
      if (v > max) max = v
    }
  }
  const norm = 1 / Math.log(max + 1)
  const out = []
  for (let gy = 0; gy < rows; gy++) {
    let line = ''
    for (let gx = 0; gx < cols; gx++) {
      const v = grid[gy * cols + gx]
      if (!v) { line += ' '; continue }
      const dens = Math.log(v + 1) * norm
      line += RAMP[Math.min(RAMP.length - 1, Math.floor(dens * RAMP.length))]
    }
    out.push(line.replace(/\s+$/, ''))
  }
  return out
}

function rowsToSvg(rows, { fontSize = 13, fill = '#e2e4e8', op = 1, lineH = 15, padX = 8, padY = 14 }) {
  const texts = rows.map((line, i) =>
    line.trim()
      ? `<text x="${padX}" y="${padY + i * lineH}" fill="${fill}" fill-opacity="${op}" xml:space="preserve">${line}</text>`
      : ''
  ).join('\n')
  return { texts, lineH }
}

// Docs/README header — black panel + white ASCII field + quiet caption.
// (App art is the pastel ribbon field — see components/FlowField.vue and
// scripts/gen-ribbon.mjs. This ASCII header is kept for the docs banner.)
{
  const cols = 150, rows = 21
  const data = asciiRows({ cols, rows, iters: 55000, a: 0.894 })
  const fontSize = 13, lineH = 15
  const w = 1280, h = 320
  const { texts } = rowsToSvg(data, { fontSize, lineH, op: 0.5, padX: 24, padY: 22 })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="#0a0a0c"/>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="${fontSize}" letter-spacing="0.5">
${texts}
</g>
<rect width="${w}" height="${h}" fill="url(#fade)"/>
<defs>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.4" stop-color="#0a0a0c" stop-opacity="0"/>
    <stop offset="1" stop-color="#0a0a0c" stop-opacity="0.75"/>
  </linearGradient>
</defs>
<text x="40" y="272" font-family="-apple-system, system-ui, sans-serif" font-size="18" fill="#9296a0">Deployment engine</text>
</svg>
`
  writeFileSync(resolve(DOCS, 'header.svg'), svg)
}

console.log('SYSTEMS. docs header generated:')
console.log('  ../docs/assets/header.svg    (docs / README)')
