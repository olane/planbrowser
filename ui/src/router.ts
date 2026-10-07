import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import Home from './pages/Home.vue'
import Search from './pages/Search.vue'
import Viewer from './pages/Viewer.vue'
import Queue from './pages/Queue.vue'
import Archive from './pages/Archive.vue'
import Feed from './pages/Feed.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/search',
    name: 'Search',
    component: Search
  },
  {
    path: '/archive',
    name: 'Archive',
    component: Archive
  },
  {
    path: '/feed',
    name: 'Feed',
    component: Feed
  },
  {
    path: '/queue',
    name: 'Queue',
    component: Queue
  },
  {
    path: '/app/:ref',
    name: 'Viewer',
    component: Viewer
  }
]

// The insights review tool is a local development aid (it writes into the eval
// ground truth), so it is only routed under `vite dev` and never ships.
if (import.meta.env.DEV) {
  routes.push({
    path: '/review/:ref',
    name: 'Review',
    component: () => import('./pages/Review.vue')
  })
}

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
