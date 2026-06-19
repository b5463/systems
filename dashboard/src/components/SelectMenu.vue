<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, required: true }, // [{ value: string, label: string }]
  placeholder: { type: String, default: 'Select…' },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const focusedIdx = ref(-1)
const rootRef = ref(null)
const listRef = ref(null)
const menuStyle = ref({})
let queryStr = ''
let queryTimer = null

const current = computed(() => props.options.find((o) => o.value === props.modelValue) || null)

// The list is teleported to <body> with fixed positioning so it always paints
// above page content and is never clipped by a card's overflow/stacking context.
function positionList() {
  const el = rootRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const spaceBelow = window.innerHeight - r.bottom
  const estHeight = Math.min(260, props.options.length * 38 + 8)
  const placeAbove = spaceBelow < estHeight && r.top > spaceBelow
  menuStyle.value = {
    position: 'fixed',
    left: `${r.left}px`,
    width: `${r.width}px`,
    right: 'auto',
    zIndex: 300,
    ...(placeAbove
      ? { bottom: `${window.innerHeight - r.top + 4}px`, top: 'auto' }
      : { top: `${r.bottom + 4}px`, bottom: 'auto' }),
  }
}

function openMenu() {
  open.value = true
  focusedIdx.value = props.options.findIndex((o) => o.value === props.modelValue)
  if (focusedIdx.value < 0) focusedIdx.value = 0
  nextTick(positionList)
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
  const inRoot = rootRef.value && rootRef.value.contains(e.target)
  const inList = listRef.value && listRef.value.contains(e.target)
  if (!inRoot && !inList) close()
}
// While open, keep the teleported list pinned to the trigger; close on big jumps.
function onReposition() { if (open.value) positionList() }

onMounted(() => {
  document.addEventListener('mousedown', onOutsideClick)
  window.addEventListener('resize', onReposition)
  window.addEventListener('scroll', onReposition, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onOutsideClick)
  window.removeEventListener('resize', onReposition)
  window.removeEventListener('scroll', onReposition, true)
  clearTimeout(queryTimer)
})
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
    <Teleport to="body">
      <ul
        v-if="open"
        ref="listRef"
        class="select-list select-list-floating"
        :style="menuStyle"
        role="listbox"
        :aria-label="placeholder"
      >
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
    </Teleport>
  </div>
</template>
