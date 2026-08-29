# planbrowser

A tool to search for and download documents for Cambridgeshire planning applications, with a web UI (Vue) and an API backend to search, download, and view applications in your browser.

## Features

- **Search** the [PlanIt API](https://www.planit.org.uk/) by postcode and radius, with optional filters (application type, state, date ranges, etc.)
- **Download** applications from the [Greater Cambridge planning portal](https://applications.greatercambridgeplanning.org/online-applications) using headless browser automation (Playwright)
- **Extract documents** from applications, batching bulk downloads where possible, with incremental re-scraping (already-downloaded files are skipped)
- **Scrape comments** submitted by neighbours for each application
- **View** application metadata, key dates, documents, comments, and location on a map in the browser
- **Background queue** for processing download requests sequentially, with a 5-second delay between applications to avoid rate limiting

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
| POST   | `/api/download`        | Enqueue an application for download by `reference` |
| GET    | `/api/queue`           | List the download queue                        |
| POST   | `/api/queue/clear`     | Remove completed/failed items from the queue   |
| GET    | `/api/applications`    | List all downloaded applications               |
| GET    | `/api/applications/:ref` | Get metadata for a single application        |
| GET    | `/api/documents/*`     | Serve downloaded files and metadata statically |

Downloaded files are stored under `downloads/<reference>/`, with `metadata.json` and (when present) `comments.json` alongside the document files.

## Project structure

```
src/         TypeScript backend (Express API, Playwright scraper, storage, queue)
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

This tool uses the [PlanIt API](https://www.planit.org.uk/) to search for planning applications, and scrapes document/comment data from the [Greater Cambridge planning portal](https://applications.greatercambridgeplanning.org/online-applications).
