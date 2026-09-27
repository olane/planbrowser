import type { ApplicationMeta, Comment, InsightCommentTally, InsightSummary } from '../types.js';
import { normalise } from './keywords.js';

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

// The old summary repeated the proposal description back as keyword "tags"
// (demolition, extension, ward, …) which the viewer already shows above. These
// rules instead report what the application *contains*, which is the thing you
// cannot see from the metadata: its evidence base.
export interface SummaryDocument {
  documentType?: string;
  description?: string;
  localFilename?: string;
}

const DOC_CATEGORY_RULES: { label: string; re: RegExp }[] = [
  { label: 'Design & Access Statement', re: /design (and|&) access/ },
  { label: 'Planning Statement', re: /planning statement|planning supporting/ },
  { label: 'Heritage Statement', re: /heritage|historic environment|listed building/ },
  { label: 'Transport Assessment', re: /transport|travel plan|highways|access statement/ },
  { label: 'Landscape & Visual', re: /landscape|visual impact|photomontage|\bavrs?\b/ },
  { label: 'Ecology / Biodiversity', re: /ecolog|biodiversit|protected species|\bbats?\b/ },
  { label: 'Arboricultural Report', re: /arboricultur|tree (report|survey|constraint)/ },
  { label: 'Drainage & Flood Risk', re: /drainage|flood risk|\bsuds?\b/ },
  { label: 'Noise Assessment', re: /noise|acoustic/ },
  { label: 'Air Quality', re: /air quality/ },
  { label: 'Energy & Sustainability', re: /energy statement|sustainab|overheating/ },
  { label: 'Viability Assessment', re: /viabilit/ },
  { label: 'Community Consultation', re: /community involvement|statement of consultation|public consultation/ }
];

const MAX_DOC_POINTS = 6;

// A short inventory of the assessment/statement types present, so an empty-ish
// or well-evidenced application is obvious at a glance.
export function summariseDocuments(docs: SummaryDocument[]): string[] {
  const hay = docs.map((doc) =>
    normalise([doc.documentType, doc.description, doc.localFilename].filter(Boolean).join(' '))
  );
  const drawingCount = docs.filter((doc) => /drawing/.test(normalise(doc.documentType || ''))).length;

  const points: string[] = [];
  if (drawingCount > 0) points.push(`${drawingCount} drawing${drawingCount === 1 ? '' : 's'}`);
  for (const rule of DOC_CATEGORY_RULES) {
    if (points.length >= MAX_DOC_POINTS) break;
    if (hay.some((h) => rule.re.test(h))) points.push(rule.label);
  }
  return points;
}

export function buildSummary(meta: ApplicationMeta, docs: SummaryDocument[] = []): InsightSummary {
  const text = [meta.description, Object.values(meta.furtherInformation ?? {}).join(' ')]
    .filter(Boolean)
    .join(' ');

  return {
    headline: meta.description || meta.address || meta.reference,
    points: summariseDocuments(docs),
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
