<template>
  <template v-for="(segment, index) in segments" :key="index">
    <mark v-if="segment.match" class="bg-yellow-100">{{ segment.text }}</mark>
    <template v-else>{{ segment.text }}</template>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { highlightSegments } from '../utils'

const props = defineProps<{
  text: string
  query: string
}>()

const segments = computed(() => highlightSegments(props.text, props.query))
</script>
