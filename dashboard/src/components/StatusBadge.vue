<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: 'stopped' }
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
  error: 'Failed',
  stopped: 'Stopped'
}

const label = computed(() => {
  if (!props.status) return 'Unknown'
  return LABELS[props.status] || (props.status.charAt(0).toUpperCase() + props.status.slice(1))
})
</script>

<template>
  <span class="badge" :class="cls">
    <span class="dot"></span>
    {{ label }}
  </span>
</template>
