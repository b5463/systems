<script setup>
// Brand icon set. Stroke-based, inherits currentColor (see docs/BRAND.md §5).
// Add new icons here — never inline ad-hoc SVG or use Unicode glyphs in views.
// Each entry is the inner SVG markup (paths/circles/rects); the wrapper sets
// the shared stroke style so every icon renders identically.
defineProps({
  name: { type: String, required: true },
  // Optional explicit size; defaults to 1em so it scales with surrounding text.
  size: { type: [Number, String], default: null },
})

const ICONS = {
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
  'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
  'arrow-up-right': '<path d="M7 17 17 7M8 7h9v9"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 6.5"/>',
  circle: '<circle cx="12" cy="12" r="7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  'caps-lock': '<path d="M12 4l7 7h-4v4H9v-4H5l7-7ZM9 19h6"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M3 19h18"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  'alert-triangle': '<path d="M12 3 2 19h20L12 3Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M9.9 5.1A9 9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.2 6.2A17 17 0 0 0 2 12s3.5 7 10 7a9 9 0 0 0 3.9-.9"/><path d="M3 3l18 18"/>',
  docker: '<rect x="3" y="9" width="4" height="4"/><rect x="8" y="9" width="4" height="4"/><rect x="13" y="9" width="4" height="4"/><path d="M3 16h15a4 4 0 0 0 4-4"/>',
  proxy: '<path d="M4 12h16"/><path d="M4 12a8 8 0 0 1 8-8"/><path d="M20 12a8 8 0 0 1-8 8"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.5 4 5.6 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.6-4-9s1.5-6.5 4-9Z"/>',
}
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html — static internal markup, no user input -->
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
    v-html="ICONS[name] || ''"
  />
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
