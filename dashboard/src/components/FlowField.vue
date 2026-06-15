<script setup>
/**
 * SYSTEMS. — organic flowing-ribbon field.
 *
 * Smooth meandering ribbons traced along a curl-like flow field (layered
 * sin/cos), drawn as thick round-capped strokes — the hand-drawn "doodle"
 * look. Soft pastel palette on near-black. The field phase drifts slowly, so
 * the ribbons gently undulate (the "moving" animation).
 *
 * Decorative and inert: aria-hidden, pointer-events:none. Renders a single
 * static frame when the user prefers reduced motion.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  animate: { type: Boolean, default: true },
  intensity: { type: Number, default: 1 },          // opacity multiplier
  density: { type: Number, default: 0.75 },         // ribbon-count multiplier
  alpha: { type: Number, default: 0.5 },            // base stroke opacity
  widthFactor: { type: Number, default: 0.03 },     // ribbon thickness vs min(w,h)
  glowFactor: { type: Number, default: 0.4 },       // soft glow vs line width
  speed: { type: Number, default: 0.008 },          // undulation speed
  // Muted, dusty pastels — soft on near-black.
  palette: { type: Array, default: () => ['#d6b3c0', '#aab6d2', '#b0cdbf', '#d6cab2', '#c8bcd2'] }
})

const canvas = ref(null)
let ctx, raf, ro
let w = 0, h = 0, dpr = 1
let t = 0, last = 0, reduced = false
let seeds = []

// Curl-like flow field: nested sin/cos gives organic, non-repeating meanders.
function angleAt(nx, ny, time) {
  const x = nx * 3.0, y = ny * 3.0
  const a =
    Math.sin(x * 1.3 + Math.cos(y * 0.7) * 1.5 + time) +
    Math.sin(y * 1.1 - Math.cos(x * 0.9) * 1.3 - time * 0.8)
  return a * Math.PI
}

function makeSeeds() {
  // Jittered grid of seed points (some off-canvas so ribbons enter/exit).
  seeds = []
  const cols = Math.max(3, Math.round(5 * props.density))
  let rows = Math.max(3, Math.round(4 * props.density))
  // Add rows on tall (portrait) canvases so ribbons fill the height instead of
  // leaving sparse gaps — keeps roughly even coverage regardless of aspect.
  if (h > w) rows = Math.round(rows * (h / w))
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const jx = (Math.sin(i * 12.9 + j * 4.1) * 0.5 + 0.5) * 0.18
      const jy = (Math.sin(i * 3.7 + j * 7.3) * 0.5 + 0.5) * 0.18
      seeds.push({
        x: (i + 0.5) / cols + jx - 0.09,
        y: (j + 0.5) / rows + jy - 0.09,
        c: props.palette[(i * rows + j) % props.palette.length],
      })
    }
  }
}

function resize() {
  if (!canvas.value) return
  const r = canvas.value.getBoundingClientRect()
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  w = Math.max(1, r.width); h = Math.max(1, r.height)
  canvas.value.width = Math.floor(w * dpr)
  canvas.value.height = Math.floor(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  makeSeeds()   // seed count depends on the canvas aspect ratio
  draw()
}

// Trace one ribbon from a seed, forward then backward, as a single smooth path.
function ribbonPath(seed, time) {
  const STEP = 0.006, STEPS = 150
  const pts = []
  for (const dir of [1, -1]) {
    let x = seed.x, y = seed.y
    const local = []
    for (let s = 0; s < STEPS; s++) {
      const ang = angleAt(x, y, time)
      x += Math.cos(ang) * STEP * dir
      y += Math.sin(ang) * STEP * dir
      if (x < -0.3 || x > 1.3 || y < -0.3 || y > 1.3) break
      local.push([x * w, y * h])
    }
    if (dir === 1) pts.push(...local.reverse())
    else pts.push(...local)
  }
  return pts
}

function draw() {
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // On portrait (narrow) screens the min dimension is the width, which makes
  // ribbons read thin — boost thickness so they stay bold like the reference.
  const portraitBoost = h > w ? 1.55 : 1
  const lw = Math.max(9, Math.min(w, h) * props.widthFactor * portraitBoost)

  for (const seed of seeds) {
    const pts = ribbonPath(seed, t)
    if (pts.length < 3) continue
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.lineWidth = lw
    ctx.globalAlpha = Math.min(0.85, props.alpha * props.intensity)
    ctx.strokeStyle = seed.c
    ctx.shadowBlur = lw * props.glowFactor          // soft pastel glow
    ctx.shadowColor = seed.c
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

function loop(ts) {
  if (ts - last > 60) { // ~16fps, calm
    t += props.speed
    draw()
    last = ts
  }
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  ctx = canvas.value.getContext('2d')
  reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  resize() // sizes the canvas, seeds (aspect-aware), and draws
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
  <canvas ref="canvas" class="flow-field" aria-hidden="true"></canvas>
</template>

<style scoped>
.flow-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}
</style>
