import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import Admin from '../views/Admin.vue'
import Events from '../views/Events.vue'
import Login from '../views/Login.vue'
import Products from '../views/Products.vue'
import Server from '../views/Server.vue'
import Ship from '../views/Ship.vue'
import SystemDetail from '../views/SystemDetail.vue'
import Systems from '../views/Systems.vue'

// SYSTEMS. V1.1 — five operational surfaces + system detail.
// Legacy paths (/deploy, /activity, /account, /projects/:slug) redirect to the
// new structure so existing bookmarks keep working.
const routes = [
  {
    path: '/login',
    name: 'login',
    component: Login,
    meta: { public: true }
  },
  { path: '/', name: 'systems', component: Systems },
  { path: '/ship', name: 'ship', component: Ship },
  { path: '/events', name: 'events', component: Events },
  { path: '/server', name: 'server', component: Server },
  { path: '/admin', name: 'admin', component: Admin },
  // V4 beta — not linked from main nav; access via direct URL /products
  { path: '/products', name: 'products', component: Products },
  {
    path: '/systems/:slug',
    name: 'system-detail',
    component: SystemDetail,
    props: true
  },

  // --- Legacy redirects ---
  { path: '/deploy', redirect: { name: 'ship' } },
  { path: '/activity', redirect: { name: 'events' } },
  { path: '/account', redirect: { name: 'admin' } },
  {
    path: '/projects/:slug',
    redirect: (to) => ({ name: 'system-detail', params: { slug: to.params.slug } })
  },

  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

function isRouteImportError(error) {
  const message = String(error?.message || error || '')
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Unable to preload CSS')
  )
}

router.onError(async (error, to) => {
  if (!isRouteImportError(error)) return

  // A stale service worker or cached index can leave the shell alive while
  // route chunks for Ship/Events/Admin 404. Unregister once, then reload
  // the requested route instead of leaving the content area blank.
  const retryKey = `systems:route-reload:${to.fullPath}`
  if (sessionStorage.getItem(retryKey)) return
  sessionStorage.setItem(retryKey, '1')

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
  } catch {
    // Best effort only; the reload below is the actual recovery.
  }

  window.location.assign(to.fullPath)
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // Resolve the session before the first guarded decision. init() is memoized,
  // so this awaits the in-flight probe once and is a no-op on later navigations.
  if (!auth.ready) await auth.init()
  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined }
  }
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'systems' }
  }
  return true
})

export default router
