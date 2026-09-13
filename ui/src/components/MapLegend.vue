<template>
  <div :class="$style.legend">
    <div :class="$style.toggle">
      <button
        v-for="m in COLOR_MODES"
        :key="m.value"
        type="button"
        @click="emit('update:mode', m.value)"
        :class="[$style.modeButton, mode === m.value ? $style.modeActive : $style.modeInactive]"
      >
        {{ m.label }}
      </button>
    </div>
    <div v-if="entries.length" :class="$style.legendBody">
      <div v-for="e in entries" :key="e.label" :class="$style.legendRow">
        <span :class="$style.swatch" :style="{ background: e.color }"></span>
        <span :class="$style.label">{{ e.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { COLOR_MODES, type ColorMode, type LegendEntry } from '../mapColours'

defineProps<{ mode: ColorMode; entries: LegendEntry[] }>()
const emit = defineEmits<{ (e: 'update:mode', value: ColorMode): void }>()
</script>

<style module>
.legend {
  position: absolute;
  right: 0.75rem;
  top: 0.75rem;
  z-index: 1000;
  padding: 0.5rem 0.625rem;
  background: rgb(255 255 255 / 0.9);
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  font-size: 0.75rem;
  line-height: 1rem;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.125rem;
  border-radius: var(--radius);
  background: var(--color-gray-100);
}

.modeButton {
  padding: 0.125rem 0.5rem;
  border: none;
  background: none;
  border-radius: var(--radius);
  cursor: pointer;
  transition: color 150ms, background-color 150ms;
}

.modeActive {
  background: #fff;
  color: var(--color-gray-900);
  font-weight: 500;
  box-shadow: var(--shadow-sm);
}

.modeInactive {
  color: var(--color-gray-500);
}

.modeInactive:hover {
  color: var(--color-gray-700);
}

.legendBody {
  margin-top: 0.375rem;
}

.legendRow {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.125rem 0;
}

.swatch {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: var(--radius-full);
}

.label {
  color: var(--color-gray-600);
}
</style>
