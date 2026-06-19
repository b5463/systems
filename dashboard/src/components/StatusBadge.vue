<script setup>
import { computed } from 'vue'
import { deriveState } from '../utils/status'

const props = defineProps({
  // Preferred: pass the whole project so status is derived from the one truth
  // model (runtime + route + health + visibility).
  project: { type: Object, default: null },
  // Legacy fallback (container status only) — used where only a status string
  // is available. Does not know route/health, so cannot resolve to "Live".
  status: { type: String, default: '' },
  crashed: { type: Boolean, default: false }
})

const state = computed(() =>
  props.project
    ? deriveState(props.project)
    : deriveState({ status: props.status, image_id: props.crashed ? 'x' : null })
)

const TONE_CLASS = {
  ok: 'badge-running',
  building: 'badge-building',
  warn: 'badge-warn',
  error: 'badge-error',
  idle: 'badge-stopped'
}
const cls = computed(() => TONE_CLASS[state.value.tone] || 'badge-stopped')
const label = computed(() => state.value.label)
</script>

<template>
  <span class="badge" :class="cls">
    <span class="dot"></span>
    {{ label }}
  </span>
</template>
