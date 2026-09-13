<template>
  <div :class="$style.page">
    <header :class="$style.header">
      <div :class="$style.container">
        <div :class="$style.headerRow">
          <h1 :class="$style.title">
            <router-link to="/">PlanBrowser</router-link>
          </h1>
          <button type="button" :class="$style.menuButton" @click="menuOpen = !menuOpen" :aria-expanded="menuOpen" aria-label="Toggle navigation menu" :aria-controls="'mobile-nav'">
            <svg v-if="!menuOpen" :class="$style.icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
            <svg v-else :class="$style.icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <nav :class="$style.desktopNav">
            <router-link v-for="item in navItems" :key="item.to" :to="item.to" :class="navLinkClass(item.to)">
              <span>{{ item.label }}</span><span v-if="item.queueCount && activeQueueCount > 0"> ({{ activeQueueCount }})</span>
            </router-link>
          </nav>
        </div>
        <nav v-if="menuOpen" id="mobile-nav" :class="$style.mobileNav">
          <router-link v-for="item in navItems" :key="item.to" :to="item.to" :class="mobileNavLinkClass(item.to)">
            <span>{{ item.label }}</span><span v-if="item.queueCount && activeQueueCount > 0"> ({{ activeQueueCount }})</span>
          </router-link>
        </nav>
      </div>
    </header>
    <main :class="$style.main">
      <router-view></router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, useCssModule } from 'vue'
import { useRoute } from 'vue-router'
import { activeQueueCount, refreshQueue } from './queueStore'

const route = useRoute()
const styles = useCssModule()
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
  [styles.navLink, isActive(to) ? styles.navLinkActive : styles.navLinkInactive]

const mobileNavLinkClass = (to: string) =>
  [styles.mobileNavLink, isActive(to) ? styles.mobileNavLinkActive : styles.mobileNavLinkInactive]

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

<style module>
.page {
  min-height: 100vh;
  background: var(--color-gray-50);
  color: var(--color-gray-900);
}

.header {
  background: #fff;
  box-shadow: var(--shadow);
}

.container {
  max-width: 80rem;
  margin: 0 auto;
  padding: 0 1rem;
}

@media (min-width: 640px) {
  .container {
    padding: 0 1.5rem;
  }
}

@media (min-width: 1024px) {
  .container {
    padding: 0 2rem;
  }
}

.headerRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 1rem 0;
}

.title {
  font-size: 1.5rem;
  line-height: 2rem;
  font-weight: 700;
  color: var(--color-gray-900);
}

.menuButton {
  display: inline-flex;
  padding: 0.5rem;
  margin-right: -0.5rem;
  border: none;
  background: none;
  border-radius: var(--radius-md);
  color: var(--color-gray-700);
  cursor: pointer;
}

.menuButton:hover {
  background: var(--color-gray-100);
}

@media (min-width: 768px) {
  .menuButton {
    display: none;
  }
}

.icon {
  width: 1.5rem;
  height: 1.5rem;
}

.desktopNav {
  display: none;
  align-items: center;
  gap: 1rem;
}

@media (min-width: 768px) {
  .desktopNav {
    display: flex;
  }
}

.mobileNav {
  padding-bottom: 0.75rem;
  margin: 0 -0.25rem;
}

@media (min-width: 768px) {
  .mobileNav {
    display: none;
  }
}

.navLink {
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
}

.navLinkActive {
  color: var(--color-blue-800);
}

.navLinkInactive {
  color: var(--color-blue-600);
}

.navLinkInactive:hover {
  color: var(--color-blue-800);
}

.mobileNavLink {
  display: block;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
}

.mobileNavLinkActive {
  color: var(--color-blue-800);
  background: var(--color-blue-50);
}

.mobileNavLinkInactive {
  color: var(--color-blue-600);
}

.mobileNavLinkInactive:hover {
  color: var(--color-blue-800);
  background: var(--color-gray-50);
}

.main {
  max-width: 80rem;
  margin: 0 auto;
  padding: 1.5rem 1rem;
}

@media (min-width: 640px) {
  .main {
    padding-left: 1.5rem;
    padding-right: 1.5rem;
  }
}

@media (min-width: 1024px) {
  .main {
    padding-left: 2rem;
    padding-right: 2rem;
  }
}
</style>
