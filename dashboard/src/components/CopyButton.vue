<script setup>
import { ref } from 'vue'
import { useToast } from '../composables/useToast'

const props = defineProps({
  text: { type: String, required: true },
  label: { type: String, default: '' } // e.g. "URL", "DATABASE_URL"
})
const { showToast } = useToast()
const copied = ref(false)

async function copy() {
  try {
    if (!navigator.clipboard) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(props.text)
    copied.value = true
    showToast(props.label ? `${props.label} copied` : 'Copied', 'success')
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    showToast('Could not copy to clipboard', 'error')
  }
}
</script>

<template>
  <button class="iconbtn copy-btn" :aria-label="label ? `Copy ${label}` : 'Copy'" @click.stop="copy">
    <svg v-if="copied" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--ok)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5" /></svg>
    <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
  </button>
</template>
