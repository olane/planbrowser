import path from 'path';

// Where downloaded documents and all persistent state live. Defaults to the
// repo's `downloads/` directory (matching the Docker/CLI behaviour), but can be
// overridden via env (e.g. Electron points it at the OS user-data directory).
export const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR
  ? path.resolve(process.env.DOWNLOADS_DIR)
  : path.join(process.cwd(), 'downloads');

// Where the built web UI lives. In a packaged Electron app this is the bundled
// `ui/dist` next to the app resources, not the current working directory.
export const UI_DIST_DIR = process.env.UI_DIST_DIR
  ? path.resolve(process.env.UI_DIST_DIR)
  : path.join(process.cwd(), 'ui', 'dist');
