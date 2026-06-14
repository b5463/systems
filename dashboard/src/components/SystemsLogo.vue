<script setup>
// SYSTEMS. brand lockup — uses the OFFICIAL wordmark asset as the source of
// truth (white variant for the dark UI). The logo is never redrawn or
// restyled here; we only size it. If the asset is missing we fall back to a
// plain text wordmark so the UI never shows a broken image.
import { ref } from 'vue'

defineProps({
  size: { type: String, default: 'sm' }, // 'sm' | 'lg'
  byline: { type: Boolean, default: true }
})

const failed = ref(false)
</script>

<template>
  <span class="lockup" :class="{ lg: size === 'lg' }">
    <img
      v-if="!failed"
      class="brand-img"
      :class="{ lg: size === 'lg' }"
      src="/brand/systems-wordmark-white.png"
      alt="SYSTEMS."
      decoding="async"
      @error="failed = true"
    />
    <span v-else class="mark">SYSTEMS<span class="dot">.</span></span>
    <span v-if="byline" class="by">by Acronym</span>
  </span>
</template>

<style scoped>
.brand-img {
  display: block;
  height: 14px;
  width: auto;
}
.brand-img.lg {
  height: 20px;
}
</style>
