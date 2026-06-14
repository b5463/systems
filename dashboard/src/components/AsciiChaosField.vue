<script setup>
/**
 * SYSTEMS. — white abstract ASCII chaos field (Tinkerbell map).
 *
 * Real monospace characters whose positions trace the Tinkerbell chaotic map:
 *   x' = x² − y² + a·x + b·y
 *   y' = 2·x·y + c·x + d·y
 * Character DENSITY (orbit points per cell) chooses the glyph and brightness,
 * so the attractor's curved shape is drawn in white-on-black ASCII. The `a`
 * parameter drifts slowly, which morphs the shape — the "moving" animation.
 *
 * Decorative and inert: aria-hidden, pointer-events:none. Renders a single
 * static frame when the user prefers reduced motion.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  animate: { type: Boolean, default: true },
  intensity: { type: Number, default: 1 },   // overall opacity multiplier
  cell: { type: Number, default: 12 }         // px line-height per character row
})

// Glyph ramp, lightest → heaviest ink. No < > & (XML/HTML safe), no '#'/hacker glyphs.
const RAMP = ['·', '.', ':', ';', '-', '+', '*', 'o']

const canvas = ref(null)
let ctx, raf, ro
let w = 0, h = 0, dpr = 1
let cols = 0, rows = 0, charW = 0, lineH = 0
let grid = null
let t = 0, last = 0, reduced = false

// Tinkerbell map constants (classic values that give the bounded attractor).
const TB = { b: -0.6013, c: 2.0, d: 0.5, x0: -0.72, y0: -0.64 }

function setupGrid() {
  lineH = props.cell
  ctx.font = `${props.cell - 1}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
  ctx.textBaseline = 'alphabetic'
  charW = Math.max(5, ctx.measureText('o').width)
  cols = Math.max(1, Math.floor(w / charW))
  rows = Math.max(1, Math.floor(h / lineH))
  grid = new Float32Array(cols * rows)
}

function resize() {
  if (!canvas.value) return
  const r = canvas.value.getBoundingClientRect()
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  w = Math.max(1, r.width); h = Math.max(1, r.height)
  canvas.value.width = Math.floor(w * dpr)
  canvas.value.height = Math.floor(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  setupGrid()
  draw()
}

function draw() {
  if (!ctx || !grid) return
  grid.fill(0)

  // `a` drifts slowly around 0.9 → the attractor morphs (the moving animation).
  const a = 0.9 + Math.sin(t * 0.12) * 0.009
  const { b, c, d, x0, y0 } = TB
  const iters = Math.min(20000, cols * rows * 4)
  const WARM = 100

  // pass 1 — find the attractor's bounds so it always fits the canvas.
  let x = x0, y = y0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
  for (let i = 0; i < iters; i++) {
    const nx = x * x - y * y + a * x + b * y
    const ny = 2 * x * y + c * x + d * y
    x = nx; y = ny
    if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 1e3) { x = x0; y = y0; continue } // divergence guard
    if (i < WARM) continue
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  const padX = (maxX - minX) * 0.06 || 0.1
  const padY = (maxY - minY) * 0.06 || 0.1
  minX -= padX; maxX += padX; minY -= padY; maxY += padY
  const sx = cols / (maxX - minX), sy = rows / (maxY - minY)

  // pass 2 — same orbit, accumulate density per character cell.
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

  ctx.clearRect(0, 0, w, h)
  const norm = 1 / Math.log(max + 1)
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const v = grid[gy * cols + gx]
      if (!v) continue
      const dens = Math.log(v + 1) * norm           // 0..1
      const lvl = Math.min(RAMP.length - 1, Math.floor(dens * RAMP.length))
      const alpha = Math.min(0.6, 0.1 + dens * 0.62) * props.intensity
      // near-white, drifting toward cool gray at low density
      const g = 232 + Math.round(dens * 12)
      ctx.fillStyle = `rgba(${g},${g},${g + 2},${alpha.toFixed(3)})`
      ctx.fillText(RAMP[lvl], gx * charW, gy * lineH + lineH - 2)
    }
  }
}

function loop(ts) {
  if (ts - last > 66) { // ~15fps, quiet
    t += 0.05
    draw()
    last = ts
  }
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  ctx = canvas.value.getContext('2d')
  reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  resize()
  ro = new ResizeObserver(resize)
  ro.observe(canvas.value)
  if (props.animate && !reduced) raf = requestAnimationFrame(loop)
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (ro) ro.disconnect()
})
</script>

<template>
  <canvas ref="canvas" class="ascii-field" aria-hidden="true"></canvas>
</template>

<style scoped>
.ascii-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}
</style>
