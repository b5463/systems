<script setup>
// Brand icon set. Stroke-based, inherits currentColor (see docs/BRAND.md §5).
// Add new icons here — never inline ad-hoc SVG or use Unicode glyphs in views.
defineProps({
  name: { type: String, required: true },
  // Optional explicit size; defaults to 1em so it scales with surrounding text.
  size: { type: [Number, String], default: null },
})

const PATHS = {
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
  'arrow-up': 'M12 19V5M6 11l6-6 6 6',
  'arrow-down': 'M12 5v14M6 13l6 6 6-6',
  'arrow-up-right': 'M7 17 17 7M8 7h9v9',
  'chevron-right': 'M9 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 6.5',
  close: 'M6 6l12 12M18 6 6 18',
  'caps-lock': 'M12 4l7 7h-4v4H9v-4H5l7-7ZM9 19h6',
}
</script>

<template>
  <svg
    class="icon"
    :style="size ? { width: typeof size === 'number' ? size + 'px' : size, height: typeof size === 'number' ? size + 'px' : size } : null"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle v-if="name === 'circle'" cx="12" cy="12" r="7" />
    <path v-else :d="PATHS[name]" />
  </svg>
</template>

<style scoped>
.icon {
  width: 1em;
  height: 1em;
  display: inline-block;
  vertical-align: -0.125em;
  flex-shrink: 0;
}
</style>
