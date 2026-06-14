<template>
  <div class="skel-card" :style="{ animationDelay: delay + 'ms' }">
    <div v-if="hasHeader" class="spread" style="margin-bottom: 12px">
      <div style="flex: 1">
        <div class="skel skel-title" style="width: 50%"></div>
      </div>
      <div v-if="hasBadge" class="skel skel-badge"></div>
    </div>
    <div
      v-for="i in lines"
      :key="i"
      class="skel skel-line"
      :style="{ width: 85 - i * 12 + '%' }"
    ></div>
  </div>
</template>

<script setup>
defineProps({
  lines: { type: Number, default: 2 },
  hasHeader: { type: Boolean, default: true },
  hasBadge: { type: Boolean, default: false },
  delay: { type: Number, default: 0 }
})
</script>
