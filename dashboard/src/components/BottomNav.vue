<script setup>
const items = [
  { to: { name: 'projects' }, label: 'Apps', ico: '▦' },
  { to: { name: 'deploy' }, label: 'Deploy', ico: '↑' },
  { to: { name: 'activity' }, label: 'Activity', ico: '≡' },
  { to: { name: 'account' }, label: 'Account', ico: '○' }
]
</script>

<template>
  <nav class="bottom-nav">
    <router-link v-for="it in items" :key="it.label" :to="it.to">
      <span class="nav-ico">{{ it.ico }}</span>
      <span>{{ it.label }}</span>
    </router-link>
  </nav>
</template>
