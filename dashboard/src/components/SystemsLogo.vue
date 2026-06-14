<script setup>
// SYSTEMS. brand lockup — "SYSTEMS." wordmark with the period as the only
// accented glyph, and a quiet "by Acronym" byline.
defineProps({
  size: { type: String, default: 'sm' }, // 'sm' | 'lg'
  byline: { type: Boolean, default: true }
})
</script>

<template>
  <span class="lockup" :class="{ lg: size === 'lg' }">
    <span class="mark">SYSTEMS<span class="dot">.</span></span>
    <span v-if="byline" class="by">by Acronym</span>
  </span>
</template>
