import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// SYSTEMS. V1.1 — five operational surfaces + system detail.
// Legacy paths (/deploy, /activity, /account, /projects/:slug) redirect to the
// new structure so existing bookmarks keep working.
const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true }
  },
  { path: '/', name: 'systems', component: () => import('../views/Systems.vue') },
  { path: '/ship', name: 'ship', component: () => import('../views/Ship.vue') },
  { path: '/events', name: 'events', component: () => import('../views/Events.vue') },
  { path: '/server', name: 'server', component: () => import('../views/Server.vue') },
  { path: '/admin', name: 'admin', component: () => import('../views/Admin.vue') },
  {
    path: '/systems/:slug',
    name: 'system-detail',
    component: () => import('../views/SystemDetail.vue'),
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

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.token) {
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined }
  }
  if (to.name === 'login' && auth.token) {
    return { name: 'systems' }
  }
  return true
})

export default router
