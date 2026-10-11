<template>
  <div :class="$style.mapWrap">
    <ApplicationsMap :apps="apps" @select="emit('select', $event)" />
    <p v-if="unmapped > 0" :class="$style.mapNote">
      {{ unmapped }} {{ unmapped === 1 ? 'application has' : 'applications have' }} no location {{ unmapped === 1 ? 'and isn\u2019t' : "and aren\u2019t" }} shown on the map.
    </p>
  </div>
</template>

<script setup lang="ts">
import type { ApplicationMeta } from '../../../src/types.js'
import ApplicationsMap from './ApplicationsMap.vue'

defineProps<{ apps: ApplicationMeta[]; unmapped: number }>()
const emit = defineEmits<{ select: [reference: string] }>()
</script>

<style module>
.mapWrap {
  margin-bottom: 1.5rem;
}

.mapNote {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}
</style>
