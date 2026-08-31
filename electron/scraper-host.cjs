const { app, BrowserWindow } = require('electron');

// Headless host process used by Playwright's _electron driver to reuse this
// app's bundled Chromium for scraping. It just creates a blank window and
// stays alive; Playwright drives the window's page over CDP.
app.on('window-all-closed', () => {});

// Run as a background agent so the scraping host doesn't surface in the Dock
// (macOS), Cmd-Tab, or the taskbar — no second icon, no focus steal.
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
  // Present a normal Chrome UA — some planning portals behave differently (or
  // return no results) when they see an "Electron/..." user agent.
  win.webContents.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  win.loadURL('about:blank');
});
