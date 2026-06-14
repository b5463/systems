<script setup>
import { useRouter } from 'vue-router'

defineProps({
  title: { type: String, default: '' },
  back: { type: Boolean, default: false }
})

const router = useRouter()

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push({ name: 'projects' })
}
</script>

<template>
  <header class="topbar">
    <button v-if="back" class="iconbtn" aria-label="Back" @click="goBack">‹</button>
    <h1>{{ title }}</h1>
    <slot name="actions" />
  </header>
</template>
