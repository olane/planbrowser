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
- **Favourite/star individual documents** and attach **notes** to them; starred documents are grouped under a Favourites tab on each application's page
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

## Docker

A container image is built automatically by GitHub Actions on every push to `main` and published to `ghcr.io/olane/planbrowser:latest`. It bundles the API server, the built web UI, and Chromium for Playwright, and serves everything on port 3000 (the server serves the UI directly when `NODE_ENV=production`).

### Pull and run

```bash
mkdir -p downloads && chown -R 1000:1000 downloads
docker run -d --name planbrowser \
  -p 3000:3000 \
  --user 1000:1000 \
  -v "$PWD/downloads:/app/downloads" \
  ghcr.io/olane/planbrowser:latest
```

Then open `http://localhost:3000`.

### Docker Compose

```yaml
services:
  planbrowser:
    image: ghcr.io/olane/planbrowser:latest
    user: "1000:1000"
    volumes:
      - ./downloads:/app/downloads
    ports:
      - "3000:3000"
    restart: unless-stopped
```

### Build locally

```bash
docker build -t planbrowser .
docker run -d --name planbrowser -p 3000:3000 -v "$PWD/downloads:/app/downloads" planbrowser
```

### Notes

- All state (downloaded documents, metadata, flags, activity feed) lives in the `downloads/` directory, which must be mounted as a persistent volume.
- The image runs as a non-root user (`1000:1000`), so the mounted `downloads/` directory must be writable by that uid/gid.
- Chromium is bundled via `npx playwright install --with-deps chromium`, so no separate browser install is needed on the host.

## Electron (desktop app)

Desktop installers are built by GitHub Actions on every version tag (`v*`) and attached to the corresponding [GitHub Release](https://github.com/olane/planbrowser/releases): a macOS `.dmg`, a Windows `.exe` installer, and a Linux `.AppImage`/`.deb`.

### Install

Download the installer for your platform from the latest release and install it as usual:

- **macOS**: open the `.dmg`, drag `planbrowser` into Applications. The app is not signed with an Apple Developer ID, so the first launch is blocked by Gatekeeper — see below.
- **Windows**: run the `.exe` installer (SmartScreen will warn because it's unsigned — choose *More info → Run anyway*).
- **Linux**: make the `.AppImage` executable (`chmod +x planbrowser-*.AppImage`) and run it, or install the `.deb` with `sudo apt install ./planbrowser_*.deb`.

Unlike Docker, the desktop app needs no Playwright browser installed — it reuses its own bundled Chromium for scraping.

### macOS first launch (unsigned app)

The macOS build is ad-hoc signed (not notarized), so on first launch macOS blocks it with *"Apple could not verify planbrowser is free of malware…"*. There is no "Open Anyway" button on the popup itself — bypass it once via either:

1. **System Settings** → **Privacy & Security** → scroll to the Security section → **Open Anyway** (appears after a failed launch attempt), or
2. Terminal:

   ```bash
   xattr -cr /Applications/planbrowser.app
   ```

The app opens normally after that. Each new download needs this step repeated. Eliminating the warning entirely requires a paid Apple Developer ID and notarization.

### Desktop app data

All state (downloaded documents, metadata, flags, activity feed) is stored per-user rather than in the repo, e.g. `~/Library/Application Support/planbrowser/downloads` on macOS.

### Build from source

```bash
npm run electron        # build backend + UI, then launch the app
npm run electron:pack   # build an unpacked .app in release/
npm run electron:dist   # build installers (dmg/zip, exe, AppImage/deb)
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
| PATCH  | `/api/documents`         | Set `starred`/`note` on a document (body: `reference`, `filename`, optional `authority`, `starred`, `note`) |
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
