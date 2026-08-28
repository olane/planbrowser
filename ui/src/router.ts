import { createRouter, createWebHistory } from 'vue-router'
import Home from './pages/Home.vue'
import Viewer from './pages/Viewer.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: Home
    },
    {
      path: '/app/:ref',
      name: 'Viewer',
      component: Viewer
    }
  ]
})

export default router
