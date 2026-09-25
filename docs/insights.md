# Application insights: design plan

> **Status: planned, not implemented.** This is a *living* document — expected to change as
> real data comes in and as later slices land. It exists so a future session can resume with
> full context. See [Resuming in a new session](#resuming-in-a-new-session) at the end.

The goal is to automatically surface, for a downloaded planning application:

1. **the main things being proposed** (a short summary plus extracted metrics), and
2. **the most relevant images, plans and renders**, linked back to their source document/page.

Slice 1 is deliberately small and fully deterministic (no ML). The architecture leaves seams
so the approach can be swapped or improved later without a rewrite.

## Locked decisions (slice 1)

- **Content-first, not filename-first.** Portal tags are unreliable and document names, while
  usually right, are not reliable enough. We analyse the *contents* of pages and treat the
  filename/`documentType` as only weak priors.
- **Page-level analysis.** Classify *pages*, not documents, using their own signals
  (title-block text, geometry, visual features). This also handles mixed documents (e.g. a
  Design & Access Statement with figures embedded in it).
- **Score, don't bucket.** Applications differ in shape and size, so we do not classify an
  application and expect a fixed document set. Independent weak signals combine into scores
  and the top pages are surfaced.
- **Deterministic only.** No cloud/vision LLM in slice 1. A vision layer is a later, optional
  strategy behind the same interface.
- **On-demand generation with a persistent cache.** Insights are generated when requested (not
  during download) and cached to disk; a download/sync invalidates only what changed.
- **Paired / follow-on applications are out of scope for now** (see
  [Known gaps](#known-gaps--future-slices)). We intentionally do not try to resolve a parent
  application in slice 1.

## Non-goals

- Resolving parent/child ("paired") applications (discharge of conditions, reserved matters,
  non-material amendments, LBC paired with full permission, …).
- Cloud or local LLM summarisation, vision captioning, or image triage.
- OCR of scanned drawings (revisit only if sample data shows scans are common).
- Extracting insights during download.

## Approach

### Page-level, content-first

Each document's pages are analysed independently:

- **Per-page text** via pdf.js (already reachable through `unpdf`):
  `extractText(pdf, { mergePages: false })`. Note the current extractor in
  `src/search/extract.ts` merges pages — slice 1 adds a per-page variant rather than replacing
  it (document content search still wants merged text).
- Architectural drawing sheets carry a **title block** with the drawing title, number and
  revision as real text. This is the single best signal and it is content, not filename.
- **Geometry**: page dimensions, sheet size and aspect. Large landscape A1/A0 sheets are almost
  always drawings.
- **Visual features** from a rendered page thumbnail: ink coverage, distinct-colour count,
  colour entropy, line/edge density, largest embedded-image area, whitespace ratio.
- **File shape**: vector-only vs embedded-raster vs scanned (one image covering the sheet with
  no text).
- **Metadata priors** (weak): `description`, `documentType`, `datePublished` (newer revision
  wins), `docId`.

"Drawing-ness" and "render-ness" become scores; the top-K pages surface regardless of how the
application is shaped.

### Telling renders, plans, maps and scans apart

- **Renders / CGI / photomontages**: usually a large embedded raster on a low-text page with
  high colour entropy and a photo-like histogram. Extract embedded images directly (pdf.js
  operator list, or the renderer's image API), rank by area × colourfulness, hash-dedupe and
  prefer the newest revision.
- **Plans / elevations / sections**: usually **vector**, so they do not appear as embedded
  images. Rasterise the page, detect line-drawing structure (long straight segments, few
  colours, banded ink), then read the title block for the label.
- **Site / location plans**: map-like (north arrow, scale bar); a separate score, and they pair
  naturally with the existing Location tab.
- **Scans**: one image covering the sheet with no extractable text. Deterministic title-block
  reading fails here — OCR (`tesseract.js`, WASM) or a later vision strategy is the fallback.
- Only *after* deterministic pre-filtering would a vision model be called, and only on the
  top-K thumbnails, to confirm the kind and caption it (later slice).

### Proposal summary (deterministic)

- Headline from `meta.description` (the formal proposal — authoritative).
- Anchored regex extraction of metrics: number of dwellings, storeys/height, floorspace (m²),
  site area, parking, affordable units/%, use class, materials.
- Optionally a concise proposal paragraph mined from the DAS / planning statement using anchor
  phrases ("the proposal", "the development comprises", "summary of proposals").
- Neighbour comment sentiment tally (the existing `Comment.stance` values: support / object /
  neutral).

## Architecture: seams

The guiding principle is to separate the **expensive, reusable artifacts** from the **cheap,
strategy-dependent interpretations**. Almost all future churn is in interpretation; artifacts
are reusable no matter how the approach changes.

### Two caches

- **Artifacts** (strategy-independent, expensive to produce): per-page rendered PNGs and
  per-page text (and OCR text later). Cached under
  `downloads/<authorityId>/<reference>/insights/` (e.g. `insights/pages/*.png`,
  `insights/page-text.json`). Keyed by document `mtimeMs` + `size` + page, mirroring the
  existing `src/search/searchTextCache.ts` pattern, so replaced files are re-extracted.
- **Insights** (strategy output, cheap to recompute): scores, selected images and summary,
  stored in `insights.json` alongside `metadata.json`. Carries
  `strategy: { id, version }` plus the source document mtimes/sizes.

Changing the strategy (or bumping its version) invalidates `insights.json` but **reuses** all
rendered pages and text. Without this split, every experiment would re-render every PDF.

### Interfaces (two seams, one config switch)

```ts
// Rasterise a single page. First impl: MupdfRenderer (WASM).
interface PageRenderer {
  render(filePath: string, page: number, opts?: RenderOptions): Promise<RenderedPage>;
}

// Turn page artifacts + metadata into ranked, labelled images. First impl: HeuristicImageDiscovery.
interface ImageDiscovery {
  find(meta: ApplicationMeta, pages: PageArtifacts[]): InsightImage[];
}

// Turn metadata + page text into a summary. First impl: HeuristicSummaryProvider.
interface SummaryProvider {
  summarise(meta: ApplicationMeta, pages: PageArtifacts[]): InsightSummary;
}
```

`src/insights/generate.ts` composes the chosen renderer + discovery + summary and writes the
caches. Implementations are selected by config (e.g. `INSIGHTS_RENDERER`, `INSIGHTS_STRATEGY`).

### What we deliberately do NOT do

- No generic plugin/registry framework, no dynamic loading, no abstract base classes.
- No per-feature interface: features stay plain pure functions in a listed array; only the
  **set and weights** live in one config object so tuning is localized.
- No queue/worker abstraction beyond reusing what already exists (`src/queue.ts`).
- No schema gymnastics: `ApplicationInsights` grows additively; the UI reads generic fields
  (`kind`, `score`, `label`), so a new strategy never needs UI changes.
- Keep the API contract strategy-agnostic; expose `strategy` only as debug metadata.

## Data model

Proposed additions to `src/types.ts`:

```ts
export type InsightImageKind =
  | 'render' | 'plan' | 'elevation' | 'section' | 'map' | 'photo' | 'other';

export interface InsightImage {
  id: string;             // content hash, for dedupe
  kind: InsightImageKind;
  label: string;          // title-block text, falling back to the document description
  localFilename: string;  // source document
  page: number;           // 1-based page within the source document
  imageFile: string;      // filename under insights/
  width: number;
  height: number;
  score: number;
}

export interface InsightSummary {
  headline: string;
  points: string[];
  metrics: Record<string, string>;
}

export interface ApplicationInsights {
  version: number;
  strategy: { id: string; version: number };
  generatedAt: string;
  source: { filename: string; mtimeMs: number; size: number }[]; // invalidation
  summary: InsightSummary;
  images: InsightImage[];
  comments: { support: number; object: number; neutral: number; total: number };
}
```

## API

Added to `src/app.ts` (or a small router under `src/insights/`, mirroring
`src/search/routes.ts`):

- `GET  /api/applications/:ref/insights` — cached insights, or `{ status: 'none' }`.
- `POST /api/applications/:ref/insights` — generate. Route through a small dedicated queue
  (or the existing `downloadQueue`) so rasterising many pages does not block other requests.
- `GET  /api/applications/:ref/insights/images/:file` — serve a thumbnail (scoped to the
  `insights/` directory, so the whole `downloads/` tree is not exposed beyond the existing
  `/api/documents` static route).

## UI

- New **Overview** tab in `ui/src/pages/Viewer.vue`, before Key Documents.
- Proposal summary: headline, key points, metric chips, support/object/neutral tally.
- Image grid grouped by kind (hero render, plans, elevations, maps). Each tile links to its
  source document/page using the existing document URL scheme in `Viewer.vue`.
- "Generate insights" button + progress state when none are cached; cached thereafter.
- (Later) a curation loop: mark an image as hero / not relevant, stored like the existing
  starred-document flags, to improve ranking from real use.

## Renderer choice (to validate by spike)

Recommended first implementation: **`mupdf`** (official WASM build). Single dependency, outputs
PNG directly (`pixmap.asPNG()`), works in Node, Electron and the Debian-based Docker image with
no native build or external binary.

Fallbacks to spike if needed: **`@hyzyla/pdfium`** (WASM PDFium) or the
`pdfjs-dist` + `@napi-rs/canvas` combination (native prebuilt binaries).

Explicitly rejected: reusing the bundled Chromium/Playwright to screenshot the PDF viewer —
zero new deps but hacky, slow and unreliable for this purpose.

## Module layout

```
src/insights/
  render/            # PageRenderer + MupdfRenderer
  heuristic/         # feature.ts, score.ts, select.ts, summary.ts
  cache.ts           # artifact + insights caches (mtime/size invalidation, atomic writes)
  generate.ts        # compose renderer + discovery + summary, version, write
  routes.ts          # (optional) insights endpoints
scripts/             # contact-sheet report over sample applications (also the eval harness)
```

## Build order (slices)

1. **Renderer spike** on real sample data — confirm `mupdf` renders and bundles cleanly in
   Node/Electron/Docker; measure speed and bundle size.
2. **Artifact pipeline + cache** — per-page text and rendered page PNGs, with mtime/size
   invalidation and atomic writes (reuse the `src/storage.ts` temp-file + rename approach).
3. **Image discovery** — `ImageDiscovery` seam + `HeuristicImageDiscovery` + API + Overview tab
   (images/plans/renders first; this is the hard part).
4. **Summary** — `SummaryProvider` seam + `HeuristicSummaryProvider` + metrics + sentiment.
5. **Hardening** — revision dedupe/collapse, page/DPI caps, cache invalidation, and OCR only if
   samples demand it.

## Testing & evaluation

Because this is a ranking problem, do not tune it blind.

- Unit-test `feature.ts`, `score.ts`, `select.ts`, `summary.ts` with synthetic fixtures
  (the repo uses vitest; `npm test`). Note: "relevance" is fuzzy, so keep scoring pure and
  deterministic so it is testable.
- A `scripts/` report that runs the selected strategy over the sample applications and dumps
  ranked pages as an HTML contact sheet for eyeballing.
- A small expected-top-N file per sample to compute precision@k while tuning weights. The
  `ImageDiscovery` seam means two strategies can be compared side by side through the same
  harness.

## Known gaps / future slices

- **Paired / follow-on applications** (out of scope now). Plan for later: detect follow-on types
  from the description (`discharge of condition`, `approval of details`, `reserved matters`,
  `non-material amendment`, `variation of condition`) and pair types (LBC, advertisement), scrape
  the portal's related/associated-application section into `relatedApplications` on the meta
  (`scrapeTabTable()` in `src/scraper.ts` already generalises to any tab), then resolve the
  parent so a follow-on can point at the primary application's content. This also gives a
  *richness prior* so a follow-on with no drawing-like pages does not pretend to have visuals.
- **Vision strategy**: `VisionImageDiscovery` (confirm kind, caption) and
  `LlmSummaryProvider`, called only on the heuristic's top-K candidates to bound cost.
- **OCR** for scanned drawing sets (`tesseract.js`, WASM) if sample data shows they are common.
- **User curation** feedback loop feeding ranking weights.

## Open questions / risks

- Prevalence of **scanned** drawing sets (drives how much OCR/vision is needed). Main quality
  risk for a deterministic approach.
- **Vector-text-as-curves** plans: visual detection still finds the drawing, but the label falls
  back to the document description because there is no extractable title-block text.
- **Renderer portability and bundle size** in the Electron and Docker builds.
- **Performance**: number of pages rendered and DPI; mitigated with caps, downscaling and the
  artifact cache.

## Grounding: sample applications

There is no downloaded data in the repo (`downloads/` is gitignored). The plan is to ground the
heuristics in real data by running the existing scraper over a set of interesting references
supplied by the maintainer (Greater Cambridge unless stated otherwise), then inspecting the real
document names, title blocks and layouts.

Workflow (once references are provided):

```bash
npm ci && npm ci --prefix ui
npx playwright install chromium        # only for the non-Electron scraper path
npm run server                          # API on :3000; downloads land in downloads/<authority>/<ref>/
# then, per reference:
curl -X POST localhost:3000/api/download -H 'content-type: application/json' \
  -d '{"reference":"<REF>"}'
curl localhost:3000/api/queue           # downloads run sequentially, 5s apart
```

A spread across shapes is ideal: householder, minor/major full, outline → reserved matters,
discharge of conditions, LBC, tree, advertisement, amendment — especially the hard cases.

## Resuming in a new session

1. Read this document first; it is the source of truth for the plan and decisions.
2. The work lives on the `docs/insights-plan` branch (this doc was added there). Check
   `git branch --show-current` / `git log`.
3. Confirm the **locked decisions** above are still intended; this plan is malleable — update
   this doc before diverging.
4. Ground in real data: obtain references, run the [sample workflow](#grounding-sample-applications),
   and inspect the actual PDFs (title blocks, vector vs raster, scans) before finalising scoring
   heuristics.
5. Start at **Build order** step 1 (renderer spike), unless a later slice is already in progress.
6. Where this doc and the code disagree, update the doc — it should not silently rot.
