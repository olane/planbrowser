// Shared palette and normalisation for colouring map pins. Both the search map
// (PlanIt records) and the downloaded/archived application maps want to colour
// by the same two dimensions, so keeping the buckets here keeps the legends and
// pin colours consistent across pages.
export type ColorMode = 'type' | 'outcome'

export const COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: 'type', label: 'Type' },
  { value: 'outcome', label: 'Outcome' }
]

export const APP_TYPE_ORDER = [
  'Full',
  'Outline',
  'Amendment',
  'Conditions',
  'Heritage',
  'Trees',
  'Advertising',
  'Telecoms',
  'Other'
] as const

export type AppType = (typeof APP_TYPE_ORDER)[number]

export const APP_TYPE_COLORS: Record<AppType, string> = {
  Full: '#2563eb',
  Outline: '#7c3aed',
  Amendment: '#ea580c',
  Conditions: '#0d9488',
  Heritage: '#b45309',
  Trees: '#16a34a',
  Advertising: '#db2777',
  Telecoms: '#0891b2',
  Other: '#6b7280'
}

// Collapses either a PlanIt app_type (already one of APP_TYPE_ORDER) or a raw
// Idox "Application Type" (e.g. "Full Planning Application") into a bucket.
export function normaliseAppType(raw?: string): AppType {
  const s = (raw || '').toLowerCase()
  if (!s) return 'Other'
  if (/\btrees?\b|tree works|arboricult|\btpo\b/.test(s)) return 'Trees'
  if (/advert/.test(s)) return 'Advertising'
  if (/telecom|\btele\b/.test(s)) return 'Telecoms'
  if (/listed building|conservation area|heritage|historic building/.test(s)) return 'Heritage'
  if (/condition/.test(s)) return 'Conditions'
  if (/amendment|non-material|non material/.test(s)) return 'Amendment'
  if (/outline|reserved matters/.test(s)) return 'Outline'
  if (/\bfull\b|householder/.test(s)) return 'Full'
  return 'Other'
}

// Best-effort fallback for a downloaded application whose further information
// didn't include an "Application Type" (references usually end in a type code,
// e.g. "24/00123/FUL").
const REFERENCE_TYPE_CODES: Record<string, AppType> = {
  FUL: 'Full',
  OUT: 'Outline',
  RES: 'Outline',
  RVC: 'Conditions',
  VOC: 'Conditions',
  NMA: 'Amendment',
  AMD: 'Amendment',
  LBC: 'Heritage',
  CAC: 'Heritage',
  TPO: 'Trees',
  TCA: 'Trees',
  WTT: 'Trees',
  ADV: 'Advertising',
  AD: 'Advertising',
  TEL: 'Telecoms'
}

export function appTypeFromReference(reference?: string): AppType {
  const suffix = (reference || '')
    .split(/[/\\]/)
    .filter(Boolean)
    .pop()
    ?.toUpperCase() ?? ''
  return REFERENCE_TYPE_CODES[suffix] ?? 'Other'
}

export function appTypeColor(raw?: string): string {
  return APP_TYPE_COLORS[normaliseAppType(raw)]
}

export const OUTCOME_ORDER = ['Pending', 'Permitted', 'Refused', 'Withdrawn', 'Other'] as const

export type Outcome = (typeof OUTCOME_ORDER)[number]

export const OUTCOME_COLORS: Record<Outcome, string> = {
  Pending: '#2563eb',
  Permitted: '#16a34a',
  Refused: '#dc2626',
  Withdrawn: '#6b7280',
  Other: '#9333ea'
}

// Collapses either a PlanIt app_state ("Undecided", "Rejected", …) or a
// statusLabel from a downloaded application ("Permitted", "Awaiting decision",
// …) into a coarse outcome.
export function normaliseOutcome(label?: string): Outcome {
  const s = (label || '').toLowerCase()
  if (/refus|reject|declin|not permit/.test(s)) return 'Refused'
  if (/permit|grant|approv|condition|allow/.test(s)) return 'Permitted'
  if (/withdraw/.test(s)) return 'Withdrawn'
  if (
    !s ||
    /await|pending|undecided|consideration|registered|consult|unresolved|live|current/.test(s)
  ) {
    return 'Pending'
  }
  return 'Other'
}

export function outcomeColor(label?: string): string {
  return OUTCOME_COLORS[normaliseOutcome(label)]
}

// The buckets actually present in a dataset, in the canonical legend order.
export function presentBuckets<T extends string>(
  raws: (string | undefined)[],
  normalise: (raw?: string) => T,
  order: readonly T[]
): T[] {
  const seen = new Set<T>()
  for (const raw of raws) seen.add(normalise(raw))
  return order.filter((value) => seen.has(value))
}

export interface LegendEntry {
  label: string
  color: string
}

export function legendFor<T extends string>(
  buckets: T[],
  colors: Record<T, string>
): LegendEntry[] {
  return buckets.map((label) => ({ label, color: colors[label] }))
}
