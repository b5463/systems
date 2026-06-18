const DEFAULT_PROPS = {
  animate: true,
  intensity: 1,
  density: 0.75,
  alpha: 0.5,
  widthFactor: 0.03,
  glowFactor: 0.4,
  speed: 0.008,
  fps: 30,
  maxDpr: 1.5,
  palette: ['#d6b3c0', '#aab6d2', '#b0cdbf', '#d6cab2', '#c8bcd2'],
}

let canvas = null
let ctx = null
let props = { ...DEFAULT_PROPS }
let w = 0
let h = 0
let dpr = 1
let t = 0
let last = 0
let timer = null
let running = false
let seeds = []

function angleAt(nx, ny, time) {
  const x = nx * 3.0
  const y = ny * 3.0
  const a =
    Math.sin(x * 1.3 + Math.cos(y * 0.7) * 1.5 + time) +
    Math.sin(y * 1.1 - Math.cos(x * 0.9) * 1.3 - time * 0.8)
  return a * Math.PI
}

function makeSeeds() {
  seeds = []
  const cols = Math.max(3, Math.round(5 * props.density))
  let rows = Math.max(3, Math.round(4 * props.density))
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

function resize({ width, height, pixelRatio }) {
  if (!canvas || !ctx) return
  dpr = Math.min(pixelRatio || 1, props.maxDpr || 1.5)
  w = Math.max(1, width)
  h = Math.max(1, height)
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  makeSeeds()
  draw()
}

function ribbonPath(seed, time) {
  const STEP = 0.006
  const STEPS = 150
  const pts = []
  for (const dir of [1, -1]) {
    let x = seed.x
    let y = seed.y
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

  const portraitBoost = h > w ? 1.55 : 1
  const lw = Math.max(9, Math.min(w, h) * props.widthFactor * portraitBoost)
  const alpha = Math.min(0.85, props.alpha * props.intensity)

  for (const seed of seeds) {
    const pts = ribbonPath(seed, t)
    if (pts.length < 3) continue
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])

    ctx.lineWidth = lw
    ctx.globalAlpha = alpha
    ctx.strokeStyle = seed.c
    ctx.stroke()
  }

  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  ctx.filter = 'none'
}

function tick() {
  if (!running) return
  const now = performance.now()
  if (!last) last = now
  const elapsed = now - last
  const frameMs = 1000 / Math.max(1, props.fps || 30)

  if (elapsed >= frameMs) {
    t += props.speed * (elapsed / 60)
    draw()
    last = now
  }

  timer = setTimeout(tick, Math.max(0, frameMs - (performance.now() - now)))
}

function start() {
  if (running || !props.animate) return
  running = true
  last = 0
  tick()
}

function stop() {
  running = false
  if (timer) clearTimeout(timer)
  timer = null
  last = 0
}

self.onmessage = (event) => {
  const message = event.data
  if (!message || !message.type) return

  if (message.type === 'init') {
    canvas = message.canvas
    props = { ...DEFAULT_PROPS, ...message.props }
    ctx = canvas.getContext('2d')
    if (message.size) resize(message.size)
    if (message.running) start()
    return
  }

  if (message.type === 'resize') {
    resize(message.size)
    return
  }

  if (message.type === 'running') {
    if (message.value) start()
    else stop()
    return
  }

  if (message.type === 'destroy') {
    stop()
  }
}
