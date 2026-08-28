<template>
  <div class="min-h-screen bg-gray-50 text-gray-900">
    <header class="bg-white shadow">
      <div class="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
        <h1 class="text-2xl font-bold text-gray-900">
          <router-link to="/">PlanBrowser</router-link>
        </h1>
        <nav>
          <router-link to="/queue" class="text-sm font-medium text-blue-600 hover:text-blue-800">Queue</router-link>
        </nav>
      </div>
    </header>
    <main class="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <router-view></router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
</script>
