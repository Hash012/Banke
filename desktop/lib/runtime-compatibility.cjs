"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { atomicWriteFileSync } = require("./state-store.cjs");

// Electron's accelerated compositor is not a supported Explorer child-window
// surface. Start software rendering before app.ready; schedule data is untouched.
function configureRendering(app, platform) {
  if (platform !== "win32") return;
  if (typeof app.disableHardwareAcceleration === "function") app.disableHardwareAcceleration();
}

function prepareWindowPreferences(directory, preferences, platform) {
  if (platform !== "win32") return "";
  const marker = path.join(directory, "display-compatibility.json");
  try {
    if (fs.existsSync(marker) && JSON.parse(fs.readFileSync(marker, "utf8")).version === 2) return "";
    const current = preferences.load();
    if (!current.ok) return "";
    const saved = preferences.save({ ...current.state, mode: "window" });
    if (!saved.ok) return "";
    atomicWriteFileSync(marker, JSON.stringify({ version: 2 }) + "\n");
    return "本次更新先以普通窗口打开，避免旧版桌面模式白屏。确认日程显示正常后，可再次点击“固定到桌面”。";
  } catch (_) {
    // Failure to save a cosmetic migration never grants permission to touch data.
    return "";
  }
}

module.exports = { configureRendering, prepareWindowPreferences };
