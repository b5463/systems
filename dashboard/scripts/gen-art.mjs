#!/usr/bin/env node
/**
 * SYSTEMS. — abstract technical art generator.
 *
 * Generates deterministic, monochrome, infrastructural artwork as SVG:
 * node-fields, routing traces, broken grids and topology residue. These are
 * the "Chaos Signal Field" brand assets — used as faint ambient textures and
 * brand-moment compositions. No color, no text, no fake terminal copy.
 *
 * Run:  node scripts/gen-art.mjs
 * Emits: public/art/*.svg  and  ../docs/assets/header.svg
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ART = resolve(__dirname, '../public/art')
const DOCS = resolve(__dirname, '../../docs/assets')
mkdirSync(ART, { recursive: true })
mkdirSync(DOCS, { recursive: true })

// --- seeded RNG (mulberry32) so output is stable across runs ---------------
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const n = (x) => Math.round(x * 100) / 100

/**
 * Node-field + routing traces. Nodes scattered, each linked to its nearest
 * neighbours to form an abstract deployment/routing graph.
 */
function nodeField({ w, h, count, seed, line = '#ffffff', lineOp = 0.5, k = 2, dotOp = 0.8 }) {
  const r = rng(seed)
  const pts = Array.from({ length: count }, () => ({
    x: r() * w,
    y: r() * h,
    s: 0.6 + r() * 1.8,        // node radius
    hot: r() > 0.86            // a few brighter "signal" nodes
  }))

  // nearest-neighbour edges
  const edges = []
  for (let i = 0; i < pts.length; i++) {
    const d = pts
      .map((p, j) => ({ j, dist: (p.x - pts[i].x) ** 2 + (p.y - pts[i].y) ** 2 }))
      .filter((e) => e.j !== i)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, k)
    for (const e of d) if (i < e.j) edges.push([i, e.j])
  }

  const lines = edges
    .map(([a, b]) => {
      const o = (lineOp * (0.35 + r() * 0.65)).toFixed(3)
      return `<line x1="${n(pts[a].x)}" y1="${n(pts[a].y)}" x2="${n(pts[b].x)}" y2="${n(pts[b].y)}" stroke="${line}" stroke-opacity="${o}"/>`
    })
    .join('')

  const dots = pts
    .map((p) => {
      const o = (dotOp * (p.hot ? 1 : 0.45 + r() * 0.4)).toFixed(3)
      const rad = p.hot ? p.s * 1.6 : p.s
      const ring = p.hot
        ? `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(rad * 2.4)}" fill="none" stroke="${line}" stroke-opacity="${(o * 0.4).toFixed(3)}"/>`
        : ''
      return `${ring}<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(rad)}" fill="${line}" fill-opacity="${o}"/>`
    })
    .join('')

  return { lines, dots }
}

/** Broken/fragmented grid residue. */
function brokenGrid({ w, h, step, seed, line = '#ffffff', op = 0.16 }) {
  const r = rng(seed)
  let out = ''
  for (let x = step; x < w; x += step) {
    if (r() < 0.32) continue
    const y0 = r() * h * 0.4
    const y1 = h - r() * h * 0.4
    out += `<line x1="${n(x)}" y1="${n(y0)}" x2="${n(x)}" y2="${n(y1)}" stroke="${line}" stroke-opacity="${(op * (0.4 + r() * 0.6)).toFixed(3)}"/>`
  }
  for (let y = step; y < h; y += step) {
    if (r() < 0.32) continue
    const x0 = r() * w * 0.4
    const x1 = w - r() * w * 0.4
    out += `<line x1="${n(x0)}" y1="${n(y)}" x2="${n(x1)}" y2="${n(y)}" stroke="${line}" stroke-opacity="${(op * (0.4 + r() * 0.6)).toFixed(3)}"/>`
  }
  return out
}

function svg({ w, h, body, stroke = 0.75 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">
<g stroke-width="${stroke}">
${body}
</g>
</svg>
`
}

// 1) Ambient node-field — faint texture for backgrounds & empty states.
{
  const w = 1200, h = 900
  const { lines, dots } = nodeField({ w, h, count: 70, seed: 1337, k: 2 })
  writeFileSync(resolve(ART, 'signal-field.svg'), svg({ w, h, body: lines + dots }))
}

// 2) Login hero — denser composition, stronger presence (still monochrome).
{
  const w = 1000, h = 1200
  const grid = brokenGrid({ w, h, step: 90, seed: 77, op: 0.1 })
  const { lines, dots } = nodeField({ w, h, count: 120, seed: 2099, k: 3, lineOp: 0.55, dotOp: 0.9 })
  writeFileSync(resolve(ART, 'hero-field.svg'), svg({ w, h, body: grid + lines + dots }))
}

// 3) Server topology — wide routing texture.
{
  const w = 1600, h = 500
  const grid = brokenGrid({ w, h, step: 120, seed: 404, op: 0.08 })
  const { lines, dots } = nodeField({ w, h, count: 64, seed: 5151, k: 2, lineOp: 0.4 })
  writeFileSync(resolve(ART, 'topology.svg'), svg({ w, h, body: grid + lines + dots }))
}

// 4) Docs header — for README/docs. Dark plate + mark + field, self-contained.
{
  const w = 1280, h = 320
  const { lines, dots } = nodeField({ w, h, count: 90, seed: 8642, k: 2, lineOp: 0.5 })
  const body = `
<rect x="0" y="0" width="${w}" height="${h}" fill="#0a0a0c"/>
<g stroke-width="0.75">${brokenGrid({ w, h, step: 80, seed: 11, op: 0.07 })}${lines}${dots}</g>
<text x="56" y="170" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="76" font-weight="800" letter-spacing="-3" fill="#ececee">SYSTEMS<tspan fill="#5fb0d4">.</tspan></text>
<text x="60" y="208" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="20" letter-spacing="6" fill="#585c66">BY ACRONYM</text>
<text x="60" y="250" font-family="-apple-system, system-ui, sans-serif" font-size="18" fill="#9296a0">Private deployment infrastructure</text>`
  const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none">${body}
</svg>
`
  writeFileSync(resolve(DOCS, 'header.svg'), out)
}

console.log('SYSTEMS. art generated:')
console.log('  public/art/signal-field.svg  (ambient)')
console.log('  public/art/hero-field.svg    (login)')
console.log('  public/art/topology.svg      (server)')
console.log('  ../docs/assets/header.svg    (docs)')
