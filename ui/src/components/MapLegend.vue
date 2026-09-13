<template>
  <div class="absolute right-3 top-3 z-[1000] rounded-md border border-gray-200 bg-white/90 px-2.5 py-2 text-xs shadow-sm">
    <div class="flex items-center gap-0.5 rounded bg-gray-100 p-0.5">
      <button
        v-for="m in COLOR_MODES"
        :key="m.value"
        type="button"
        @click="emit('update:mode', m.value)"
        :class="[
          'px-2 py-0.5 rounded cursor-pointer transition-colors',
          mode === m.value ? 'bg-white text-gray-900 font-medium shadow-sm' : 'text-gray-500 hover:text-gray-700'
        ]"
      >
        {{ m.label }}
      </button>
    </div>
    <div v-if="entries.length" class="mt-1.5">
      <div v-for="e in entries" :key="e.label" class="flex items-center gap-1.5 py-0.5">
        <span class="inline-block h-3 w-3 rounded-full" :style="{ background: e.color }"></span>
        <span class="text-gray-600">{{ e.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { COLOR_MODES, type ColorMode, type LegendEntry } from '../mapColours'

defineProps<{ mode: ColorMode; entries: LegendEntry[] }>()
const emit = defineEmits<{ (e: 'update:mode', value: ColorMode): void }>()
</script>
