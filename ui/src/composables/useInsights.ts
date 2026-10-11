import { ref, onUnmounted } from 'vue'
import * as api from '../api'
import type { ApplicationInsights, InsightsProgress } from '../../../src/types.js'

type InsightsStatus = 'loading' | 'none' | 'running' | 'ready' | 'error'

// Poll while a generation runs. Short enough that streamed partial snapshots
// feel live; the server writes them at most every couple of seconds.
const POLL_MS = 1500

// Shared insights state: fetch, generate and poll until a generation finishes.
// Used by the viewer's Insights tab and by the review tool, so neither page
// reimplements the running/ready/polling dance.
export function useInsights(reference: () => string, authorityId: () => string | undefined) {
  const insights = ref<ApplicationInsights | null>(null)
  const progress = ref<InsightsProgress | null>(null)
  const status = ref<InsightsStatus>('loading')
  const error = ref('')
  let poll: ReturnType<typeof setTimeout> | null = null

  const stop = () => {
    if (poll) {
      clearTimeout(poll)
      poll = null
    }
  }

  const schedule = () => {
    stop()
    poll = setTimeout(() => { void load() }, POLL_MS)
  }

  const load = async () => {
    const ref0 = reference()
    if (!ref0) return
    try {
      const res = await api.fetchInsights(ref0, authorityId())
      // The route may have changed while the request was in flight.
      if (reference() !== ref0) return
      if (res.progress) progress.value = res.progress
      if (res.status === 'ready' && res.insights) {
        insights.value = res.insights
        status.value = 'ready'
        error.value = ''
      } else if (res.status === 'running') {
        // A deep scan or background refresh reports `running` but may carry the
        // previous result, or a partial snapshot streamed so far; keep it on
        // screen and keep polling.
        if (res.insights) insights.value = res.insights
        status.value = 'running'
        error.value = ''
        schedule()
      } else if (res.status === 'error') {
        status.value = 'error'
        error.value = res.error || 'Failed to generate insights'
      } else {
        status.value = 'none'
        error.value = ''
      }
    } catch (e: any) {
      if (reference() !== ref0) return
      error.value = e.message || 'Failed to load insights'
      status.value = 'none'
    }
  }

  const generate = async (deep = false) => {
    const ref0 = reference()
    if (!ref0) return
    error.value = ''
    progress.value = null
    status.value = 'running'
    try {
      const res = await api.startInsights(ref0, authorityId(), deep)
      if (reference() !== ref0) return
      if (res.status === 'ready' && res.insights) {
        insights.value = res.insights
        status.value = 'ready'
        return
      }
      schedule()
    } catch (e: any) {
      if (reference() !== ref0) return
      error.value = e.message || 'Failed to generate insights'
      status.value = 'error'
    }
  }

  const reset = () => {
    stop()
    insights.value = null
    progress.value = null
    status.value = 'loading'
    error.value = ''
  }

  onUnmounted(stop)

  return { insights, progress, status, error, load, generate, reset, stop }
}
