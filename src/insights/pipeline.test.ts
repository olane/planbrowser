import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ApplicationMeta } from '../types.js';
import { buildPdf, photoFill, type TestPage } from './__fixtures__/pdf.js';
import type { PageTrace } from './generate.js';

// Count PDF opens so the test can prove a warm feature cache avoids them.
const opens = vi.hoisted(() => ({ count: 0 }));
vi.mock('./render.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./render.js')>();
  return {
    ...original,
    openPdf: async (filePath: string) => {
      opens.count++;
      return original.openPdf(filePath);
    }
  };
});

const { generateInsights } = await import('./generate.js');

const REFERENCE = '24/00002/FUL';
let root: string;
let dir: string;

// A vector-ish drawing sheet: a frame, some linework (different per sheet, so
// sheets are not collapsed as near-duplicates) and a title block.
let sheetSeed = 0;
function sheet(texts: TestPage['texts']): TestPage {
  const seed = ++sheetSeed;
  const lines: [number, number, number, number][] = [
    [20, 20, 822, 20],
    [822, 20, 822, 575],
    [822, 575, 20, 575],
    [20, 575, 20, 20]
  ];
  for (let i = 0; i < 40; i++) {
    const x = 60 + ((i * 37 * seed) % 700);
    const y = 100 + ((i * 53 + seed * 97) % 380);
    lines.push(i % 2 ? [x, y, x + 60 + seed * 10, y] : [x, y, x, y + 40 + seed * 12]);
  }
  return { lines, texts };
}

const title = (str: string, size = 14): { x: number; y: number; size: number; str: string } => ({ x: 600, y: 40, size, str });

function writeApplication(): void {
  const pack = buildPdf([
    // A drawing register lists every title: not a drawing.
    sheet(
      ['PROPOSED SITE PLAN', 'PROPOSED GROUND FLOOR PLAN', 'PROPOSED FIRST FLOOR PLAN', 'PROPOSED ROOF PLAN', 'PROPOSED FRONT ELEVATION', 'PROPOSED REAR ELEVATION', 'PROPOSED SECTION A-A'].map(
        (str, i) => ({ x: 60, y: 500 - i * 20, size: 10, str })
      )
    ),
    // A floor plan whose key-plan inset is headed "LOCATION PLAN".
    sheet([title('PROPOSED GROUND FLOOR PLAN'), { x: 40, y: 40, size: 8, str: 'LOCATION PLAN 1:1250' }]),
    sheet([{ x: 60, y: 40, size: 8, str: 'General notes only' }]),
    sheet([title('PROPOSED FRONT ELEVATION')]),
    sheet([title('PROPOSED SECTION A-A')]),
    sheet([title('PROPOSED ROOF PLAN')])
  ]);
  const prose = Array.from({ length: 6 }, (_, i) => ({
    x: 40,
    y: 520 - i * 16,
    size: 10,
    str: 'The proposal responds to the character of the surrounding streets and the existing trees along the frontage.'
  }));
  const figure = (caption: string, shift: number): TestPage => ({
    image: { x: 60, y: 120, w: 720, h: 420, pxW: 1200, pxH: 800, fill: (x, y) => photoFill(x + shift * (y > 400 ? 3 : 1), y * shift) },
    texts: [{ x: 60, y: 100, size: 10, str: caption }]
  });
  // A full-bleed flat brand panel: selected for review, then rejected.
  const flat: TestPage = {
    image: { x: 60, y: 80, w: 720, h: 440, pxW: 1200, pxH: 800, fill: () => [210, 225, 240] }
  };
  const das = buildPdf([
    { texts: prose },
    figure("Artist's impression of the new square", 1),
    figure('Existing view along Mill Road - site photograph', 7),
    flat
  ]);
  fs.writeFileSync(path.join(dir, 'pack.pdf'), pack);
  // A drawing whose portal name is just a drawing number.
  fs.writeFileSync(path.join(dir, 'cryptic.pdf'), buildPdf([sheet([title('EXISTING BLOCK PLAN')])]));
  fs.writeFileSync(path.join(dir, 'das.pdf'), das);
  const meta: ApplicationMeta = {
    reference: REFERENCE,
    authorityId: 'cambridge',
    address: '2 Test Street',
    description: 'Erection of 4 dwellings.',
    status: 'Awaiting decision',
    dates: {},
    documents: [
      { localFilename: 'pack.pdf', datePublished: '01 Jan 2026', documentType: 'Drawings', description: 'PROPOSED PLANS AND ELEVATIONS' },
      { localFilename: 'cryptic.pdf', datePublished: '01 Jan 2026', documentType: 'Drawings', description: 'S20064-ETS26082813240' },
      { localFilename: 'das.pdf', datePublished: '01 Jan 2026', documentType: 'Design and Access Statement', description: 'DESIGN AND ACCESS STATEMENT' }
    ],
    hasComments: false,
    scrapedAt: new Date(0).toISOString()
  };
  fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(meta));
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-insights-pipeline-'));
  process.env.DOWNLOADS_DIR = root;
  dir = path.join(root, 'cambridge', '24-00002-FUL');
  fs.mkdirSync(dir, { recursive: true });
  writeApplication();
});

afterAll(() => {
  delete process.env.DOWNLOADS_DIR;
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  opens.count = 0;
});

const summary = (images: { localFilename: string; page: number; kind: string; label: string }[]) =>
  images
    .map((image) => `${image.localFilename}#${image.page} ${image.kind} ${image.label}`)
    .sort();

describe('insights pipeline on synthetic documents', () => {
  it('classifies pages by their own titles and captions', async () => {
    const insights = await generateInsights(REFERENCE);
    const found = insights?.found ?? [];
    expect(summary(found)).toEqual([
      'cryptic.pdf#1 map EXISTING BLOCK PLAN',
      "das.pdf#2 render DESIGN AND ACCESS STATEMENT",
      'das.pdf#3 photo DESIGN AND ACCESS STATEMENT',
      'pack.pdf#2 plan PROPOSED GROUND FLOOR PLAN',
      'pack.pdf#4 elevation PROPOSED FRONT ELEVATION',
      'pack.pdf#5 section PROPOSED SECTION A-A',
      'pack.pdf#6 plan PROPOSED ROOF PLAN'
    ]);
    // The classifier says why.
    const render = found.find((image) => image.localFilename === 'das.pdf' && image.page === 2);
    expect(render?.reason).toMatch(/^render from caption/);
    const plan = found.find((image) => image.localFilename === 'pack.pdf' && image.page === 2);
    expect(plan?.reason).toMatch(/qualified page title "PROPOSED GROUND FLOOR PLAN"/);
    for (const image of found) expect(fs.existsSync(path.join(dir, 'insights', image.imageFile))).toBe(true);
    expect(opens.count).toBeGreaterThan(0);
  });

  it('reinterprets from cached page facts without opening a PDF', async () => {
    const cold = await generateInsights(REFERENCE, undefined, { force: true });
    opens.count = 0;
    const warm = await generateInsights(REFERENCE, undefined, { force: true });
    expect(opens.count).toBe(0);
    expect(warm?.found).toEqual(cold?.found);
    expect(warm?.images).toEqual(cold?.images);
  });

  it('gives the same result from a cold cache as from a warm one', async () => {
    const warm = await generateInsights(REFERENCE, undefined, { force: true });
    fs.rmSync(path.join(dir, 'insights'), { recursive: true, force: true });
    const cold = await generateInsights(REFERENCE, undefined, { force: true });
    expect(cold?.found).toEqual(warm?.found);
  });

  it('re-renders a thumbnail that was pruned while its facts stayed cached', async () => {
    const first = await generateInsights(REFERENCE, undefined, { force: true });
    const image = first!.found![0]!;
    fs.rmSync(path.join(dir, 'insights', image.imageFile));
    opens.count = 0;
    const second = await generateInsights(REFERENCE, undefined, { force: true });
    expect(opens.count).toBe(1);
    const again = second!.found!.find((i) => i.localFilename === image.localFilename && i.page === image.page);
    expect(again && fs.existsSync(path.join(dir, 'insights', again.imageFile))).toBe(true);
  });

  it('traces rejected pages with a reason', async () => {
    const traces: { page: number; localFilename: string; reason: string }[] = [];
    await generateInsights(REFERENCE, undefined, { force: true, trace: (entry) => traces.push(entry) });
    // The drawing register and the notes-only sheet are not chosen from a pack
    // with more pages than the cap.
    expect(traces.filter((t) => t.localFilename === 'pack.pdf').map((t) => t.page)).toEqual([2, 4, 5, 6]);
    expect(traces.every((t) => t.reason.length > 0)).toBe(true);
  });

  it('persists every interpreted page, including rejected ones', async () => {
    const traces: PageTrace[] = [];
    const insights = await generateInsights(REFERENCE, undefined, { force: true, trace: (entry) => traces.push(entry) });
    // What the contact sheet sees is exactly what is saved for the review tool.
    expect(insights?.pages).toEqual(traces);
    const rejected = insights?.pages?.find((p) => p.localFilename === 'das.pdf' && p.page === 4);
    expect(rejected?.score).toBe(0);
    expect(rejected?.reason).toMatch(/^rejected/);
    const foundKeys = new Set((insights?.found ?? []).map((i) => `${i.localFilename}#${i.page}`));
    expect(rejected && foundKeys.has(`${rejected.localFilename}#${rejected.page}`)).toBe(false);
  });
});
