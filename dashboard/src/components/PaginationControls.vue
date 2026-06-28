<script setup>
import Icon from './Icon.vue'

const props = defineProps({
  page: { type: Number, required: true },
  pageCount: { type: Number, required: true },
  total: { type: Number, default: null },
  noun: { type: String, default: 'item' },
})

const emit = defineEmits(['update:page'])

function go(n) {
  if (n < 1 || n > props.pageCount) return
  emit('update:page', n)
}
</script>

<template>
  <div v-if="pageCount > 1" class="pg-controls">
    <button class="btn btn-sm btn-ghost" :disabled="page === 1" @click="go(page - 1)">
      <Icon name="arrow-left" /> Prev
    </button>
    <span class="small muted">
      Page {{ page }} of {{ pageCount }}<template v-if="total != null"> · {{ total }} {{ total === 1 ? noun : noun + 's' }}</template>
    </span>
    <button class="btn btn-sm btn-ghost" :disabled="page === pageCount" @click="go(page + 1)">
      Next <Icon name="arrow-right" />
    </button>
  </div>
</template>

<style scoped>
.pg-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-soft);
}
</style>
