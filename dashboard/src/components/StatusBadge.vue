<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: 'stopped' },
  // When status is 'error', distinguish a runtime crash from a build failure.
  crashed: { type: Boolean, default: false }
})

const cls = computed(() => {
  switch (props.status) {
    case 'running':  return 'badge-running'
    case 'building': return 'badge-building'
    case 'error':    return 'badge-error'
    default:         return 'badge-stopped'
  }
})

const LABELS = {
  running: 'Live',
  building: 'Building',
  stopped: 'Stopped'
}

const label = computed(() => {
  if (!props.status) return 'Unknown'
  if (props.status === 'error') return props.crashed ? 'Crashed' : 'Failed'
  return LABELS[props.status] || (props.status.charAt(0).toUpperCase() + props.status.slice(1))
})
</script>

<template>
  <span class="badge" :class="cls">
    <span class="dot"></span>
    {{ label }}
  </span>
</template>
