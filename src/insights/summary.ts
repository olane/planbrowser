import type { ApplicationMeta, Comment, InsightCommentTally, InsightSummary } from '../types.js';

interface MetricRule {
  label: string;
  re: RegExp;
  suffix?: string;
  transform?: (value: string) => string;
}

const WORD_NUMBERS: Record<string, string> = {
  single: '1',
  one: '1',
  two: '2',
  double: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10'
};

// Anchored patterns so we only surface a metric when a number is actually tied
// to the thing being measured (avoids picking up arbitrary numbers from prose).
const METRIC_RULES: MetricRule[] = [
  {
    label: 'Dwellings',
    re: /(\d[\d,]*)\s*(?:no\.?\s*)?(?:new\s+|additional\s+)?(?:dwellings?|homes?|apartments?|flats?|residential units?|houses)\b/i
  },
  {
    label: 'Storeys',
    re: /(\d+|single|double|one|two|three|four|five|six|seven|eight|nine|ten)[- ]storey/i,
    transform: (value) => WORD_NUMBERS[value.toLowerCase()] ?? value
  },
  { label: 'Height', re: /height(?: of| to| reaching| above| is)?\s*(?:approximately |up to |about |circa )?([\d.]+)\s*m\b/i, suffix: ' m' },
  { label: 'Height', re: /([\d.]+)\s*m\s*(?:in height|high|tall)/i, suffix: ' m' },
  { label: 'Floorspace', re: /([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s?m\b|m2\b|m²|square metres?)/i, suffix: ' m²' },
  { label: 'Site area', re: /([\d.]+)\s*(?:ha\b|hectares?)/i, suffix: ' ha' },
  { label: 'Parking', re: /(\d+)\s*(?:car\s*)?parking\s*(?:spaces|bays)/i, suffix: ' spaces' },
  { label: 'Affordable', re: /(\d+)\s*%\s*affordable/i, suffix: '%' }
];

export function extractMetrics(text: string): Record<string, string> {
  const metrics: Record<string, string> = {};
  for (const rule of METRIC_RULES) {
    if (metrics[rule.label] !== undefined) continue;
    const m = rule.re.exec(text);
    if (m?.[1]) {
      const value = rule.transform ? rule.transform(m[1]) : m[1];
      metrics[rule.label] = `${value}${rule.suffix ?? ''}`;
    }
  }
  return metrics;
}

const POINT_RULES: { label: string; re: RegExp }[] = [
  { label: 'Outline application', re: /\boutline planning\b/i },
  { label: 'Reserved matters', re: /\breserved matters\b/i },
  { label: 'Demolition', re: /\bdemolition\b|\bdemolish\b/i },
  { label: 'Change of use', re: /\bchange of use\b|\bpart change of use\b/i },
  { label: 'Refurbishment', re: /\brefurbish/i },
  { label: 'Extension', re: /\b(?:single|two|double|rear|front|side)[- ]storey extension\b|\bextension\b/i },
  { label: 'New build', re: /\berection\b|\bconstruction of\b|\bnew build\b|\bredevelopment\b/i },
  { label: 'Listed building', re: /\blisted building\b|\blbc\b/i },
  { label: 'Tree works', re: /\btree(?:s)?\b|\btpo\b|\btca\b/i },
  { label: 'Advertisement', re: /\badvert|\bsignage\b|\bsigns?\b/i },
  { label: 'Discharge of condition', re: /\bdischarge of condition\b|\bapproval of details\b/i },
  { label: 'Variation of condition', re: /\bvariation of condition\b|\bs73\b/i },
  { label: 'Non-material amendment', re: /\bnon[- ]?material amendment\b|\bnma\b/i },
  { label: 'Affordable housing', re: /\baffordable\b/i },
  { label: 'Landscaping', re: /\blandscap/i }
];

export function derivePoints(meta: ApplicationMeta): string[] {
  const hay = [
    meta.description,
    meta.furtherInformation?.['Application Type'],
    meta.furtherInformation?.['Decision'],
    meta.status
  ]
    .filter(Boolean)
    .join(' ');
  const points: string[] = [];
  for (const rule of POINT_RULES) {
    if (rule.re.test(hay) && !points.includes(rule.label)) points.push(rule.label);
  }
  return points;
}

export function buildSummary(meta: ApplicationMeta): InsightSummary {
  const text = [
    meta.description,
    Object.values(meta.furtherInformation ?? {}).join(' '),
    meta.furtherInformation?.['Application Type']
  ]
    .filter(Boolean)
    .join(' ');

  const further = meta.furtherInformation ?? {};
  const points = derivePoints(meta);
  if (further['Application Type']) points.unshift(`Application type: ${further['Application Type']}`);
  if (further['Ward']) points.push(`Ward: ${further['Ward']}`);

  return {
    headline: meta.description || meta.address || meta.reference,
    points,
    metrics: extractMetrics(text)
  };
}

function stanceOf(comment: Comment): 'support' | 'object' | 'neutral' {
  const s = (comment.stance || '').toLowerCase();
  if (s.includes('object')) return 'object';
  if (s.includes('support')) return 'support';
  return 'neutral';
}

export function tallyComments(comments: Comment[]): InsightCommentTally {
  const tally: InsightCommentTally = { support: 0, object: 0, neutral: 0, total: comments.length };
  for (const comment of comments) tally[stanceOf(comment)]++;
  return tally;
}
