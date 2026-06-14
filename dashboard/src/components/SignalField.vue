<script setup>
/**
 * SYSTEMS. — live "Chaos Signal Field" canvas.
 *
 * A monochrome node-field with nearest-neighbour routing traces that drifts
 * very slowly. Used only for brand moments (login hero, deploy success).
 * Decorative and inert: aria-hidden, pointer-events:none, and it renders a
 * single static frame when the user prefers reduced motion.
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  count: { type: Number, default: 90 },
  seed: { type: Number, default: 2099 },
  intensity: { type: Number, default: 1 }, // opacity multiplier
  animate: { type: Boolean, default: true },
  links: { type: Number, default: 3 }       // neighbours per node
})

const canvas = ref(null)
let ctx, raf, ro
let nodes = []
let w = 0, h = 0, dpr = 1
let t = 0
let reduced = false

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let x = Math.imul(a ^ (a >>> 15), 1 | a)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function build() {
  const r = mulberry32(props.seed)
  nodes = Array.from({ length: props.count }, () => ({
    bx: r(), by: r(),                 // base position (0..1)
    px: 0, py: 0,                     // pixel position
    amp: 4 + r() * 14,                // drift amplitude
    ph: r() * Math.PI * 2,            // phase
    sp: 0.15 + r() * 0.45,            // drift speed
    s: 0.6 + r() * 1.7,               // radius
    hot: r() > 0.86
  }))
}

function resize() {
  if (!canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  w = Math.max(1, rect.width)
  h = Math.max(1, rect.height)
  canvas.value.width = Math.floor(w * dpr)
  canvas.value.height = Math.floor(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  if (reduced) draw()
}

function positions() {
  for (const nd of nodes) {
    const d = reduced ? 0 : Math.sin(t * nd.sp + nd.ph)
    nd.px = nd.bx * w + Math.cos(t * nd.sp * 0.7 + nd.ph) * nd.amp
    nd.py = nd.by * h + d * nd.amp
  }
}

function draw() {
  if (!ctx) return
  positions()
  ctx.clearRect(0, 0, w, h)
  const op = props.intensity

  // routing traces — nearest neighbours
  ctx.lineWidth = 0.8
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]
    const near = []
    for (let j = 0; j < nodes.length; j++) {
      if (j === i) continue
      const dx = nodes[j].px - a.px, dy = nodes[j].py - a.py
      near.push({ j, d: dx * dx + dy * dy })
    }
    near.sort((x, y) => x.d - y.d)
    for (let kx = 0; kx < props.links && kx < near.length; kx++) {
      const b = nodes[near[kx].j]
      const dist = Math.sqrt(near[kx].d)
      const fade = Math.max(0, 1 - dist / (Math.min(w, h) * 0.55))
      ctx.strokeStyle = `rgba(255,255,255,${(0.16 * fade * op).toFixed(3)})`
      ctx.beginPath()
      ctx.moveTo(a.px, a.py)
      ctx.lineTo(b.px, b.py)
      ctx.stroke()
    }
  }

  // nodes
  for (const nd of nodes) {
    if (nd.hot) {
      ctx.strokeStyle = `rgba(255,255,255,${(0.18 * op).toFixed(3)})`
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.arc(nd.px, nd.py, nd.s * 3.4, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.fillStyle = `rgba(255,255,255,${((nd.hot ? 0.85 : 0.4) * op).toFixed(3)})`
    ctx.beginPath()
    ctx.arc(nd.px, nd.py, nd.hot ? nd.s * 1.5 : nd.s, 0, Math.PI * 2)
    ctx.fill()
  }
}

function loop() {
  t += 0.006
  draw()
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  ctx = canvas.value.getContext('2d')
  reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  build()
  resize()
  ro = new ResizeObserver(resize)
  ro.observe(canvas.value)
  if (props.animate && !reduced) loop()
  else draw()
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (ro) ro.disconnect()
})
</script>

<template>
  <canvas ref="canvas" class="signal-field" aria-hidden="true"></canvas>
</template>

<style scoped>
.signal-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}
</style>
