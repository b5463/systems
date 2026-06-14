import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true }
  },
  { path: '/', name: 'projects', component: () => import('../views/Projects.vue') },
  {
    path: '/projects/:slug',
    name: 'project-detail',
    component: () => import('../views/ProjectDetail.vue'),
    props: true
  },
  { path: '/deploy', name: 'deploy', component: () => import('../views/Deploy.vue') },
  { path: '/activity', name: 'activity', component: () => import('../views/Audit.vue') },
  { path: '/account', name: 'account', component: () => import('../views/Account.vue') },
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
    return { name: 'projects' }
  }
  return true
})

export default router
