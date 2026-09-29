import type { InsightImageKind } from '../types.js';
import { kindFromText } from './keywords.js';

// A line of page text, with the font size it was set in (0 when unknown, e.g.
// text that came from a plain string).
export interface PageLine {
  str: string;
  size: number;
}

export function linesFromText(text: string): PageLine[] {
  return text
    .split(/\r?\n|[ ]{3,}/)
    .map((str) => str.trim())
    .filter(Boolean)
    .map((str) => ({ str, size: 0 }));
}

export function linesToText(lines: PageLine[]): string {
  return lines.map((line) => line.str).join('\n');
}

// A drawing-title line: it names a kind of drawing, and a title block's own
// title usually says whether it is "proposed" or "existing".
export interface TitleCandidate {
  text: string;
  kind: InsightImageKind;
  // Qualified by proposed/existing, as a title block's title is. An inset
  // heading ("LOCATION PLAN 1:1250") or a legend line usually is not.
  strong: boolean;
  size: number;
}

const TITLE_KEYWORD =
  /(site plan|location plan|block plan|floor plan|roof plan|basement plan|elevation|section|layout|master ?plan|general arrangement|render|visual|photomontage|parameter plan|(?:ground|first|second|third|lower|upper) floor)/i;
// Legend/key/scale chrome shares drawing words but is not the drawing title.
const CHROME = /legend|key ?plan|\bscale\b|revision|\bnotes?\b|north (?:point|arrow)|title block|drawing (?:schedule|register|list)/i;
// Notes and cross-references ("refer to elevations", "to be read with site plan").
const NOTE = /\b(?:refer|see|read (?:with|in conjunction)|to be|do not|shown on|for (?:information|details)|contractor|must|shall|should|all dimensions|indicative only)\b/i;
const QUALIFIER = /\b(?:proposed|existing)\b/i;
// A page listing many drawing titles is a drawing register, not a drawing.
const REGISTER_TITLES = 6;

export function titleCandidates(lines: PageLine[]): TitleCandidate[] {
  const out: TitleCandidate[] = [];
  for (const line of lines) {
    const text = line.str.trim();
    if (text.length < 4 || text.length > 90) continue;
    if (!TITLE_KEYWORD.test(text) || CHROME.test(text) || NOTE.test(text)) continue;
    const kind = kindFromText(text);
    if (!kind) continue;
    out.push({ text, kind, strong: QUALIFIER.test(text), size: line.size });
  }
  // Strong titles first, then the larger font, then page order.
  return out
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (a, b) =>
        Number(b.candidate.strong) - Number(a.candidate.strong) ||
        b.candidate.size - a.candidate.size ||
        a.index - b.index
    )
    .map(({ candidate }) => candidate);
}

export function isDrawingRegister(candidates: TitleCandidate[]): boolean {
  return candidates.length > REGISTER_TITLES;
}

// How strongly a page's own text says it is a drawing, for choosing which pages
// of a long drawing pack to render: 2 = a proposed/existing title, 1 = a plain
// title, 0 = none (or a drawing register listing every title).
export function pageTitleScore(lines: PageLine[]): number {
  const candidates = titleCandidates(lines);
  if (candidates.length === 0 || isDrawingRegister(candidates)) return 0;
  return candidates[0]?.strong ? 2 : 1;
}
