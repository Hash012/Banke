"use strict";

const path = require("node:path");

// WS_CHILD windows do not have their own taskbar button. A minimized, ordinary
// window keeps a visible recovery entry without raising the desktop widget.
function createTaskbarAnchor({ BrowserWindow, app, appId, icon, onRestore, onQuit }) {
  let window = null, disposed = false, starting = false;
  function remove() {
    const old = window; window = null;
    if (old && !old.isDestroyed()) old.destroy();
  }
  function show() {
    if (disposed || (window && !window.isDestroyed())) return;
    const current = new BrowserWindow({ width: 320, height: 160, show: false,
      title: "半刻 · 桌面日程", icon, skipTaskbar: false, alwaysOnTop: false,
      resizable: false, maximizable: false, fullscreenable: false,
      backgroundColor: "#f5f7f8", autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true,
        javascript: false, devTools: false, webSecurity: true }
    });
    window = current; starting = true;
    if (typeof current.setMenu === "function") current.setMenu(null);
    if (typeof current.setAppDetails === "function") current.setAppDetails({
      appId, appIconPath: app.getPath("exe"), appIconIndex: 0,
      relaunchCommand: '"' + app.getPath("exe") + '"', relaunchDisplayName: "半刻 · 我的周计划"
    });
    current.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    current.webContents.on("will-navigate", event => event.preventDefault());
    current.on("restore", () => {
      if (disposed || starting || window !== current) return;
      // Restoring a group of minimized windows need not activate this one.
      // Wait for focus, then open our editor only for an active recovery entry.
      setTimeout(() => {
        if (disposed || window !== current || current.isDestroyed()) return;
        try {
          if (current.isFocused()) onRestore();
        } catch (_) { /* The tray remains an independent recovery route. */ }
        if (window === current && !current.isDestroyed()) current.minimize();
      }, 80);
    });
    current.on("close", event => {
      if (disposed || window !== current) return;
      event.preventDefault(); onQuit();
    });
    current.once("ready-to-show", () => {
      if (disposed || window !== current || current.isDestroyed()) return;
      current.showInactive(); current.minimize(); starting = false;
    });
    current.loadFile(path.join(__dirname, "..", "renderer", "taskbar.html")).catch(() => {
      if (window === current) remove();
    });
  }
  return { update(desktop) { if (desktop) show(); else remove(); },
    dispose() { disposed = true; remove(); } };
}

module.exports = { createTaskbarAnchor };
