"use strict";

const nodeFs = require("node:fs");
const path = require("node:path");
const { TextDecoder } = require("node:util");
const { atomicWriteFileSync, friendlyFileError } = require("./state-store.cjs");

const MAX_PREFERENCES_BYTES = 16 * 1024;
const PREFERENCE_KEYS = ["version", "mode", "displayId", "normalBounds"];
const BOUNDS_KEYS = ["x", "y", "width", "height"];

function exactRecord(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some(key => !keys.includes(key))) return false;
  // Accessors and non-enumerable properties are not a serialized settings record.
  return keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && descriptor.enumerable && Object.hasOwn(descriptor, "value");
  });
}

function validBounds(value) {
  return exactRecord(value, BOUNDS_KEYS) && BOUNDS_KEYS.every(key => Number.isSafeInteger(value[key])) && value.width > 0 && value.height > 0;
}

function validPreferences(value) {
  return exactRecord(value, PREFERENCE_KEYS) && value.version === 1 &&
    (value.mode === "desktop" || value.mode === "window") &&
    (value.displayId === null || Number.isSafeInteger(value.displayId)) &&
    (value.normalBounds === null || validBounds(value.normalBounds));
}

function copyPreferences(value) {
  return {
    version: 1,
    mode: value.mode,
    displayId: value.displayId,
    normalBounds: value.normalBounds === null ? null : {
      x: value.normalBounds.x, y: value.normalBounds.y,
      width: value.normalBounds.width, height: value.normalBounds.height
    }
  };
}

function defaultPreferences() {
  return { version: 1, mode: "window", displayId: null, normalBounds: null };
}

function validateWorkArea(workArea) {
  if (!workArea || typeof workArea !== "object" ||
      !BOUNDS_KEYS.every(key => Number.isSafeInteger(workArea[key])) ||
      workArea.width <= 0 || workArea.height <= 0 ||
      !Number.isSafeInteger(workArea.x + workArea.width) ||
      !Number.isSafeInteger(workArea.y + workArea.height)) {
    throw new TypeError("屏幕可用区域必须包含有效的 DIP 整数坐标及正尺寸。");
  }
}

function rightHalfBounds(workArea) {
  validateWorkArea(workArea);
  // Electron workArea is already in DIP. The odd remaining DIP belongs to the
  // right half; applying a display scale factor here would double-scale it.
  const leftWidth = Math.floor(workArea.width / 2);
  return { x: workArea.x + leftWidth, y: workArea.y, width: workArea.width - leftWidth, height: workArea.height };
}

function clampWindowBounds(saved, workArea) {
  validateWorkArea(workArea);
  const previous = validBounds(saved) ? saved : null;
  const minWidth = Math.min(840, workArea.width);
  const minHeight = Math.min(640, workArea.height);
  const width = Math.min(workArea.width, Math.max(minWidth, previous ? previous.width : 1440));
  const height = Math.min(workArea.height, Math.max(minHeight, previous ? previous.height : 940));
  const desiredX = previous ? previous.x : workArea.x + Math.floor((workArea.width - width) / 2);
  const desiredY = previous ? previous.y : workArea.y + Math.floor((workArea.height - height) / 2);
  return {
    x: Math.min(workArea.x + workArea.width - width, Math.max(workArea.x, desiredX)),
    y: Math.min(workArea.y + workArea.height - height, Math.max(workArea.y, desiredY)),
    width, height
  };
}

function createDesktopPreferences(options) {
  if (!options || typeof options.directory !== "string" || options.directory.includes("\0") || !path.isAbsolute(options.directory)) {
    throw new TypeError("桌面设置文件夹必须为绝对路径。");
  }
  const directory = path.resolve(options.directory);
  const preferencesPath = path.join(directory, "window-preferences.json");
  const fs = options.fs || nodeFs;

  function inspectDirectory() {
    let stat;
    try { stat = fs.lstatSync(directory); }
    catch (error) { if (error.code === "ENOENT") return { kind: "missing" }; throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      return { kind: "invalid", error: "桌面设置位置不是普通文件夹，已停止读写以保护现有内容。" };
    }
    return { kind: "valid" };
  }

  function inspectPreferences() {
    const folder = inspectDirectory();
    if (folder.kind !== "valid") return folder;
    let stat;
    try { stat = fs.lstatSync(preferencesPath); }
    catch (error) { if (error.code === "ENOENT") return { kind: "missing" }; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return { kind: "invalid", error: "桌面设置文件不是普通文件，已停止读写以保护现有内容。" };
    }
    if (stat.size > MAX_PREFERENCES_BYTES) return { kind: "invalid", error: "桌面设置文件超过 16 KiB，原文件已保留。" };
    const bytes = fs.readFileSync(preferencesPath);
    if (bytes.length > MAX_PREFERENCES_BYTES) return { kind: "invalid", error: "桌面设置文件超过 16 KiB，原文件已保留。" };
    let value;
    try {
      const raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      value = JSON.parse(raw.replace(/^\uFEFF/, ""));
      if (!validPreferences(value)) return { kind: "invalid", error: "桌面设置格式无效，原文件已保留。" };
    } catch (_) {
      return { kind: "invalid", error: "桌面设置文件无法读取为有效 JSON，原文件已保留。" };
    }
    return { kind: "valid", state: copyPreferences(value), bytes };
  }

  function load() {
    try {
      const existing = inspectPreferences();
      if (existing.kind === "missing") return { ok: true, state: defaultPreferences() };
      if (existing.kind === "valid") return { ok: true, state: existing.state };
      return { ok: false, error: existing.error };
    } catch (_) {
      return { ok: false, error: "暂时无法读取桌面设置，原文件未被修改。请检查设置文件夹的读取权限。" };
    }
  }

  function save(state) {
    let bytes;
    try {
      if (!validPreferences(state)) return { ok: false, error: "桌面设置格式无效，未保存；原有文件已保留。" };
      bytes = Buffer.from(JSON.stringify(copyPreferences(state), null, 2) + "\n", "utf8");
      if (bytes.length > MAX_PREFERENCES_BYTES) return { ok: false, error: "桌面设置超过 16 KiB，未保存。" };
    } catch (_) {
      return { ok: false, error: "桌面设置格式无效，未保存；原有文件已保留。" };
    }
    try {
      const existing = inspectPreferences();
      // The caller can fall back in memory after load fails. Never erase the
      // unreadable source merely because that fallback is subsequently saved.
      if (existing.kind === "invalid") return { ok: false, error: existing.error };
      if (existing.kind === "valid" && existing.bytes.equals(bytes)) return { ok: true };
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      const folder = inspectDirectory();
      if (folder.kind !== "valid") return { ok: false, error: folder.error || "桌面设置文件夹暂时不可用。" };
      atomicWriteFileSync(preferencesPath, bytes, fs);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: friendlyFileError(error, "保存桌面设置") };
    }
  }

  return Object.freeze({ load, save, path: preferencesPath });
}

module.exports = { createDesktopPreferences, rightHalfBounds, clampWindowBounds };
