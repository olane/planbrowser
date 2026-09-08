<template>
  <div class="min-h-screen bg-gray-50 text-gray-900">
    <header class="bg-white shadow">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between gap-2 py-4">
          <h1 class="text-2xl font-bold text-gray-900">
            <router-link to="/">PlanBrowser</router-link>
          </h1>
          <button type="button" class="md:hidden p-2 -mr-2 rounded-md text-gray-700 hover:bg-gray-100 cursor-pointer" @click="menuOpen = !menuOpen" :aria-expanded="menuOpen" aria-label="Toggle navigation menu" :aria-controls="'mobile-nav'">
            <svg v-if="!menuOpen" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
            <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <nav class="hidden md:flex items-center gap-4">
            <router-link v-for="item in navItems" :key="item.to" :to="item.to" :class="navLinkClass(item.to)">
              <span>{{ item.label }}</span><span v-if="item.queueCount && activeQueueCount > 0"> ({{ activeQueueCount }})</span>
            </router-link>
          </nav>
        </div>
        <nav v-if="menuOpen" id="mobile-nav" class="md:hidden pb-3 -mx-1">
          <router-link v-for="item in navItems" :key="item.to" :to="item.to" :class="mobileNavLinkClass(item.to)">
            <span>{{ item.label }}</span><span v-if="item.queueCount && activeQueueCount > 0"> ({{ activeQueueCount }})</span>
          </router-link>
        </nav>
      </div>
    </header>
    <main class="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <router-view></router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { activeQueueCount, refreshQueue } from './queueStore'

const route = useRoute()
const menuOpen = ref(false)

interface NavItem {
  to: string
  label: string
  queueCount?: boolean
}

const navItems: NavItem[] = [
  { to: '/search', label: 'Search' },
  { to: '/', label: 'Downloaded' },
  { to: '/archive', label: 'Archived' },
  { to: '/feed', label: 'Feed' },
  { to: '/queue', label: 'Queue', queueCount: true }
]

const isActive = (to: string) => route.path === to || (to !== '/' && route.path.startsWith(to))

const navLinkClass = (to: string) =>
  `${isActive(to) ? 'text-blue-800' : 'text-blue-600 hover:text-blue-800'} text-sm font-medium`

const mobileNavLinkClass = (to: string) =>
  `block px-3 py-2 rounded-md text-sm font-medium ${isActive(to) ? 'text-blue-800 bg-blue-50' : 'text-blue-600 hover:text-blue-800 hover:bg-gray-50'}`

// Close the mobile menu after navigating.
watch(() => route.fullPath, () => { menuOpen.value = false })

let pollInterval: any = null

onMounted(() => {
  refreshQueue()
  pollInterval = setInterval(refreshQueue, 2000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})
</script>
