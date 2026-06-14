#!/usr/bin/env node
/**
 * SYSTEMS. — white ASCII chaos art generator.
 *
 * Static counterpart to AsciiChaosField.vue: a De Jong strange attractor is
 * sampled into a monospace character grid; cell density selects the glyph.
 * The result is an abstract white-on-(transparent|black) ASCII sculpture —
 * orbital and chaotic, NOT a node/edge network diagram. No color, no readable
 * text, no fake terminal copy.
 *
 * Run:  node scripts/gen-art.mjs
 * Emits: public/art/ascii-field.svg            (transparent, ambient/empty states)
 *        ../docs/assets/header.svg             (black panel, docs/README)
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

// De Jong attractor → density grid → glyph rows.
function asciiRows({ cols, rows, iters, a, b, c, d }) {
  const grid = new Float32Array(cols * rows)
  let x = 0.1, y = 0.1, max = 1
  for (let i = 0; i < iters; i++) {
    const nx = Math.sin(a * y) - Math.cos(b * x)
    const ny = Math.sin(c * x) - Math.cos(d * y)
    x = nx; y = ny
    if (i < 40) continue
    const gx = ((x + 2) / 4 * cols) | 0
    const gy = ((y + 2) / 4 * rows) | 0
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

// 1) Ambient transparent field — empty states / faint backdrops.
{
  const cols = 120, rows = 64
  const data = asciiRows({ cols, rows, iters: 60000, a: 1.641, b: 1.902, c: 0.316, d: 1.525 })
  const fontSize = 13, lineH = 15
  const w = cols * 7.8, h = rows * lineH + 8
  const { texts } = rowsToSvg(data, { fontSize, lineH })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="0 0 ${Math.round(w)} ${Math.round(h)}">
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="${fontSize}" letter-spacing="0.5">
${texts}
</g>
</svg>
`
  writeFileSync(resolve(ART, 'ascii-field.svg'), svg)
}

// 2) Docs/README header — black panel + white ASCII field + quiet caption.
{
  const cols = 150, rows = 21
  const data = asciiRows({ cols, rows, iters: 55000, a: 1.4, b: -2.3, c: 2.4, d: -2.1 })
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
<text x="40" y="250" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14" letter-spacing="6" fill="#585c66">BY ACRONYM</text>
<text x="40" y="284" font-family="-apple-system, system-ui, sans-serif" font-size="18" fill="#9296a0">Private deployment infrastructure</text>
</svg>
`
  writeFileSync(resolve(DOCS, 'header.svg'), svg)
}

console.log('SYSTEMS. ASCII art generated:')
console.log('  public/art/ascii-field.svg   (ambient / empty states)')
console.log('  ../docs/assets/header.svg    (docs / README)')
