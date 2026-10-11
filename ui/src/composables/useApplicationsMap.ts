import { ref, computed, watch, type Ref } from 'vue'
import type { ApplicationMeta } from '../../../src/types.js'

// Map-view state for a list of applications: which of them have a location, the
// mapped/unmapped counts, and whether the map is showing. The map collapses
// itself when nothing is mapped (e.g. the last mapped application was archived).
export function useApplicationsMap(apps: Ref<ApplicationMeta[]>) {
  const showAppsMap = ref(false)
  const mappedApps = computed(() => apps.value.filter((a) => a.location))
  const mappedCount = computed(() => mappedApps.value.length)
  const unmappedCount = computed(() => apps.value.length - mappedApps.value.length)

  watch(mappedCount, (count) => {
    if (count === 0) showAppsMap.value = false
  })

  return { showAppsMap, mappedApps, mappedCount, unmappedCount }
}
