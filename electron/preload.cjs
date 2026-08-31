const { contextBridge } = require('electron');

// Minimal bridge. The UI talks to the backend over HTTP (relative /api paths),
// so nothing needs exposing today; this exists as a safe place to add IPC
// hooks later (e.g. version info, window controls, file-open dialogs).
contextBridge.exposeInMainWorld('planbrowser', {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
});
