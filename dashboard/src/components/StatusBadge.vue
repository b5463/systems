<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: { type: String, default: 'stopped' }
})

const cls = computed(() => {
  switch (props.status) {
    case 'running':
      return 'badge-running'
    case 'building':
      return 'badge-building'
    case 'error':
      return 'badge-error'
    default:
      return 'badge-stopped'
  }
})
</script>

<template>
  <span class="badge" :class="cls">
    <span class="dot"></span>
    {{ status || 'unknown' }}
  </span>
</template>
