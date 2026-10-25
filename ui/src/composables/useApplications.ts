import { ref, watch } from 'vue'
import type { ApplicationMeta } from '../../../src/types.js'
import * as api from '../api'
import { queueItems, activeDownloadCount } from '../queueStore'

// The downloaded applications, fetched from the API and kept fresh while the
// download queue runs. Shared by the downloaded/archived list pages and the
// search page so they all re-list on the same triggers instead of each keeping
// their own copy of the fetch + queue watch.
//
// `liveUpdates` re-lists while an item is queued or in progress too, so an
// application's metadata (and its growing document list) streams in as it is
// written; the downloaded page uses this, the others only need the final result.
export function useApplications(options: { liveUpdates?: boolean } = {}) {
  const apps = ref<ApplicationMeta[]>([]);
  const loading = ref(true);

  const fetchApps = async () => {
    try {
      apps.value = await api.fetchApplications();
    } catch (e) {
      console.error(e);
    } finally {
      loading.value = false;
    }
  };

  watch(queueItems, (items, oldItems) => {
    const previousCompleted = new Set((oldItems ?? []).filter((q) => q.status === 'completed').map((q) => q.id))
    const currentCompleted = items.filter((q) => q.status === 'completed').map((q) => q.id)
    const justCompleted = currentCompleted.some((id) => !previousCompleted.has(id))
    if (justCompleted || (options.liveUpdates && activeDownloadCount.value > 0)) {
      fetchApps()
    }
  });

  return { apps, loading, fetchApps };
}
