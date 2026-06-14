<script setup>
// Line-style nav glyphs for the SYSTEMS. shell. No decorative icons —
// each maps to one operational surface.
defineProps({ name: { type: String, required: true } })
</script>

<template>
  <svg viewBox="0 0 24 24" class="nav-svg">
    <template v-if="name === 'systems'">
      <rect x="3" y="3" width="7" height="7" rx="1.4" />
      <rect x="14" y="3" width="7" height="7" rx="1.4" />
      <rect x="3" y="14" width="7" height="7" rx="1.4" />
      <rect x="14" y="14" width="7" height="7" rx="1.4" />
    </template>
    <template v-else-if="name === 'ship'">
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 21h14" />
      <path d="M5 17h14" />
    </template>
    <template v-else-if="name === 'events'">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
    </template>
    <template v-else-if="name === 'server'">
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <path d="M7 7.5h.01M7 16.5h.01" />
    </template>
    <template v-else>
      <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Z" />
    </template>
  </svg>
</template>

<style scoped>
.nav-svg {
  width: 19px;
  height: 19px;
  flex-shrink: 0;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
