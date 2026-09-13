<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import ui from '../styles/primitives.module.css'

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
  <div ref="containerRef" :class="$style.root">
    <button type="button" @click="open = !open" :class="[ui.input, $style.trigger]">
      <span :class="selected.length ? $style.value : $style.placeholder">{{ buttonText }}</span>
      <span :class="$style.caret">▾</span>
    </button>
    <div v-if="open" :class="$style.menu">
      <label v-for="opt in options" :key="opt" :class="$style.option">
        <input type="checkbox" :checked="isChecked(opt)" @change="toggle(opt)" :class="$style.checkbox" />
        {{ opt }}
      </label>
      <button v-if="selected.length" type="button" @click="clear" :class="$style.clear">
        Clear
      </button>
    </div>
  </div>
</template>

<style module>
.root {
  position: relative;
}

.trigger {
  display: block;
  width: 100%;
  text-align: left;
}

.value {
  color: var(--color-gray-900);
}

.placeholder {
  color: var(--color-gray-400);
}

.caret {
  float: right;
  color: var(--color-gray-400);
}

.menu {
  position: absolute;
  z-index: 10;
  margin-top: 0.25rem;
  width: 100%;
  max-height: 15rem;
  overflow: auto;
  padding: 0.25rem 0;
  background: #fff;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}

.option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  cursor: pointer;
  user-select: none;
}

.option:hover {
  background: var(--color-gray-50);
}

.checkbox {
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius);
  accent-color: var(--color-blue-600);
}

.clear {
  width: 100%;
  padding: 0.375rem 0.75rem;
  text-align: left;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-blue-600);
  cursor: pointer;
  background: none;
  border: none;
  border-top: 1px solid var(--color-gray-100);
}

.clear:hover {
  background: var(--color-gray-50);
}
</style>
