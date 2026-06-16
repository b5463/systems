<script setup>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  confirmText: { type: String, default: 'Confirm' },
  tone: { type: String, default: 'default' }, // 'default' | 'danger'
  busy: { type: Boolean, default: false },
  // If set, the user must type this exact value to enable confirm.
  requireText: { type: String, default: '' }
})
const emit = defineEmits(['update:open', 'confirm', 'cancel'])

const typed = ref('')
const inputEl = ref(null)
const confirmEl = ref(null)
let lastFocused = null

const canConfirm = () => !props.requireText || typed.value === props.requireText

function close() { emit('update:open', false); emit('cancel') }
function confirm() { if (canConfirm() && !props.busy) emit('confirm') }
function onKeydown(e) { if (e.key === 'Escape') { e.stopPropagation(); close() } }

watch(() => props.open, (v) => {
  if (v) {
    typed.value = ''
    lastFocused = document.activeElement
    document.addEventListener('keydown', onKeydown)
    nextTick(() => (props.requireText ? inputEl.value : confirmEl.value)?.focus?.())
  } else {
    document.removeEventListener('keydown', onKeydown)
    if (lastFocused) { lastFocused.focus && lastFocused.focus(); lastFocused = null }
  }
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="modal-backdrop" @click.self="close">
        <div class="modal stack" role="dialog" aria-modal="true" :aria-label="title">
          <h3 style="margin:0">{{ title }}</h3>
          <div class="stack" style="gap:10px"><slot /></div>
          <template v-if="requireText">
            <label class="label" style="margin:0">Type <span class="mono" style="color:var(--text)">{{ requireText }}</span> to confirm</label>
            <input ref="inputEl" v-model="typed" :placeholder="requireText" aria-label="Type to confirm" autocapitalize="none" autocorrect="off" @keydown.enter="confirm" />
          </template>
          <div class="btn-row">
            <button class="btn" :disabled="busy" @click="close">Cancel</button>
            <button ref="confirmEl" class="btn" :class="tone === 'danger' ? 'btn-danger' : 'btn-primary'" :disabled="busy || !canConfirm()" @click="confirm">
              <span v-if="busy" class="spinner"></span><span v-else>{{ confirmText }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
