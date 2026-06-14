<script setup>
const items = [
  { to: { name: 'projects' }, label: 'Apps', ico: 'apps' },
  { to: { name: 'deploy' }, label: 'Deploy', ico: 'deploy' },
  { to: { name: 'activity' }, label: 'Activity', ico: 'activity' },
  { to: { name: 'account' }, label: 'Account', ico: 'account' }
]
</script>

<template>
  <nav class="bottom-nav">
    <router-link v-for="it in items" :key="it.label" :to="it.to">
      <span class="nav-ico">
        <svg v-if="it.ico === 'apps'" viewBox="0 0 24 24">
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" />
        </svg>
        <svg v-else-if="it.ico === 'deploy'" viewBox="0 0 24 24">
          <path d="M12 16V4M7 9l5-5 5 5" />
          <path d="M3 20h18" />
        </svg>
        <svg v-else-if="it.ico === 'activity'" viewBox="0 0 24 24">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="14" y2="18" />
        </svg>
        <svg v-else viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      </span>
      <span>{{ it.label }}</span>
    </router-link>
  </nav>
</template>
