<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api/client'
import TopBar from '../components/TopBar.vue'
import PullToRefresh from '../components/PullToRefresh.vue'

const entries = ref([])
const loading = ref(true)
const error = ref('')

function fmtDate(s) {
  if (!s) return ''
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString()
}

async function load() {
  error.value = ''
  try {
    const data = await api.get('/audit')
    entries.value = data.entries || []
  } catch (e) {
    if (e.status !== 401) error.value = e.message || 'Failed to load activity.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <TopBar title="Activity">
    <template #actions>
      <button class="iconbtn" aria-label="Refresh" @click="load">⟳</button>
    </template>
  </TopBar>

  <PullToRefresh @refresh="load">
    <div class="page">
      <div v-if="loading" class="center" style="padding: 48px"><div class="spinner"></div></div>
      <div v-else-if="error" class="error-box">{{ error }}</div>
      <div v-else-if="!entries.length" class="empty">
        <svg class="empty-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <line x1="3" y1="5" x2="21" y2="5"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
          <line x1="3" y1="15" x2="14" y2="15"/>
        </svg>
        <p>No activity yet.</p>
      </div>

      <div v-else class="stack">
        <div v-for="e in entries" :key="e.id" class="card">
          <div class="spread">
            <strong>{{ e.action }}</strong>
            <span class="dim small">{{ fmtDate(e.created_at) }}</span>
          </div>
          <div v-if="e.target" class="mono small muted" style="margin-top: 4px">
            {{ e.target }}
          </div>
          <div v-if="e.detail" class="small muted" style="margin-top: 4px">{{ e.detail }}</div>
          <div class="row small dim" style="margin-top: 8px; gap: 14px">
            <span v-if="e.username" class="mono">{{ e.username }}</span>
            <span v-if="e.ip" class="mono">{{ e.ip }}</span>
          </div>
        </div>
      </div>
    </div>
  </PullToRefresh>
</template>
