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

## Findings from sample data (2026-09)

Grounded on real Greater Cambridge applications (mixed-use FUL/OUT, plus householder, tree,
advertisement, LBC, amendment and conditions examples). See
[Grounding](#grounding-sample-applications) for the workflow.

- **`unpdf` already does the heavy lifting.** It exposes per-page `extractText` (`mergePages:
  false`), `extractImages` (embedded rasters with real pixel dimensions), and
  `renderPageAsImage` (page rasterisation). The latter needs `@napi-rs/canvas` as an explicit
  `canvasImport` in Node; `@napi-rs/canvas` is a prebuilt N-API package, so no separate PDF
  engine is required. **This supersedes the earlier `mupdf` recommendation** (kept only as a
  fallback).
- **`extractImages` catches renders reliably.** A photoreal "North West Elevation" whose page
  text is empty (drawing text converted to curves) is found as a single huge embedded raster
  (e.g. 9933×7017), and photomontages as wide panoramas (e.g. 4843×1536). This is the strongest
  signal for render/photograph pages.
- **Vector plans contain hundreds of tiny image XObjects** (symbols, hatches, textures — e.g.
  many 85×85 images). So ranking embedded images by area alone is noisy for plans; the page
  must be rasterised instead, and embedded images filtered/deduped by size.
- **Renders often live *inside* multi-page appendices**, not as standalone files (e.g. an
  "APPENDIX 03 — PHOTOSHEETS AND AVRS" drawing PDF, or a Design & Access Statement page with a
  full-bleed visual). Page-level analysis is therefore essential; document classification alone
  would miss them.
- **Title blocks are gold *when text is extractable*.** Vector plans yield clean titles in the
  text layer ("PROPOSED (Site Plan)", "PROPOSED (Elevations)", "Proposed Application Boundary
  Plan"). But some drawings have no extractable text at all (curves), so the kind/label must fall
  back to the document `description`.
- **Colour is not a render/plan discriminator.** A site plan can be fully colour-filled, an
  elevation can be pure black-and-white line art, and a render is photo-like. Use
  embedded-raster coverage + photographic statistics for "render-likeness", and vector/line
  structure for "plan-likeness".
- **`documentType` is inconsistent in practice.** A Design & Access Statement was tagged
  `Drawings`; outline "PARAMETER PLANS" sit under `Drawings`; a follow-on `Conditions` app is
  thin. Confirms that tags/names are priors, not gates.
- **Revision handling matters**: superseded copies appear as `SUPERSEDED …` rows and must be
  deprioritised/excluded (the UI already groups them).
- **Scale**: individual applications run to 100–350 documents and multiple GB; drawing PDFs are
  20–30 MB and page renders take ~0.2–7 s each at scale 1. Rendering *every* page is not viable —
  only candidate pages, downscaled, cached.

## Renderer choice

**First implementation: `unpdf` + `@napi-rs/canvas`.** Reuses the existing dependency, renders
pages (`renderPageAsImage`) and extracts embedded images (`extractImages`), and works in Node,
Electron and the Debian-based Docker image. `@napi-rs/canvas` is a native prebuilt module, so
the Electron build must unpack it (`asarUnpack`) and the Docker image must keep glibc (it does).

Fallbacks if needed: **`mupdf`** (WASM, no native module) or **`@hyzyla/pdfium`** (WASM PDFium).

Explicitly rejected: reusing the bundled Chromium/Playwright to screenshot the PDF viewer —
zero new deps but hacky, slow and unreliable for this purpose.

## Module layout

```
src/insights/
  render/            # PageRenderer + UnpdfRenderer (unpdf + @napi-rs/canvas)
  heuristic/         # feature.ts, score.ts, select.ts, summary.ts
  cache.ts           # artifact + insights caches (mtime/size invalidation, atomic writes)
  generate.ts        # compose renderer + discovery + summary, version, write
  routes.ts          # (optional) insights endpoints
scripts/             # contact-sheet report over sample applications (also the eval harness)
```

## Build order (slices)

1. ~~**Renderer spike** on real sample data~~ — **done** (2026-09): `unpdf` +
   `@napi-rs/canvas` renders pages and extracts embedded images; see
   [Findings from sample data](#findings-from-sample-data-2026-09). Remaining check: Electron
   packaging (`asarUnpack`) and Docker.
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

## Slice 1 heuristic (finalised against samples)

Two passes, all deterministic and cacheable. Signals are combined into scores; no single missing
tag or cryptic name breaks the result.

**Pass A — artifacts (expensive, cached, strategy-independent).** For every PDF document:
per-page text (`extractText`, `mergePages: false`) and per-page embedded-image summaries
(`extractImages` → count, largest width/height/area). Keyed by document `mtimeMs`/`size`.

**Pass B — interpretation (cheap, versioned).** Score each *page* using:

1. **Document priors** (weak): `documentType` / `description` / filename keywords — drawings,
   plans, elevations, sections, site/block/location plan, parameter plan, render/visual/CGI,
   photomontage, photographs, design and access, appendix, superseded (negative).
2. **Embedded-image signal**: a single image covering most of the page with photographic
   dimensions ⇒ render/photograph (this catches image-based drawings whose text is curves).
3. **Title-block text** (when extractable): `PROPOSED`, `SITE PLAN`, `ELEVATIONS`, `SECTIONS`,
   `FLOOR PLAN`, `ROOF PLAN`, `LOCATION PLAN`, `PARAMETER PLAN`, `BLOCK PLAN`, drawing-number
   patterns ⇒ kind + label.
4. **Vector/drawing signal**: drawing-keyword doc and low text length but non-trivial content
   ⇒ path/elevation/section.

Then: pick candidate pages to rasterise (drawing-like docs, plus pages with large embedded
images), **capped per application** (start ~40 pages) and prioritised by score; render
thumbnails (target ~1600 px wide) and/or save the largest embedded image as the asset; classify
`kind` + `label`; dedupe by content hash; rank and select top-N per kind.

**Hard cases confirmed by the samples:**
- Cryptic drawing names with no keyword (e.g. tree applications: `S20064-ETS…`) — rely on
  embedded-image/title-block/vector signals, and always keep the drawing doc's `description`
  as a last-resort label.
- Render content buried in appendices / DAS (AVRS photosheets, full-bleed figures) — page-level
  scanning of multi-page docs is required.
- Follow-on apps with no visuals (`CONDF`) — return a summary but no image gallery rather than
  inventing one (parent resolution is a later slice).

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

- **Scanned** drawing sets were *not* observed in the sample (drawings are vector or embedded
  rasters with a text layer), so OCR is deprioritised; revisit if real scans appear.
- **Vector-text-as-curves** plans: visual/embedded-image detection still finds the drawing, but
  the label falls back to the document description.
- **Renderer portability**: `@napi-rs/canvas` is a native prebuilt module — confirm Electron
  `asarUnpack` and Docker packaging in slice 2.
- **Performance**: number of pages rendered and DPI; mitigated with caps, downscaling and the
  artifact cache.
- **Cryptic names** (e.g. tree-application drawing `S20064-ETS…`) have no keyword to work from;
  they rely on embedded-image/vector signals and the document description as fallback.

## Grounding: sample applications

There is no downloaded data in the repo (`downloads/` is gitignored). The heuristics were
grounded by running the existing scraper over a spread of real Greater Cambridge references.
Downloaded and inspected (2026-09), covering large mixed-use, outline, older hybrid, and small
householder / tree / advertisement / amendment / LBC / conditions cases:

| Reference | Shape |
| --- | --- |
| `25/04484/FUL` | Large student accommodation (94 docs) |
| `24/04575/FUL` | Very large mixed-use redevelopment (353 docs, 3.5 GB) |
| `26/01872/OUT` | Outline, all matters reserved — parameter plans (180 docs) |
| `26/01902/OUT` | Outline mixed-use (242 docs) |
| `26/03300/FUL` | Sports pavilion (46 docs) |
| `26/00067/HFUL` | Householder roof/rear extension (29 docs) |
| `S/4629/18/FL` | Older (2018) South Cambs hybrid (210 docs) |
| `26/03623/HFUL` | Single-storey front extension (9 docs) |
| `26/0937/TTPO` | Tree works (6 docs) |
| `26/1078/TTCA` | Tree works + tree photo (6 docs) |
| `26/03455/ADV` | Advertisement (12 docs) |
| `24/04593/NMA1` | Non-material amendment (11 docs) |
| `26/01599/CONDF` | Discharge of condition — thin, no visuals (10 docs) |
| `26/03475/LBC` | Listed building consent, air source heat pumps (21 docs) |

Workflow:

```bash
npm ci && npm ci --prefix ui
npx playwright install chromium        # only for the non-Electron scraper path
npm run server                          # API on :3000; downloads land in downloads/<authority>/<ref>/
# then, per reference:
curl -X POST localhost:3000/api/download -H 'content-type: application/json' \
  -d '{"reference":"<REF>"}'
curl localhost:3000/api/queue           # downloads run sequentially, 5s apart
```

**This sandbox note:** the Playwright browser needs an extracted dependency tree and a
fontconfig file, or Chromium crashes on navigation (`libglib-2.0.so.0` missing, then a Skia
`SkFontMgr_FontConfigInterface` FATAL). The working environment was:

```bash
export LD_LIBRARY_PATH="/tmp/pw-deps/lib/x86_64-linux-gnu:/tmp/pw-deps/usr/lib/x86_64-linux-gnu:/tmp/pw-deps/usr/lib/x86_64-linux-gnu/dri:/tmp/pw-deps/usr/lib/x86_64-linux-gnu/gio/modules"
# /tmp/pb/fonts.conf contains <dir>/tmp/pw-deps/usr/share/fonts</dir> + a writable cachedir
export FONTCONFIG_FILE=/tmp/pb/fonts.conf
```

## Resuming in a new session

1. Read this document first; it is the source of truth for the plan and decisions.
2. The work lives on the `docs/insights-plan` branch (this doc was added there). Check
   `git branch --show-current` / `git log`.
3. Confirm the **locked decisions** above are still intended; this plan is malleable — update
   this doc before diverging.
4. Samples are already downloaded in `downloads/cambridge/` (gitignored) — see
   [Grounding](#grounding-sample-applications) for the list. Re-download with the scraper if the
   directory is gone.
5. Build order step 1 (renderer spike) is **done**; continue at **Build order** step 2.
6. Where this doc and the code disagree, update the doc — it should not silently rot.
