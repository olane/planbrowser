<template>
  <div :class="$style.page">
    <section>
      <div :class="$style.header">
        <h2 :class="$style.title">Archived Applications</h2>
        <button
          v-if="mappedCount > 0"
          @click="showAppsMap = !showAppsMap"
          :title="showAppsMap ? 'Hide the map' : 'Show archived applications on a map'"
          :class="[ui.btn, ui.btnOutline, $style.mapButton]"
        >
          <svg :class="$style.icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
            />
          </svg>
          <span>{{ showAppsMap ? 'Hide map' : 'View map' }}</span>
        </button>
      </div>
      <ApplicationsMapPanel
        v-if="showAppsMap && mappedApps.length > 0"
        :apps="mappedApps"
        :unmapped="unmappedCount"
        @select="openAppFromMap"
      />
      <div v-if="loading" :class="$style.muted">Loading...</div>
      <div v-else-if="archivedApps.length === 0" :class="$style.muted">No archived applications.</div>
      <div v-else :class="$style.grid">
        <ApplicationCard
          v-for="app in archivedApps"
          :key="app.reference"
          :app="app"
          :queue-status="getQueueStatus(app.reference)"
          @changed="fetchApps"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useApplications } from '../composables/useApplications';
import { useApplicationsMap } from '../composables/useApplicationsMap';
import ApplicationCard from '../components/ApplicationCard.vue';
import ApplicationsMapPanel from '../components/ApplicationsMapPanel.vue';
import { getQueueStatus } from '../queueStore';
import { useRouter } from 'vue-router';
import ui from '../styles/primitives.module.css';

const router = useRouter();
const { apps, loading, fetchApps } = useApplications();

const archivedApps = computed(() => apps.value.filter((a) => a.archived));

const { showAppsMap, mappedApps, mappedCount, unmappedCount } = useApplicationsMap(archivedApps);

const openAppFromMap = (reference: string) => router.push(`/app/${encodeURIComponent(reference)}`);

onMounted(() => {
  document.title = 'PlanBrowser | Archived';
  fetchApps();
});
</script>

<style module>
.page {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.title {
  font-size: 1.25rem;
  line-height: 1.75rem;
  font-weight: 600;
}

.mapButton {
  cursor: pointer;
  color: var(--color-gray-700);
}

.icon {
  width: 1rem;
  height: 1rem;
}

.muted {
  color: var(--color-gray-500);
}

.grid {
  display: grid;
  gap: 1rem;
}

@media (min-width: 768px) {
  .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
