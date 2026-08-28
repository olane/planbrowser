<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{
  modelValue: string
  options: string[]
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const open = ref(false)
const containerRef = ref<HTMLElement | null>(null)
const selected = ref<string[]>(props.modelValue ? props.modelValue.split(',').filter(Boolean) : [])

watch(() => props.modelValue, (val) => {
  selected.value = val ? val.split(',').filter(Boolean) : []
})

const buttonText = computed(() => {
  if (selected.value.length === 0) return props.placeholder || 'Any'
  if (selected.value.length === props.options.length) return 'All'
  if (selected.value.length <= 2) return selected.value.join(', ')
  return `${selected.value.length} selected`
})

const isChecked = (opt: string) => selected.value.includes(opt)

function toggle(opt: string) {
  if (selected.value.includes(opt)) {
    selected.value = selected.value.filter((o) => o !== opt)
  } else {
    selected.value = [...selected.value, opt]
  }
  emit('update:modelValue', selected.value.join(','))
}

function clear() {
  selected.value = []
  emit('update:modelValue', '')
}

function onClickOutside(e: Event) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('click', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))
</script>

<template>
  <div ref="containerRef" class="relative">
    <button type="button" @click="open = !open" class="block w-full text-left rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
      <span :class="selected.length ? 'text-gray-900' : 'text-gray-400'">{{ buttonText }}</span>
      <span class="float-right text-gray-400">▾</span>
    </button>
    <div v-if="open" class="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto py-1">
      <label v-for="opt in options" :key="opt" class="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer select-none">
        <input type="checkbox" :checked="isChecked(opt)" @change="toggle(opt)" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        {{ opt }}
      </label>
      <button v-if="selected.length" type="button" @click="clear" class="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-gray-50 border-t border-gray-100">
        Clear
      </button>
    </div>
  </div>
</template>
