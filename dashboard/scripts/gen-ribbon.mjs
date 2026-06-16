// Generate the pastel ribbon-field art (matching components/FlowField.vue) as
// static SVGs:
//   - public/art/ribbon-field.svg   transparent, faint texture behind empty states
//   - ../docs/assets/header.svg     black banner for the docs / README header
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ART = resolve(__dirname, '../public/art')
const DOCS = resolve(__dirname, '../../docs/assets')

const PALETTE = ['#d6b3c0', '#aab6d2', '#b0cdbf', '#d6cab2', '#c8bcd2']

// Same curl-like flow field as FlowField.vue.
function angleAt(nx, ny) {
  const x = nx * 3.0, y = ny * 3.0
  return (Math.sin(x * 1.3 + Math.cos(y * 0.7) * 1.5) +
          Math.sin(y * 1.1 - Math.cos(x * 0.9) * 1.3)) * Math.PI
}

function ribbonPath(sx, sy, W, H) {
  const STEP = 0.006, STEPS = 150
  const pts = []
  for (const dir of [1, -1]) {
    let x = sx, y = sy
    const local = []
    for (let s = 0; s < STEPS; s++) {
      const ang = angleAt(x, y)
      x += Math.cos(ang) * STEP * dir
      y += Math.sin(ang) * STEP * dir
      if (x < -0.3 || x > 1.3 || y < -0.3 || y > 1.3) break
      local.push([+(x * W).toFixed(1), +(y * H).toFixed(1)])
    }
    if (dir === 1) pts.push(...local.reverse())
    else pts.push(...local)
  }
  return pts
}

function buildPaths(W, H, cols, rows) {
  const out = []
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const jx = (Math.sin(i * 12.9 + j * 4.1) * 0.5 + 0.5) * 0.18
      const jy = (Math.sin(i * 3.7 + j * 7.3) * 0.5 + 0.5) * 0.18
      const pts = ribbonPath((i + 0.5) / cols + jx - 0.09, (j + 0.5) / rows + jy - 0.09, W, H)
      if (pts.length < 3) continue
      const d = 'M' + pts.map((p) => `${p[0]} ${p[1]}`).join(' L')
      out.push(`<path d="${d}" stroke="${PALETTE[(i * rows + j) % PALETTE.length]}"/>`)
    }
  }
  return out
}

// 1) Transparent ribbon field for empty states.
{
  const W = 1200, H = 600
  const paths = buildPaths(W, H, 6, 4)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs><filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
<g filter="url(#soft)" fill="none" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">
${paths.join('\n')}
</g>
</svg>
`
  mkdirSync(ART, { recursive: true })
  writeFileSync(resolve(ART, 'ribbon-field.svg'), svg)
}

// 2) Docs / README header banner — black panel, ribbons, fade, title + caption.
{
  const W = 1280, H = 320
  const paths = buildPaths(W, H, 10, 3)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#0a0a0c"/>
<defs>
  <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3"/></filter>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.35" stop-color="#0a0a0c" stop-opacity="0"/>
    <stop offset="1" stop-color="#0a0a0c" stop-opacity="0.82"/>
  </linearGradient>
</defs>
<g filter="url(#soft)" fill="none" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity="0.7">
${paths.join('\n')}
</g>
<rect width="${W}" height="${H}" fill="url(#fade)"/>
<text x="44" y="250" font-family="-apple-system, system-ui, Segoe UI, sans-serif" font-size="44" font-weight="700" letter-spacing="2" fill="#ececee">SYSTEMS.</text>
<text x="48" y="282" font-family="-apple-system, system-ui, Segoe UI, sans-serif" font-size="18" fill="#9296a0">Deployment engine</text>
</svg>
`
  mkdirSync(DOCS, { recursive: true })
  writeFileSync(resolve(DOCS, 'header.svg'), svg)
}

// 3) GitHub social preview card (1280x640) — ribbons + wordmark + tagline.
{
  const W = 1280, H = 640
  const paths = buildPaths(W, H, 9, 5)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#0a0a0c"/>
<defs>
  <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3.5"/></filter>
  <radialGradient id="vig" cx="50%" cy="52%" r="62%">
    <stop offset="0.35" stop-color="#0a0a0c" stop-opacity="0.78"/>
    <stop offset="1" stop-color="#0a0a0c" stop-opacity="0.18"/>
  </radialGradient>
</defs>
<g filter="url(#soft)" fill="none" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" opacity="0.7">
${paths.join('\n')}
</g>
<rect width="${W}" height="${H}" fill="url(#vig)"/>
<g font-family="-apple-system, system-ui, Segoe UI, sans-serif" text-anchor="middle">
  <text x="640" y="316" font-size="84" font-weight="800" letter-spacing="3" fill="#ececee">SYSTEMS.</text>
  <text x="640" y="368" font-size="27" fill="#cfd2d8">Your own deployment engine — zip in, live URL out.</text>
  <text x="640" y="412" font-size="18" letter-spacing="1.5" fill="#9296a0">self-hosted · admin-only · Vue + Fastify · HTTPS</text>
</g>
</svg>
`
  writeFileSync(resolve(DOCS, 'social-preview.svg'), svg)
}

console.log('SYSTEMS. ribbon art generated:')
console.log('  public/art/ribbon-field.svg     (empty states)')
console.log('  ../docs/assets/header.svg       (docs / README)')
console.log('  ../docs/assets/social-preview.svg (GitHub social card)')
