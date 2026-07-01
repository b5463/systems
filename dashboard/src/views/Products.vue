<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, ApiError } from '../api/client'
import Icon from '../components/Icon.vue'
import PaginationControls from '../components/PaginationControls.vue'

const loading = ref(true)
const error = ref('')
const v4Disabled = ref(false)

const systems = ref([])
const systemsPagination = ref(null)
const systemsPage = ref(1)

const products = ref([])
const productsPagination = ref(null)
const productsPage = ref(1)

const systemsPageCount = computed(() =>
  systemsPagination.value ? systemsPagination.value.totalPages : 1
)
const productsPageCount = computed(() =>
  productsPagination.value ? productsPagination.value.totalPages : 1
)

async function loadSystems(page = 1) {
  try {
    const data = await api.get(`/systems?page=${page}&per_page=20`)
    systems.value = data.systems || []
    systemsPagination.value = data.pagination || null
    systemsPage.value = page
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      v4Disabled.value = true
    } else {
      error.value = e.message || 'Failed to load systems'
    }
  }
}

async function loadProducts(page = 1) {
  try {
    const data = await api.get(`/products?page=${page}&per_page=20`)
    products.value = data.products || []
    productsPagination.value = data.pagination || null
    productsPage.value = page
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) {
      error.value = e.message || 'Failed to load products'
    }
  }
}

onMounted(async () => {
  await loadSystems(1)
  if (!v4Disabled.value) {
    await loadProducts(1)
  }
  loading.value = false
})
</script>

<template>
  <div class="products-view">
    <div class="page-header">
      <div class="page-header-left">
        <h1 class="page-title">Products <span class="badge badge-beta">V4 Beta</span></h1>
        <p class="page-subtitle">V4 Products &amp; Systems — available when <code>ENABLE_V4_SYSTEMS=true</code></p>
      </div>
    </div>

    <div v-if="v4Disabled" class="card notice-card" style="margin-bottom: 24px">
      <div class="notice-icon"><Icon name="info" /></div>
      <div class="notice-body">
        <strong>V4 Systems API is not enabled.</strong>
        <p class="small muted" style="margin: 4px 0 0">
          Set <code>ENABLE_V4_SYSTEMS=true</code> in your environment to activate V4 read APIs.
          The Products and Systems endpoints return 404 until the flag is set.
        </p>
      </div>
    </div>

    <div v-else-if="loading" class="loading-state muted">Loading V4 data…</div>

    <div v-else-if="error" class="card error-card">{{ error }}</div>

    <template v-else>
      <!-- Systems section -->
      <section style="margin-bottom: 32px">
        <h2 class="section-label">Systems</h2>
        <div v-if="systems.length === 0" class="card stack">
          <div class="hint">No systems found. Systems are migrated from Projects once Phase 2 tables are available.</div>
        </div>
        <div v-else class="card" style="padding: 0; overflow: hidden">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Slug</th>
                <th>Name</th>
                <th>Status</th>
                <th>Type</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sys in systems" :key="sys.id">
                <td class="mono small">{{ sys.id }}</td>
                <td class="mono">{{ sys.slug }}</td>
                <td>{{ sys.name }}</td>
                <td><span :class="`sdot ${sys.status}`"></span> {{ sys.status }}</td>
                <td class="small muted">{{ sys.type }}</td>
                <td><span class="badge badge-compat">{{ sys._source }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <PaginationControls
          v-if="systemsPageCount > 1"
          :page="systemsPage"
          :pageCount="systemsPageCount"
          :total="systemsPagination && systemsPagination.total"
          noun="system"
          @update:page="loadSystems"
        />
      </section>

      <!-- Products section -->
      <section>
        <h2 class="section-label">Products</h2>
        <div v-if="products.length === 0" class="card stack">
          <div class="hint">
            No products yet. Products are a V4 concept — they will be populated once
            Phase 2 database tables are available.
          </div>
        </div>
        <div v-else class="card" style="padding: 0; overflow: hidden">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Slug</th>
                <th>Name</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="product in products" :key="product.id">
                <td class="mono small">{{ product.id }}</td>
                <td class="mono">{{ product.slug }}</td>
                <td>{{ product.name }}</td>
                <td>{{ product.status }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <PaginationControls
          v-if="productsPageCount > 1"
          :page="productsPage"
          :pageCount="productsPageCount"
          :total="productsPagination && productsPagination.total"
          noun="product"
          @update:page="loadProducts"
        />
      </section>
    </template>
  </div>
</template>

<style scoped>
.products-view {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px 48px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
  padding-top: 32px;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0 0 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-subtitle {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.section-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0 0 12px;
}

.badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.6;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge-beta {
  background: color-mix(in srgb, var(--accent, #7c6eea) 15%, transparent);
  color: var(--accent, #7c6eea);
  vertical-align: middle;
}

.badge-compat {
  background: color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent);
  color: var(--warning, #b45309);
  font-size: 0.65rem;
}

.notice-card {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 16px;
  border-left: 3px solid var(--accent, #7c6eea);
}

.notice-icon {
  flex-shrink: 0;
  color: var(--accent, #7c6eea);
  margin-top: 2px;
}

.notice-body { flex: 1; }

.error-card {
  padding: 16px;
  color: var(--error, #ef4444);
}

.loading-state {
  padding: 48px 0;
  text-align: center;
  font-size: 0.875rem;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.data-table th {
  text-align: left;
  padding: 10px 16px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-soft);
}

.data-table td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-soft);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.mono { font-family: monospace; }
</style>
