<script setup>
/**
 * SYSTEMS. — white abstract ASCII chaos field.
 *
 * Real monospace characters whose positions are driven by a De Jong strange
 * attractor. Character DENSITY (how many orbit points land in a cell) chooses
 * the glyph and its brightness, producing an evolving white-on-black text
 * sculpture — orbital and chaotic, never a node/edge diagram.
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

// De Jong attractor base parameters (chosen for an elegant orbital form).
const P = { a: 1.641, b: 1.902, c: 0.316, d: 1.525 }

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

  // Slow parameter drift gives barely-alive motion.
  const a = P.a + Math.sin(t * 0.11) * 0.18
  const b = P.b + Math.cos(t * 0.09) * 0.18
  const c = P.c + Math.sin(t * 0.07) * 0.22
  const d = P.d + Math.cos(t * 0.13) * 0.16

  // Iterate the attractor; accumulate orbit-point density per character cell.
  let x = 0.1, y = 0.1
  const iters = Math.min(26000, cols * rows * 5)
  let max = 1
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
