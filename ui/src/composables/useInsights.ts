import { ref, onUnmounted } from 'vue'
import * as api from '../api'
import type { ApplicationInsights } from '../../../src/types.js'

export type InsightsStatus = 'loading' | 'none' | 'running' | 'ready' | 'error'

// Shared insights state: fetch, generate and poll until a generation finishes.
// Used by the viewer's Insights tab and by the review tool, so neither page
// reimplements the running/ready/polling dance.
export function useInsights(reference: () => string, authorityId: () => string | undefined) {
  const insights = ref<ApplicationInsights | null>(null)
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
    poll = setTimeout(() => { void load() }, 3000)
  }

  const load = async () => {
    const ref0 = reference()
    if (!ref0) return
    try {
      const res = await api.fetchInsights(ref0, authorityId())
      // The route may have changed while the request was in flight.
      if (reference() !== ref0) return
      if (res.status === 'ready' && res.insights) {
        insights.value = res.insights
        status.value = 'ready'
        error.value = ''
      } else if (res.status === 'running') {
        // A deep scan or background refresh reports `running` but may carry the
        // previous result; keep it on screen and keep polling.
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
    status.value = 'loading'
    error.value = ''
  }

  onUnmounted(stop)

  return { insights, status, error, load, generate, reset, stop }
}
