import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Scraper-host mode: Playwright launches this same binary with
// PLANBROWSER_SCRAPER_MODE=1 to reuse its Chromium for headless scraping. It
// must create a single hidden window and idle — no server, no visible UI.
if (process.env.PLANBROWSER_SCRAPER_MODE === '1') {
  app.on('window-all-closed', () => {});
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }
  app.whenReady().then(() => {
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 820,
      skipTaskbar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    // Present a normal Chrome UA — some planning portals behave differently
    // (or return no results) when they see an "Electron/..." user agent.
    win.webContents.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    win.loadURL('about:blank');
  });
} else {
  // Ensure a stable app name regardless of how Electron is launched (dev vs
  // packaged), so userData ends up at ~/Library/Application Support/planbrowser
  // rather than the generic "Electron".
  app.setName('planbrowser');

  // Resolve the locations of the built UI and backend from the app bundle
  // (works both unpacked and inside app.asar). These must be set *before* the
  // backend's config module is imported, hence the dynamic import below.
  process.env.UI_DIST_DIR = path.join(__dirname, '..', 'ui', 'dist');
  process.env.DOWNLOADS_DIR =
    process.env.DOWNLOADS_DIR ?? path.join(app.getPath('userData'), 'downloads');

  // Signal to the backend scraper that it's running inside Electron, so it
  // drives this app's own Chromium instead of launching a separate browser.
  process.env.PLANBROWSER_ELECTRON = '1';

  let mainWindow = null;
  let server = null;

  const gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });

    app.whenReady().then(async () => {
      const port = await startServer();
      createWindow(port);

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
      });
    });
  }

  async function startServer() {
    const { createApp } = await import('../dist/app.js');
    // Listen on an ephemeral port so we never collide with a running dev
    // server or the Docker container.
    server = await new Promise((resolve) => {
      const s = createApp().listen(0, '127.0.0.1', () => resolve(s));
    });
    return server.address().port;
  }

  function createWindow(port) {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 820,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());

    // Open external links (e.g. the original planning portal pages) in the
    // user's browser rather than inside the app window.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow.loadURL(`http://127.0.0.1:${port}`);
  }

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    if (server) server.close();
  });
}
