<script setup>
import { ref } from 'vue'

const emit = defineEmits(['refresh'])
const THRESHOLD = 70

const pull = ref(0)
const refreshing = ref(false)
let startY = 0
let active = false

function onStart(e) {
  // Only engage when scrolled to the very top.
  if (window.scrollY > 0 || refreshing.value) return
  startY = e.touches[0].clientY
  active = true
}

function onMove(e) {
  if (!active) return
  const delta = e.touches[0].clientY - startY
  if (delta <= 0) {
    pull.value = 0
    return
  }
  // Apply resistance.
  pull.value = Math.min(THRESHOLD * 1.5, delta * 0.5)
}

async function onEnd() {
  if (!active) return
  active = false
  if (pull.value >= THRESHOLD) {
    refreshing.value = true
    pull.value = THRESHOLD
    try {
      await emit('refresh')
    } finally {
      refreshing.value = false
      pull.value = 0
    }
  } else {
    pull.value = 0
  }
}
</script>

<template>
  <div
    class="ptr"
    @touchstart.passive="onStart"
    @touchmove.passive="onMove"
    @touchend="onEnd"
    @touchcancel="onEnd"
  >
    <div
      class="ptr-indicator"
      :style="{ height: pull + 'px', opacity: pull > 8 ? 1 : 0 }"
    >
      <span v-if="refreshing" class="spinner"></span>
      <span v-else>{{ pull >= 70 ? 'Release to refresh' : 'Pull to refresh' }}</span>
    </div>
    <div :style="{ transform: `translateY(${pull}px)`, transition: pull ? 'none' : 'transform 0.2s' }">
      <slot />
    </div>
  </div>
</template>
