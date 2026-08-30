# planbrowser

A tool to search for and download documents for Cambridgeshire planning applications, with a web UI (Vue) and an API backend to search, download, and view applications in your browser.

## Features

- **Search** the [PlanIt API](https://www.planit.org.uk/) by postcode and radius, with optional filters (application type, state, date ranges, etc.)
- **Download** applications from any [Idox Public Access](https://www.idoxgroup.com/) planning portal using headless browser automation (Playwright). 230+ UK authorities are configured in `src/authorities.ts` (generated from the PlanIt API); Cambridge (Greater Cambridge) is the default and the only one with map geometry configured.
- **Extract documents** from applications, batching bulk downloads where possible, with incremental re-scraping (already-downloaded files are skipped)
- **Scrape comments** submitted by neighbours for each application
- **View** application metadata, key dates, documents, comments, and location on a map in the browser
- **Background queue** for processing download requests sequentially, with a 5-second delay between applications to avoid rate limiting
- **Favourite/star** applications so they float to the top of the list, and **archive** applications so they move to a separate Archived page
- **Sync all starred** applications in one click
- **Activity feed** showing what changed each time a synced application was re-scraped (new documents, status changes, new comments, etc.)

## Requirements

- Node.js (>= 20, for `Promise.withResolvers`)
- Playwright browsers installed (`npx playwright install chromium`)

## Usage

Start both the API server and the web frontend with a single command:

```bash
npm run dev
```

This runs the API server and the Vite dev server concurrently. Open the displayed URL (e.g. `http://localhost:5173`) in your browser.

To run the parts separately:

```bash
npm run server   # build + run the API server on port 3000
npm run ui       # Vite dev server
```

## API

| Method | Endpoint               | Description                                    |
| ------ | ---------------------- | ---------------------------------------------- |
| GET    | `/api/search`          | Search PlanIt by `postcode` and `radius` (km), plus optional filters |
| POST   | `/api/download`        | Enqueue an application for download by `reference` and optional `authority` (id or PlanIt area name; defaults to `cambridge`) |
| GET    | `/api/queue`           | List the download queue                        |
| POST   | `/api/queue/clear`     | Remove completed/failed items from the queue   |
| GET    | `/api/applications`    | List all downloaded applications               |
| PATCH  | `/api/applications/:ref` | Set `starred`/`archived` flags on an application (optional `authority` in body) |
| GET    | `/api/applications/:ref` | Get metadata for a single application (optional `?authority=` to disambiguate) |
| GET    | `/api/feed`            | List the activity feed (changes detected on re-sync) |
| POST   | `/api/sync-starred`    | Enqueue all starred applications for re-download |
| GET    | `/api/documents/*`     | Serve downloaded files and metadata statically |

Downloaded files are stored under `downloads/<authorityId>/<reference>/`, with `metadata.json` and (when present) `comments.json` alongside the document files.

## Project structure

```
src/         TypeScript backend (Express API, Playwright scraper, storage, queue)
  authorities.ts  Idox portal registry + authority resolution
ui/          Vue 3 + TypeScript + Vite frontend (Tailwind CSS, Leaflet)
downloads/   Downloaded application documents and metadata (gitignored)
```

## Dependencies

- [Express](https://expressjs.com/) – API server
- [Playwright](https://playwright.dev/) – headless browser automation
- [Cheerio](https://cheerio.js.org/) – HTML/XML parsing (WFS geometry)
- [proj4](https://github.com/proj4js/proj4) – coordinate conversion (OSGB36 to WGS84)
- [AdmZip](https://github.com/cthackers/adm-zip) – handling bulk document archives
- [Vue 3](https://vuejs.org/) / [Vite](https://vitejs.dev/) / [Tailwind CSS](https://tailwindcss.com/) / [Leaflet](https://leafletjs.com/) – frontend

## Acknowledgements

This tool uses the [PlanIt API](https://www.planit.org.uk/) to search for planning applications, and scrapes document/comment data from Idox Public Access planning portals (by default the [Greater Cambridge planning portal](https://applications.greatercambridgeplanning.org/online-applications)).
