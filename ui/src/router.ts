import { createRouter, createWebHistory } from 'vue-router'
import Home from './pages/Home.vue'
import Viewer from './pages/Viewer.vue'
import Queue from './pages/Queue.vue'
import Archive from './pages/Archive.vue'
import Feed from './pages/Feed.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: Home
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
})

export default router
