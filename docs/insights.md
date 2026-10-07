# Application insights: design plan

> **Status: design implemented; first labelled measurement done.** Strategy **v14**, insights
> cache format 2, page-facts format 1. The original design is above; where it disagrees with the
> code, the code wins and this doc should be updated. The tuning history (the feedback rounds and
> the v12/v14 reviews) lives in the git log, not here.
>
> `scripts/samples.expected.json` now carries labels for one sample (`26/03198/FUL`, 102 pages):
> quick mode scores precision 77% (highlights) / 72% (found) and recall 19%, rising to 86% / 92%
> and 82% on a deep scan. The shortfall is coverage — the quick budget scans 40 of 150 documents
> — not classification. The classifier has **not** been retuned against these labels, so treat
> further tuning as verified only by `npm run insights:eval` (see
> [Resuming in a new session](#resuming-in-a-new-session)).

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

### Kind taxonomy (`plan` vs `map`)

`map` and `plan` are split strictly:

- **`map`** — *location/context only*: location plan, site location plan, block plan, boundary
  plan, OS extract, constraints/designations map, key diagram. It answers "where is the site and
  what surrounds it" and pairs with the Location tab.
- **`plan`** — *the development itself*: site plan, general arrangement, layout plan, floor/roof
  plan, parameter plan (framework, layout, land use, access & movement, heights, development
  zone, green & blue), masterplan, indicative layout.
- **`elevation` / `section`** — unchanged, the drawing's own projection.
- **`render` / `photo`** — unchanged; `render` outranks `photo`.

So a "PROPOSED SITE PLAN" is a `plan`, while an "EXISTING SITE LOCATION PLAN" is a `map`. The UI
surfaces friendly labels ("Plans", "Location maps") and groups the gallery by kind, which is
where the distinction is actually explained to the user.

### Proposal summary (deterministic)

- Headline from `meta.description` (the formal proposal — authoritative). The viewer already
  shows the description above, so it is **hidden in the Insights tab when it is identical** to avoid
  restating it.
- Anchored regex extraction of metrics: number of dwellings, storeys/height, floorspace (m²),
  site area, parking, affordable units/%, use class, materials.
- **"Included" inventory** (feedback round 1): the old summary re-derived "tags" from the
  description (demolition, extension, ward, application type) — all already visible in the
  metadata. Those are gone; the points now report *what the application contains*, i.e. the
  statement/assessment types present (Design & Access, Heritage, Transport, Arboricultural,
  Drainage, Ecology, Noise, Landscape & Visual, …) plus a drawing count. This is evidence you
  cannot see from the metadata.
- Neighbour comment sentiment tally (the existing `Comment.stance` values: support / object /
  neutral).

## Architecture: seams

The guiding principle is to separate the **expensive, reusable artifacts** from the **cheap,
strategy-dependent interpretations**. Almost all future churn is in interpretation; artifacts
are reusable no matter how the approach changes.

### Two caches

- **Page facts** (strategy-independent, expensive to produce): per-page text lines (with font
  size), the embedded-image scan (image count, largest pixel area, page coverage, caption) and the
  rendered thumbnail's pixel statistics + perceptual hash. Stored in
  `downloads/<authorityId>/<reference>/insights/features.json`, keyed by document `mtimeMs` +
  `size` (and page, and thumbnail width for renders), so replaced files are re-extracted. Bump
  `FEATURES_VERSION` in `features.ts` when *extraction* changes.
- **Insights** (strategy output, cheap to recompute): scores, selected images and summary,
  stored in `insights/insights.json`. Carries `strategy: { id, version }` plus the source
  document mtimes/sizes. Bump `STRATEGY.version` in `generate.ts` when *interpretation* changes.

Changing the strategy (or bumping its version) invalidates `insights.json` but **reuses** all
page facts: a warm re-run opens no PDFs at all, and gives exactly the same result as a cold run
(budgets count pages *considered*, not pages computed). Thumbnails are content-addressed PNGs;
only those of `found` images are kept, and a cached page whose thumbnail was pruned is re-rendered
on demand if it later enters the gallery.

### Seams (as built)

The original plan sketched `PageRenderer` / `ImageDiscovery` / `SummaryProvider` interfaces
selected by config. They were never needed as interfaces; the seams that exist are module
boundaries:

- **Extraction** — `render.ts` (the only module that talks to pdf.js) and `features.ts` (the
  page-facts store over it). Plain data out.
- **Interpretation** — `keywords.ts` (document profile), `title.ts`, `classify.ts`, `pages.ts`,
  `select.ts`: pure functions over page facts, unit-tested with synthetic inputs.
- **Orchestration** — `generate.ts` (the pipeline) and `jobs.ts` (background runs and API state).

A second strategy (e.g. a vision pass over the top-K thumbnails) would slot in as another
interpretation step over the same cached facts; add an interface when there are two
implementations, not before.

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
  phash?: string;         // 64-bit difference hash, for near-duplicate collapse
  reason?: string;        // why the classifier chose this kind (debug)
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

- New **Insights (beta)** tab in `ui/src/pages/Viewer.vue`, placed after Location (last). It does
  not auto-open: first load lands on Key Documents/Documents as before.
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

## Coverage and truncation

Because the pipeline is capped, "found" means *found in the analysed pages*. `coverage` records:

- `images[]`: per kind, `selected` (in the gallery) and `available` (distinct candidates after
  dedupe, before caps).
- `found`: the full ranked candidate list that `images` is a subset of; the Insights tab's "All found"
  view shows it.
- `partial`: true when the render/document budget was reached (`MAX_PAGES`/`MAX_DOCS`), so even
  `available` is a lower bound and some documents were never scanned.
- `documentsAnalysed` / `documentsTotal`, and `depth` (`quick` or `deep`).

The UI surfaces this rather than implying completeness: the Insights tab always shows
"Scanned X of Y documents", a per-group "showing N of M found" note when caps cut a kind, and an
application-level banner when `partial`. The group note and banner link to the Documents tab,
which is the unfiltered ground truth.

## Classification, evidence and evaluation

How a page gets its kind and how the eval scores it. (The tuning history — feedback rounds 1–4
and the v12/v14 reviews — is in the git log.)

- **Page-facts cache** (`features.ts`, `insights/features.json`). Page text, embedded-image
  summaries and rendered-thumbnail statistics are all cached; interpretation reruns from them, so
  a strategy bump or an eval run re-renders nothing. See [Two caches](#two-caches).
- **One operator-list pass.** `scanPage` reads embedded-image sizes from the pdf.js operator
  list's arguments and the placement box from the transform matrix, in one pass, recording page
  coverage as well as pixel area (no pixel copying just to read dimensions).
- **Text lines.** `extractPageLines` groups positioned text into lines itself (splitting on large
  gaps) and keeps each line's font size, because `unpdf`'s merged text glues neighbouring
  title-block cells together ("SITE PLANLocation plan 1:1250").
- **Keyword fixes.** "Artist's impression" matches despite the apostrophe; "Site Photos" matches
  `photo\b`; "Section 106"/"Section 73" are not drawing sections; "Proposed plans (and
  elevations)" names a plan kind; and drawing-typed documents with a cryptic name (a drawing
  number) get front-page selection.
- **Page content beats the document name** (`title.ts`, `classify.ts`). In order: a qualified
  page title ("PROPOSED FIRST FLOOR PLAN") → the document name when it names one kind → an
  unqualified page title (preferring one the name also mentions) → the name's first kind → any
  drawing word on the page. Notes, cross-references and chrome are not titles; a page listing many
  titles is a drawing register, not a drawing. The label comes from the same title line as the
  kind, and long drawing packs render their titled sheets rather than just pages 1–4.
- **Evidence and reasons.** `classifyPage` gathers appearance (flat graphic, prose, photographic,
  full-bleed, embedded figure) and evidence (page title, document name, caption, document
  profile) and resolves them by one explicit precedence, returning a `reason` such as `plan from
  qualified page title "PROPOSED GROUND FLOOR PLAN"` or `rejected: prose page`. The reason is
  stored on each image and shown in the review tool. One `DocumentProfile` per document
  (`profileDocument`) replaces the old overlapping "is this a visual document" regexes.
- **Eval measures what users see.** `expect` entries can require `highlight: true`, and per-page
  `labels` (good/bad, kind and an optional high/low rank, made in the `/review` tool) give
  precision, recall, kind accuracy and a rank metric for both the highlights and `found`. The eval
  lists bad highlights and missed good pages; `npm run insights:labels -- labels.json` merges a
  contact-sheet download into `samples.expected.json`.
- **Structure.** `jobs.ts` holds background runs and API state; `generate.ts` is the pipeline;
  budgets are two objects. A synthetic-PDF fixture (`__fixtures__/pdf.ts`) drives end-to-end
  tests (`pipeline.test.ts`) including cold-vs-warm equivalence.

## Document ranking

The Design & Access Statement leads the ranking, and the document prior is built to not throw
away visual documents.

- **The Design & Access Statement leads the ranking.** `rankDocuments` sorts it ahead of every
  other document (then by the usual name prior), so it always clears `maxDocs` and its larger
  `dasPages` budget is spent even when a render or plan name would outrank it on the weak prior.
  The DAS is the closest thing to a human summary of the scheme, so it is scanned first.
- **Visual-named documents are not skipped.** A name that sounds visual with no drawing kind
  (e.g. "Image Board", "Exhibition Panels") adds a small prior, so it is not dropped by the
  `prior.score > 0` filter before its page pre-scan runs.
- **One source of kind metadata** (`kinds.ts`): `KIND_ORDER`, `KIND_BASE`, `KIND_PRIOR_WEIGHT`
  and `DEFAULT_KIND_CAPS` live in one module rather than `select.ts`, `classify.ts` and
  `keywords.ts`.
- **One labels implementation.** `scripts/insights-labels.mjs` calls `mergeLabels`/`readLabels`
  in `src/insights/labels.ts` rather than duplicating the merge and JSON reformatting.
- **Review endpoints split out.** The dev-only label and rejected-page routes live in
  `routes.review.ts`, gated by `reviewEnabled()` (`INSIGHTS_REVIEW=0|1`, otherwise the presence of
  the ground-truth file); the production router does not carry review code.
- **`coverage.partial` only fires on a real cap.** A generation records whether a budget actually
  cut work off, so a run that merely used its last page does not report as partial.
- **`generateInsights` delegates.** The per-document step (page choice, pre-scan, classify,
  collect) is `analyseDocument`, with a `RunCounters` object holding budget state.

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
  render.ts          # pdf.js access: text lines, operator-list scan + caption, page render
  features.ts        # page-facts store (features.json), lazy PDF opening
  pixels.ts          # page visual statistics + perceptual hash
  caption.ts         # image placements and nearest-text caption (pure)
  kinds.ts           # kind order, base scores, prior weights and caps (one source)
  keywords.ts        # kind matchers, DocumentProfile, document prior
  title.ts           # page title candidates, drawing registers, page title score
  classify.ts        # per-page evidence → kind + score + label + reason
  pages.ts           # which pages of a document to render
  select.ts          # dedupe, caps, ranking
  summary.ts         # headline, points, metrics, comment tally
  cache.ts           # insights.json + content-addressed assets
  generate.ts        # the pipeline
  jobs.ts            # background generation + API state
  routes.ts          # insights endpoints
  routes.review.ts   # dev-only review endpoints (labels + rejected-page render)
  labels.ts          # ground-truth labels: read/merge/validate (shared with scripts/)
  __fixtures__/pdf.ts # test-only synthetic PDF builder
scripts/insights-truth.mjs    # ground-truth format + scoring (shared)
scripts/insights-eval.mjs     # hard assertions + precision/recall
scripts/insights-report.mjs   # contact sheet + labelling tool
scripts/insights-labels.mjs   # merge downloaded labels into the ground truth
scripts/samples.expected.json # hand-curated ground truth per sample
```

## Build order (slices)

1. ~~**Renderer spike** on real sample data~~ — **done** (2026-09): `unpdf` +
   `@napi-rs/canvas` renders pages and extracts embedded images; see
   [Findings from sample data](#findings-from-sample-data-2026-09).
2. ~~**Artifact pipeline + cache**~~ — **done**: all page facts cached in
   `insights/features.json` (mtime/size invalidation); thumbnails are content-addressed PNGs
   under `insights/`.
3. ~~**Image discovery**~~ — **first cut done**: see implementation status below.
4. ~~**Summary**~~ — **done**: description headline (hidden when it repeats the viewer's
   description), an "Included" document inventory, regex metrics and comment tally.
5. **Hardening (remaining)** — Electron/Docker packaging verification, revision collapse across
   differently-named docs, a richer proposal summary (see
   [Known gaps](#known-gaps--future-slices)), OCR only if scans appear. Label the remaining
   samples before further tuning.

## Implementation status

See [Module layout](#module-layout) for what lives where. Current budgets (`generate.ts`): quick
40 documents / 40 rendered pages, 4 pages per drawing document, 8 per statement/appendix, 14 for
the DAS, 8 photo pages, 240 pre-scanned pages; deep 120 / 120, 6 / 12 / 20, 16 photo pages, 1500
pre-scanned. Thumbnails are 1400 px wide.

Notes / known rough edges:
- A cold generation is CPU-heavy (~1 min for a 94-document application); it runs in the
  background and the UI polls, but there is no cross-process queue. Warm re-runs are near-instant.
- A stale cache (documents changed on sync, or a strategy bump) is refreshed automatically in the
  background on the next `GET`; a generation failure is surfaced as `status:'error'` for retry.
  While a download is still in progress each poll can see a new file set and start a refresh.
- Render budget counts attempts, so a document full of non-visual pages cannot exceed `maxPages`.
- Unreferenced thumbnails are pruned after each generation, so `insights/` tracks `found`.
- Ranking within a kind still leans on `edgeDensity`; the document prior, title confidence and
  recency are better candidates once labels exist to tune against.

## Testing & evaluation

Because this is a ranking problem, do not tune it blind.

- Unit tests (vitest, `npm test`) cover the pure interpretation modules with synthetic inputs,
  and `pipeline.test.ts` runs the whole pipeline over synthetic PDFs built by
  `__fixtures__/pdf.ts` (titles, insets, drawing registers, captioned figures, cold-vs-warm
  cache equivalence).
- **Contact sheet** (`npm run insights:report`, after `npm run samples`): every rendered page —
  highlights, other found, rejected — with its kind, reason and score. It is also the labelling
  tool: mark tiles good/bad (and fix the kind), *Download labels*, then
  `npm run insights:labels -- labels.json`.
- **Review tool** (local dev only): open `/review/<ref>`, e.g.
  `http://localhost:5173/review/25-04484-FUL` (run `npm run dev`). It lists every page the
  interpreter rendered — highlights, the rest of `found`, and the rejected pages — with the
  classifier's reason and score. Mark each good/bad and correct its kind; clicking the active
  rating again clears it, returning the page to unlabelled. A good page can also be given a
  priority — **high**, **low**, or no opinion (the default) — which feeds a ranking metric: a
  `high` page is expected to reach the highlights, a `low` one may be capped away without
  penalty. Each change saves straight into
  `scripts/samples.expected.json` via a dev-only endpoint, so `npm run insights:eval`
  sees it immediately. Marking a *rejected* page good is how false negatives are flagged (the eval
  counts it as a missed good page). Rejected-page thumbnails were pruned from the gallery, so the
  review endpoint re-renders them on demand. The UI route is only registered under `vite dev`, and
  the server endpoints (`routes.review.ts`) 404 unless `reviewEnabled()` — `INSIGHTS_REVIEW=0`
  forces them off, `INSIGHTS_REVIEW=1` forces them on, and otherwise they need the ground-truth
  file (a development checkout). This supersedes the contact sheet for labelling `found` and
  rejected pages; the contact sheet remains useful for a whole-corpus side-by-side.
- **Ground truth + eval** (`scripts/samples.expected.json`, `npm run insights:eval`; format in
  `scripts/insights-truth.mjs`). Hard assertions — `expect` (doc substring + optional
  page/kind, optionally `highlight: true`), `expectAbsent`, `expectEmpty` — fail the run. Labels
  give precision, recall and kind accuracy for the highlights and for `found`, plus lists of bad
  highlights and missed good pages. The eval lists manifest samples with no ground truth yet.
  It needs downloaded samples, so it is not run in CI; thanks to the page-facts cache, re-runs
  take seconds.
- Ground truth covers 8 of 14 samples, all from one council (Greater Cambridge). Label the other
  six — especially `24/04575/FUL` and `S/4629/18/FL` — and add a few applications from another
  authority before tuning further; the heuristics were tuned mostly on two applications.

## Slice 1 heuristic (finalised against samples)

Two passes, all deterministic and cacheable. Signals are combined into scores; no single missing
tag or cryptic name breaks the result.

**Pass A — page facts (expensive, cached, strategy-independent).** For every analysed PDF:
per-page text lines, per-page embedded-image summaries from the operator list (count, largest
pixel area, coverage, caption) and, for rendered pages, pixel statistics. Keyed by document
`mtimeMs`/`size` (see [Two caches](#two-caches)).

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
thumbnails (1400 px wide); classify
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
- **Richer proposal summary (option).** The Insights tab's "what's proposed" is still just the
  description, regex metrics and a list of document types present. Two deterministic sources
  would do much better:
  - *The application form.* Where the council publishes it, the standard application form has
    structured sections — residential units by type/tenure/bedrooms, non-residential floorspace by
    use class (existing / lost / proposed), materials, vehicle and cycle parking, site area. It is
    currently scored −6 as an admin file and never read. A section-anchored parser over its page
    text (already extracted by the page-facts cache once the form is opened) could fill the
    metrics authoritatively.
  - *The Design & Access / Planning Statement.* Its page text is already cached; a "The proposal"
    / "Description of development" / "Summary" section could supply a short proposal paragraph.
  Also keep qualifiers the metrics currently drop ("up to 1,500 homes" in outline applications),
  and show where each metric came from.
- **Vision strategy**: a vision pass (confirm kind, caption) and an LLM summary, called only on
  the heuristic's top-K candidates to bound cost. Render-vs-photo-vs-diagram is where rules have
  churned most, and the thumbnails are already rendered and cached.
- **Revision collapse**: when near-duplicates collapse, prefer the newest `datePublished`;
  parse drawing number + revision from the title block for the full fix.
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

There is no downloaded data in the repo (`downloads/` is gitignored). To reproduce the grounding
set, run `npm run samples` (cache-first download of `scripts/samples.json`). The heuristics were
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
| `26/03198/FUL` | Mixed-use heritage redevelopment, split DAS (150 docs) |

> `26/03198/FUL` is the first labelled sample (see `scripts/samples.expected.json`); it is also
> the largest by document count, so the quick budget (40 docs) scans under a third of it.

Workflow:

```bash
npm ci && npm ci --prefix ui
npx playwright install chromium        # only for the non-Electron scraper path
npm run samples                         # downloads the references above, cache-first
```

`npm run samples` is cache-first: any application already under
`downloads/<authority>/<ref>/` (even a partial one) is left for the scraper to
resume, and only missing references are fetched, sequentially. The manifest is
`scripts/samples.json`; pass references to fetch a subset, `--force` to
re-scrape, or `--list` to print the manifest. Run `npm run insights:report`
afterwards to build the contact sheet.

To fetch by hand instead, `npm run server` exposes the same scraper:

```bash
npm run server                          # API on :3000; downloads land in downloads/<authority>/<ref>/
curl -X POST localhost:3000/api/download -H 'content-type: application/json' \
  -d '{"reference":"<REF>"}'
curl localhost:3000/api/queue           # downloads run sequentially, 5s apart
```

**This sandbox note:** the Playwright browser needs an extracted dependency tree and a
fontconfig file, or Chromium crashes on launch (`libglib-2.0.so.0: cannot open shared object
file`, then a Skia `SkFontMgr_FontConfigInterface` FATAL). If you have root, the usual
`npx playwright install-deps chromium` handles it. In a minimal, non-root sandbox (uid 1000, no
`sudo`, no installed apt lists) build the tree into a workspace-writable prefix yourself. The
browser libs are only needed by the *scraper*; insights generation uses `@napi-rs/canvas` and
does not need them, though the fontconfig file helps page rendering.

```bash
P="$PWD/.paseo-tmp/pw"                       # any prefix the user can write (not /tmp/opencode)
# 1. The exact apt package list Playwright wants — printed even when it cannot install:
npx playwright install-deps --dry-run chromium 2>&1 | sed -n 's/^E: Unable to locate package //p'
# 2. Populate a private apt state (avoids root) and download the deps:
mkdir -p "$P/lists/partial" "$P/cache/archives/partial"
printf 'deb http://deb.debian.org/debian bookworm main\n' > "$P/sources.list"
APT_OPTS="-o Dir::State::Lists=$P/lists -o Dir::Cache=$P/cache \
  -o Dir::State::status=/var/lib/dpkg/status -o Dir::Etc::sourcelist=$P/sources.list \
  -o Dir::Etc::sourceparts=/dev/null -o APT::Sandbox::User= -o Debug::NoLocking=1"
apt-get $APT_OPTS update
apt-get $APT_OPTS --download-only --reinstall -y install <packages from step 1>
# 3. Extract into the prefix and point the browser at it:
for f in "$P"/cache/archives/*.deb; do dpkg-deb -x "$f" "$P/root"; done
export LD_LIBRARY_PATH="$P/root/usr/lib/x86_64-linux-gnu:$P/root/usr/lib/x86_64-linux-gnu/dri:$P/root/usr/lib/x86_64-linux-gnu/gio/modules:$P/root/lib/x86_64-linux-gnu"
# fonts.conf: <dir>$P/root/usr/share/fonts</dir> and a writable <cachedir>$P/fontcache</cachedir>
export FONTCONFIG_FILE="$P/fonts.conf"
node scripts/fetch-samples.mjs <REF>         # or npm run samples
```

With root, the equivalent is just a one-line exported `LD_LIBRARY_PATH`/`FONTCONFIG_FILE` against
a system-installed tree, e.g. `/tmp/pw-deps` + `/tmp/pb/fonts.conf` as used previously.

Note the portal host matters if you are probing by hand: it is
`applications.greatercambridgeplanning.org` (`src/authorities.ts`), **not**
`publicaccess.cambridge.gov.uk` — a DNS miss on the latter looks like "no network" but is not.

## Resuming in a new session

1. Read this document first; it is the source of truth for the plan and decisions. The status
   block at the top is the current state; the tuning history is in the git log. Where the doc and
   the code disagree, the code wins and the doc should be updated.
2. Check `git branch --show-current` / `git log`: the work lives on `docs/insights-plan` and is
   merge-ready; do future iteration on a fresh branch.
3. **Current state (2026-10):** heuristic strategy **v14**; `INSIGHTS_VERSION` 2;
   `FEATURES_VERSION` 1. Page facts are cached, so re-interpretation is cheap. The pipeline
   persists curated `images` (with a `reason` each) plus the full `found` set and `coverage`, and
   supports a user-triggered `deep` scan. Page titles beat document names; the DAS is prioritised;
   appendix figure books are excluded; render-vs-photo is read from the image caption. The UI is a
   **last, beta "Insights" tab** (no auto-open); the `/review` labelling tool is dev-only.
4. Samples are not in the repo (`downloads/` is gitignored). `npm run samples` fetches what is
   missing (cache-first) from `scripts/samples.json`.
5. **Evaluate, don't guess:** `npm run insights:eval` checks the hard assertions (non-zero on a
   miss) and reports label precision/recall/rank. Use the `/review` tool (or
   `npm run insights:report`) to label pages. `scripts/samples.expected.json` has labels for
   `26/03198/FUL` only; the other samples are still unlabelled. Note the eval currently **fails**
   two hard assertions on older samples (`25/04484/FUL` map miss, `26/01872/OUT` highlight miss).
6. **Versions:** bump `STRATEGY.version` (`generate.ts`) for interpretation changes (old caches
   auto-refresh in the background, reusing page facts); `FEATURES_VERSION` (`features.ts`) for
   extraction changes (re-extracts everything); `INSIGHTS_VERSION` (`cache.ts`) only for a schema
   change (old caches read as absent, i.e. a manual regenerate).
7. **Likely next work:** label more samples (and one from another authority) so precision/recall
   is not one application; then tackle the top findings from `26/03198/FUL` — coverage on large
   applications (quick budget vs deep), the DAS CHAPTER 3 embedded-figure false positives, kind
   accuracy, and the two failing hard assertions. After that, the **vision pass** (see
   [Known gaps](#known-gaps--future-slices)) to replace the render/photo rule churn, the richer
   summary, ranking within a kind, revision collapse, and Electron/Docker packaging checks.
8. Where this doc and the code disagree, update the doc — it should not silently rot.
