<script setup>
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler
} from 'chart.js'

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler
)

const props = defineProps({
  // history: array of { t, cpu, mem, memLimit, rx, tx }
  history: { type: Array, default: () => [] },
  latest: { type: Object, default: null }
})

function fmtBytes(n) {
  if (n == null) return '–'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

const labels = computed(() => props.history.map((p) => p.label))

// Each chart gets its own options object — Chart.js mutates options internally,
// so sharing one instance across both charts causes scale/tooltip cross-talk.
function makeOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true }
    },
    scales: {
      x: { display: false, grid: { display: false } },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(255,255,255,0.06)' },
        ticks: { color: '#8b949e', maxTicksLimit: 4 }
      }
    },
    elements: { point: { radius: 0 } }
  }
}
const cpuOptions = makeOptions()
const memOptions = makeOptions()

const cpuData = computed(() => ({
  labels: labels.value,
  datasets: [
    {
      label: 'CPU %',
      data: props.history.map((p) => p.cpu),
      borderColor: '#5fb0d4',
      backgroundColor: 'rgba(95,176,212,0.12)',
      borderWidth: 2,
      fill: true,
      tension: 0.3
    }
  ]
}))

const memData = computed(() => ({
  labels: labels.value,
  datasets: [
    {
      label: 'Memory MB',
      data: props.history.map((p) => p.mem),
      borderColor: 'rgba(236,236,238,0.7)',
      backgroundColor: 'rgba(236,236,238,0.08)',
      borderWidth: 2,
      fill: true,
      tension: 0.3
    }
  ]
}))

const cpuVal = computed(() =>
  props.latest && props.latest.cpu_percent != null ? `${props.latest.cpu_percent.toFixed(1)}%` : '–'
)
const memVal = computed(() => {
  if (!props.latest) return '–'
  const used = props.latest.memory_mb
  const lim = props.latest.memory_limit_mb
  if (used == null) return '–'
  return lim ? `${used.toFixed(0)} / ${lim.toFixed(0)} MB` : `${used.toFixed(0)} MB`
})
const rxVal = computed(() => (props.latest ? fmtBytes(props.latest.rx_bytes) : '–'))
const txVal = computed(() => (props.latest ? fmtBytes(props.latest.tx_bytes) : '–'))
</script>

<template>
  <div class="stack">
    <div class="card">
      <div class="spread" style="margin-bottom: 10px">
        <span class="label" style="margin: 0">CPU</span>
        <strong class="mono" style="color: var(--accent)">{{ cpuVal }}</strong>
      </div>
      <div style="height: 140px">
        <Line :data="cpuData" :options="cpuOptions" />
      </div>
    </div>

    <div class="card">
      <div class="spread" style="margin-bottom: 10px">
        <span class="label" style="margin: 0">Memory</span>
        <strong class="mono">{{ memVal }}</strong>
      </div>
      <div style="height: 140px">
        <Line :data="memData" :options="memOptions" />
      </div>
    </div>

    <div class="card">
      <div class="spread">
        <div>
          <div class="label" style="margin: 0">Network ↓ Rx</div>
          <strong class="mono">{{ rxVal }}</strong>
        </div>
        <div style="text-align: right">
          <div class="label" style="margin: 0">Network ↑ Tx</div>
          <strong class="mono">{{ txVal }}</strong>
        </div>
      </div>
    </div>
  </div>
</template>
