<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, required: true }, // [{ value: string, label: string }]
  placeholder: { type: String, default: 'Select…' },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const focusedIdx = ref(-1)
const rootRef = ref(null)
let queryStr = ''
let queryTimer = null

const current = computed(() => props.options.find((o) => o.value === props.modelValue) || null)

function openMenu() {
  open.value = true
  focusedIdx.value = props.options.findIndex((o) => o.value === props.modelValue)
  if (focusedIdx.value < 0) focusedIdx.value = 0
}

function close() {
  open.value = false
  focusedIdx.value = -1
}

function select(value) {
  emit('update:modelValue', value)
  close()
}

function onTriggerKeydown(e) {
  if (!open.value) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault()
      openMenu()
    }
    return
  }
  if (e.key === 'Escape') { e.preventDefault(); close() }
  else if (e.key === 'ArrowDown') { e.preventDefault(); focusedIdx.value = Math.min(focusedIdx.value + 1, props.options.length - 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); focusedIdx.value = Math.max(focusedIdx.value - 1, 0) }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (focusedIdx.value >= 0) select(props.options[focusedIdx.value].value) }
  else if (e.key === 'Tab') { close() }
  else if (e.key.length === 1) {
    clearTimeout(queryTimer)
    queryStr += e.key.toLowerCase()
    const idx = props.options.findIndex((o) => o.label.toLowerCase().startsWith(queryStr))
    if (idx >= 0) focusedIdx.value = idx
    queryTimer = setTimeout(() => { queryStr = '' }, 600)
  }
}

function onOutsideClick(e) {
  if (rootRef.value && !rootRef.value.contains(e.target)) close()
}

onMounted(() => document.addEventListener('mousedown', onOutsideClick))
onBeforeUnmount(() => { document.removeEventListener('mousedown', onOutsideClick); clearTimeout(queryTimer) })
</script>

<template>
  <div ref="rootRef" class="select-menu" :class="{ open }">
    <button
      class="select-trigger"
      type="button"
      role="combobox"
      :aria-expanded="String(open)"
      aria-haspopup="listbox"
      @click="open ? close() : openMenu()"
      @keydown="onTriggerKeydown"
    >
      <span :class="{ dim: !current }">{{ current ? current.label : placeholder }}</span>
      <svg class="sm-chevron" viewBox="0 0 10 6" fill="none">
        <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <ul v-if="open" class="select-list" role="listbox" :aria-label="placeholder">
      <li
        v-for="(opt, i) in options"
        :key="opt.value"
        class="select-option"
        :class="{ 'is-selected': opt.value === modelValue, 'is-focused': i === focusedIdx }"
        role="option"
        :aria-selected="String(opt.value === modelValue)"
        @mousedown.prevent="select(opt.value)"
        @mousemove="focusedIdx = i"
      >{{ opt.label }}</li>
    </ul>
  </div>
</template>
