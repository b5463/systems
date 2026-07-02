<script setup>
// V4 Phase 2 — hidden admin/test Products page (roadmap: "a simple hidden
// admin/test page", no nav entry). Reachable only by URL at /products, and
// only useful once ENABLE_V4_PRODUCTS is on — otherwise the API answers 404
// and the empty state explains why.
import { ref, onMounted } from 'vue'
import { api } from '../api/client'
import Icon from '../components/Icon.vue'

const products = ref(null)
const error = ref('')
const enabled = ref(true)

const name = ref('')
const slug = ref('')
const creating = ref(false)
const createMsg = ref('')

async function load() {
  error.value = ''
  try {
    const data = await api.get('/products')
    products.value = data.products
    enabled.value = true
  } catch (e) {
    if (e.status === 404) { enabled.value = false; products.value = [] }
    else if (e.status !== 401) error.value = e.message || 'Failed to load products.'
  }
}

async function createProduct() {
  createMsg.value = ''
  creating.value = true
  try {
    await api.post('/products', { name: name.value, slug: slug.value })
    name.value = ''; slug.value = ''
    await load()
  } catch (e) {
    createMsg.value = e.message || 'Create failed.'
  } finally {
    creating.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page-head">
    <h1>Products <span class="small muted">V4 · hidden test page</span></h1>
  </div>

  <div v-if="error" class="card" style="margin-bottom: 22px">{{ error }}</div>

  <div v-if="!enabled" class="card" style="margin-bottom: 22px">
    <div class="c-name">Products API is dark</div>
    <div class="hint">Enable <span class="mono">ENABLE_V4_PRODUCTS</span> to use this page. It stays out of the navigation until the V4 product surfaces ship.</div>
  </div>

  <template v-else>
    <h2 class="section-label">Catalog</h2>
    <div class="card" style="margin-bottom: 22px">
      <div v-if="products && !products.length" class="hint">No products yet.</div>
      <div v-for="p in products" :key="p.id" class="kv">
        <span class="k">{{ p.name }}</span>
        <span class="v mono">{{ p.slug }} · {{ p.status }}</span>
      </div>
    </div>

    <h2 class="section-label">Create (test)</h2>
    <div class="card stack" style="margin-bottom: 22px">
      <input v-model="name" placeholder="Name" class="input" />
      <input v-model="slug" placeholder="slug" class="input mono" />
      <button class="btn" :disabled="creating || !name || !slug" @click="createProduct">
        <Icon name="plus" /> Create product
      </button>
      <div v-if="createMsg" class="hint">{{ createMsg }}</div>
    </div>
  </template>
</template>
