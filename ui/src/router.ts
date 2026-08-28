import { createRouter, createWebHistory } from 'vue-router'
import Home from './pages/Home.vue'
import Viewer from './pages/Viewer.vue'
import Queue from './pages/Queue.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: Home
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
