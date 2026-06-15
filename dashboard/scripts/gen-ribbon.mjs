// Generate a static pastel ribbon-field SVG from the same flow-field algorithm
// as components/FlowField.vue, used as the faint texture behind empty states
// (so empty states match the login art). Output: public/art/ribbon-field.svg
import fs from 'fs'
import path from 'path'

const W = 1200, H = 600
const PALETTE = ['#d6b3c0', '#aab6d2', '#b0cdbf', '#d6cab2', '#c8bcd2']

// Same curl-like field as FlowField.
function angleAt(nx, ny) {
  const x = nx * 3.0, y = ny * 3.0
  const a =
    Math.sin(x * 1.3 + Math.cos(y * 0.7) * 1.5) +
    Math.sin(y * 1.1 - Math.cos(x * 0.9) * 1.3)
  return a * Math.PI
}

function ribbonPath(sx, sy) {
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

const cols = 6, rows = 4
const paths = []
for (let i = 0; i < cols; i++) {
  for (let j = 0; j < rows; j++) {
    const jx = (Math.sin(i * 12.9 + j * 4.1) * 0.5 + 0.5) * 0.18
    const jy = (Math.sin(i * 3.7 + j * 7.3) * 0.5 + 0.5) * 0.18
    const sx = (i + 0.5) / cols + jx - 0.09
    const sy = (j + 0.5) / rows + jy - 0.09
    const pts = ribbonPath(sx, sy)
    if (pts.length < 3) continue
    const d = 'M' + pts.map((p) => `${p[0]} ${p[1]}`).join(' L')
    paths.push(`<path d="${d}" stroke="${PALETTE[(i * rows + j) % PALETTE.length]}"/>`)
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs><filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
<g filter="url(#soft)" fill="none" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">
${paths.join('\n')}
</g>
</svg>
`

const out = path.join(process.cwd(), 'public', 'art', 'ribbon-field.svg')
fs.writeFileSync(out, svg)
console.log('wrote', out, `(${paths.length} ribbons, ${svg.length} bytes)`)
