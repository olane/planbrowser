# Idox Public Access portals: quirks and lessons

These tripped us up repeatedly while building the scraper, so we're writing them down. Most findings are verified against [Greater Cambridge](https://applications.greatercambridgeplanning.org/online-applications) (the default authority); planbrowser targets the ~230 Idox installs registered in `src/authorities.ts`, and Idox installs differ, so treat anything below as "true on every portal we tested" rather than guaranteed.

The scraping logic that works around these quirks lives in `src/scraper.ts` (`downloadApplication`, `downloadDocuments`, `scrapeComments`, `resolvePortalUrl`).

## Finding applications

- **A reference search that returns exactly one match does not deep-link.** After submitting a single exact reference, the browser stays on the search-results URL `advancedSearchResults.do?action=firstPage` (which renders the one application's summary inline) rather than navigating to the application page. Don't be tempted to store `page.url()` here.
- **That results URL is session-bound.** Idox keeps the search results server-side against your `JSESSIONID`. Opening the `advancedSearchResults.do?action=firstPage` URL later — e.g. in a fresh browser via a "View on portal" link — fails with a 500 "Server Problem" page. This is not a bot-wall on deep links; the page genuinely needs a live search session.
- **The real deep links are stable.** Every application page exposes `applicationDetails.do?…&keyVal=<token>` links (Summary/Details/Dates/etc.). The `keyVal` token is not session-bound — it stays constant across sessions and the URL loads fine from a cold browser on every portal we've tested.
- planbrowser therefore records the canonical `applicationDetails.do` link (preferring `activeTab=summary`) as `portalUrl` — see `resolvePortalUrl` in `src/scraper.ts`. This is the URL the UI's "View on portal" button opens.

## Application pages

- Summary, details, dates, further information, documents, and comments are all reachable as separate `applicationDetails.do?activeTab=…&keyVal=…` pages. The scraper reads tab URLs off the page before navigating so it never depends on `keyVal` values in its own code.
- A "Did we land on the application details page?" sanity check runs after search, because a portal that is *not* actually Idox (or has a different layout) must fail loudly instead of silently scraping the wrong page.

## Documents

- **Table layout differs between installs.** Cambridge (Greater Cambridge) has a leading checkbox column plus a Measure icon and Drawing Number column; Wigan has a compact 4-column table. The scraper detects column positions from the table header row (`#Documents`) and falls back to the Greater Cambridge layout (date=1, type=2, description=5, view=6) when no usable headers are found.
- **Rows can collide without being the same file.** The same upload can genuinely be listed twice (e.g. under both "Documents" and another category), but two rows that render the *same* `date - type - description` are often **different** documents: each Idox upload gets its own document id (the trailing number in its file URL and bulk-zip member, e.g. `…/files/<hash>/pdf/<REF>-<NAME>-7414943.pdf`). Superseded revisions, a `.pdf` alongside its source `.docx`, and two comment letters published the same day can all look identical. planbrowser therefore dedupes rows by that underlying document id (never by the rendered name), keeps genuinely distinct versions, and disambiguates their local filenames with ` (2)`, ` (3)`, … suffixes when two would otherwise share a name. Re-scrapes match documents by id, so the disambiguated names stay stable. Existing scrapes recorded *before* the id was stored have no id, so a one-off re-sync of an affected application is needed to repopulate the versions that were previously collapsed.
- **Local filenames are generated, not given.** Each file is stored as `<date> - <type> - <description>` (with a numeric suffix if that name is already taken by a different document) and the extension is taken from the zip entry path (bulk), the browser's suggested filename (individual), or `.pdf` as a last resort. The description is stripped of non-`[a-zA-Z0-9 -]` characters for filesystem safety, and references (which contain `/`, e.g. `24/00123/FUL`) are stored under `safeReference`, slashes replaced with `-` — see `src/refs.ts`. The portal document id is recorded alongside each document in `metadata.json` (`docId`) so re-scrapes can tell documents apart without relying on the generated name.
- **Bulk downloads come as zips.** Modern installs render each row with a `.bulkCheck` checkbox whose `value` is the member path inside the archive (e.g. `<HASH>/<NAME>-<docId>.pdf`), plus a `#downloadFiles` button that zips the checked rows. The archive can occasionally omit an entry for a checked row, so anything missing from the zip falls back to an individual download.
- **Bulk batches are capped at 25.** Idox enforces a maximum of 25 documents per bulk download: selecting more pops a "maximum 25 documents" message (in Electron this surfaces as a *native* dialog — see [Headless scraping in Electron](#headless-scraping-in-electron)). The scraper therefore checks and downloads in chunks of 25 and unchecks after each batch. `#downloadFiles` is enabled/disabled by page JavaScript, so the scraper waits for it to become enabled and force-enables it if the page scripts failed to.
- **Document files are not freely deep-linkable** (verified on Greater Cambridge). Each row's "View" anchor points at a stable-looking file URL:
  `/online-applications/files/<HASH>/pdf/<REF>-<NAME>-<docId>.pdf`.
  Don't be fooled — those URLs only serve inside an authorised portal session:
  - A cold request with no session returns HTTP 403 "Access denied" at the edge.
  - A request carrying the application page as `Referer` reaches the Idox app server but returns a 404 "Document Unavailable" page.
  - On newer installs the anchors carry `class="recaptcha-link"`, i.e. document downloads are gated behind bot-protection.
  
  In other words: `applicationDetails.do` pages deep-link fine from a cold browser, but the document *files* do not. This is why planbrowser downloads and stores copies rather than handing out source URLs, and why a "view on the portal" feature can only ever be best-effort. Session-bound document URLs would not survive being shared with someone else's browser.
- **Superseded files stay downloadable.** Old versions keep appearing under "Superseded Documents"; the UI uses this to group revisions (a superseded row whose description matches a live one is shown as "superseded by" the newer file).

## Comments

- The Comments tab is `#tab_makeComment`, and neighbour comments live one level deeper under the `#subtab_neighbourComments` sub-tab.
- Individual comments are `.comment` nodes with `.consultationAddress`, `.consultationStance` (the stance text is wrapped in parentheses on the portal and stripped), a heading of the form "Comment submitted date: …", and `.comment-text` for the body.
- Comments are paginated; navigation is via `p.pager.bottom a.next`. Scraping walks pages until no `next` link remains.
- Comment scraping is best-effort: a failure there must not lose the already-recorded document metadata or fail the whole download.
- Downloads are ordered by value, not by whatever the portal happens to list first: main details (summary/dates/further information/location) are scraped first and saved, then comments, and the (potentially large, bulk) document files last. Each is committed to disk as it is fetched — `metadata.json` is written once the details are in hand and rewritten as documents land, so an application is viewable in the UI while still downloading. Files are written the moment they arrive, and writes are atomic (temp file + rename) so a live reader never sees a half-written JSON file. On a re-scrape the previously-recorded document list is kept in `metadata.json` until the fresh inventory replaces it, so a scrape that dies partway never loses already-recorded documents.

## Authority registry

- `src/authorities.ts` is generated from the PlanIt API, keeping only authorities whose `scraper_type` mentions Idox **and** whose `planning_url` uses the classic Idox `search.do?action=advanced` entry point. `baseUrl` is that URL with the search path stripped; the scraper re-appends `search.do?action=advanced&searchType=Application`.
- **PlanIt's `scraper_type` labels are unreliable.** Manchester and Powys, for example, are labelled Idox but actually run Arcus portals — which is why the `search.do` URL pattern is also required.
- **Many councils share one portal** (Cambridge City & South Cambridgeshire both run the Greater Cambridge portal). Entries are deduplicated by `baseUrl` and alternate area names are kept as aliases so a search under either council resolves to the same portal.
- **Location geometry is per-authority opt-in.** Only authorities with a `map` config (currently just Cambridge) get a location scraped. It is fetched from the authority's Esri PAM `MapServer` via a WFS `GetFeature` request filtering on the configured reference field (e.g. `REFVAL`), trying configured layers (points then polygons) and converting OSGB36 to WGS84 (`src/geometry.ts`). Portals without `map` config simply have no location.

## Rate limiting and politeness

- Downloads run strictly sequentially with a 5-second delay between applications (`src/queue.ts`) to avoid rate-limiting the portal.
- Re-scraping is incremental: files that already exist on disk are skipped, so only genuinely new documents are fetched. Re-scrapes still load the document list to diff against the stored metadata (this drives the activity feed).
- Bulk downloads are capped at 25 documents per request and each batch is a single zip request rather than N file requests — much gentler on the portal.

## Headless scraping in Electron

These are less about the portal and more about how planbrowser scrapes it without requiring a separate Playwright browser install:

- **Electron reuses its own Chromium.** The scraper relaunches the running app binary in a hidden "scraper-host" window (`PLANBROWSER_SCRAPER_MODE=1`, `electron/main.mjs`) rather than launching a separate Playwright browser.
- **A plain Chrome UA is required.** Some planning portals behave differently — or return no results — when they see an `Electron/…` user agent, so the scraper-host window sets a desktop Chrome UA.
- **Page dialogs become native dialogs.** Idox uses `alert()` for things like the 25-document limit. In Electron these surface as native dialogs over everything and would block the scrape, so they are neutralised and auto-accepted via CDP.
- **Downloads are captured over CDP, not Playwright events.** Electron pages don't emit Playwright's `download` event, so `Browser.setDownloadBehavior` is used to route downloads to a temp directory, which is then polled for new files (ignoring `.crdownload`/`.download` partials). Temp user-data and download directories are cleaned up after each scrape.
- **External links leave the app.** `target="_blank"` links (e.g. "View on portal") are handed to the OS browser via `shell.openExternal` rather than opened in an Electron window.
