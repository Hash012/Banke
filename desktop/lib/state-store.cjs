"use strict";

const nodeFs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { TextDecoder } = require("node:util");

const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;

function temporaryPath(target) {
  return path.join(path.dirname(target), "." + path.basename(target) + "." + process.pid + "." + randomBytes(8).toString("hex") + ".tmp");
}

function removeQuietly(fs, filename) {
  if (!filename) return;
  try { fs.unlinkSync(filename); } catch (_) { /* Never remove a good destination to clean up a temporary file. */ }
}

function syncDirectory(fs, directory) {
  // Directory fsync improves power-loss durability on POSIX. Windows does not
  // support opening/fsyncing a directory through the same Node API.
  if (process.platform === "win32") return;
  let fd;
  try { fd = fs.openSync(directory, "r"); fs.fsyncSync(fd); }
  catch (_) { /* The file itself was already flushed before its atomic rename. */ }
  finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} } }
}

function writeTemporary(fs, target, bytes) {
  const temporary = temporaryPath(target);
  let fd;
  try {
    fd = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    return temporary;
  } catch (error) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
    removeQuietly(fs, temporary);
    throw error;
  }
}

function atomicWriteFileSync(target, bytes, fs = nodeFs) {
  let temporary;
  try {
    temporary = writeTemporary(fs, target, bytes);
    // Do not unlink target as a Windows compatibility fallback: if rename fails,
    // its existing contents must remain available.
    fs.renameSync(temporary, target); temporary = null;
    syncDirectory(fs, path.dirname(target));
  } finally { removeQuietly(fs, temporary); }
}

function friendlyFileError(error, action = "保存") {
  if (error && error.code === "ENOSPC") return "磁盘空间不足，未能" + action + "。原有文件已保留，请腾出空间后重试。";
  if (error && ["EACCES", "EPERM", "EBUSY"].includes(error.code)) return "文件或文件夹暂时无法写入，未能" + action + "。原有文件已保留，请检查权限或关闭占用文件的程序后重试。";
  if (error && error.code === "ENOENT") return "保存位置暂时不可用，未能" + action + "。请选择仍然存在的文件夹后重试。";
  return "系统未能完成" + action + "，原有文件已保留。请检查磁盘和文件夹权限后重试。";
}

function createStateStore(options) {
  if (!options || typeof options.directory !== "string" || !path.isAbsolute(options.directory)) throw new TypeError("日程数据文件夹必须为绝对路径。");
  const directory = path.resolve(options.directory);
  const fs = options.fs || nodeFs;
  const validateState = options.validateState || require("./core.cjs").validateState;
  if (typeof validateState !== "function") throw new TypeError("缺少日程验证器。");
  const statePath = path.join(directory, "schedule.json");
  const previousPath = path.join(directory, "schedule.previous.json");

  function inspect(filename) {
    let stat;
    try { stat = fs.lstatSync(filename); }
    catch (error) { if (error.code === "ENOENT") return { kind: "missing" }; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      const error = new Error("日程数据位置不是普通文件，已停止读写以保护现有内容。");
      error.code = "UNSAFE_FILE"; throw error;
    }
    if (stat.size > MAX_PAYLOAD_BYTES) return { kind: "invalid", error: "日程文件超过 16 MiB，请先在数据文件夹中保留原文件，再恢复有效备份。" };
    const bytes = fs.readFileSync(filename);
    if (bytes.length > MAX_PAYLOAD_BYTES) return { kind: "invalid", error: "日程文件超过 16 MiB。" };
    let raw;
    try { raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch (_) { return { kind: "invalid", bytes, raw: bytes.toString("utf8"), error: "日程文件的文字编码已损坏。" }; }
    try {
      const state = JSON.parse(raw.replace(/^\uFEFF/, ""));
      const errors = validateState(state);
      if (errors.length) return { kind: "invalid", bytes, raw, error: errors.slice(0, 2).join(" ") };
      return { kind: "valid", bytes, raw, state };
    } catch (_) { return { kind: "invalid", bytes, raw, error: "日程文件无法解析为有效的 JSON。" }; }
  }

  function loadState() {
    try {
      const existing = inspect(statePath);
      if (existing.kind === "missing") return { ok: true, state: null };
      if (existing.kind === "valid") return { ok: true, state: existing.state };
      const result = { ok: false, error: "暂时无法读取日程，原文件未被修改。" + existing.error };
      // Replacement characters from invalid UTF-8 can expand the IPC payload.
      // Omit the preview rather than truncate or alter the preserved source.
      if (typeof existing.raw === "string" && Buffer.byteLength(existing.raw, "utf8") <= MAX_PAYLOAD_BYTES) result.raw = existing.raw;
      return result;
    } catch (error) {
      return { ok: false, error: error.code === "UNSAFE_FILE" ? error.message : "暂时无法读取日程，原文件未被修改。请检查数据文件夹的读取权限。" };
    }
  }

  function copyAndFlush(source, target) {
    let copied = false, fd;
    try {
      fs.copyFileSync(source, target, nodeFs.constants.COPYFILE_EXCL); copied = true;
      fd = fs.openSync(target, "r+"); fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
    } catch (error) {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
      if (copied) removeQuietly(fs, target);
      throw error;
    }
  }

  function archiveCorrupt(filename) {
    const stamp = new Date().toISOString().replace(/[-:.]/g, "");
    const base = path.basename(filename, ".json");
    const destination = path.join(directory, base + ".corrupt-" + stamp + "-" + randomBytes(4).toString("hex") + ".json");
    copyAndFlush(filename, destination);
    syncDirectory(fs, directory);
    return destination;
  }

  function saveState(state) {
    let bytes;
    try {
      const errors = validateState(state);
      if (errors.length) return { ok: false, error: "日程未保存：" + errors.slice(0, 3).join(" ") };
      bytes = Buffer.from(JSON.stringify(state, null, 2) + "\n", "utf8");
      if (bytes.length > MAX_PAYLOAD_BYTES) return { ok: false, error: "日程超过 16 MiB，未保存。请减少日程或备注内容后重试。" };
    } catch (_) { return { ok: false, error: "日程格式无效，未保存；原有文件已保留。" }; }

    let nextTemporary, previousTemporary, rollbackTemporary;
    let previousChanged = false, previousExisted = false, committed = false, keepRecovery = false;
    try {
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      const existing = inspect(statePath);
      if (existing.kind === "valid" && existing.bytes.equals(bytes)) return { ok: true, path: statePath };
      nextTemporary = writeTemporary(fs, statePath, bytes);

      if (existing.kind === "valid") {
        const previous = inspect(previousPath);
        previousExisted = previous.kind !== "missing";
        if (previousExisted) {
          // Keep the old backup until the new primary has committed, so a failed
          // final rename cannot silently destroy the previous recovery point.
          rollbackTemporary = temporaryPath(previousPath);
          copyAndFlush(previousPath, rollbackTemporary);
          if (previous.kind === "invalid") archiveCorrupt(previousPath);
        }
        previousTemporary = writeTemporary(fs, previousPath, existing.bytes);
        fs.renameSync(previousTemporary, previousPath); previousTemporary = null; previousChanged = true;
      } else if (existing.kind === "invalid") {
        // The corrupt source remains untouched until a complete, flushed copy
        // exists, including when it is too large to return through IPC.
        archiveCorrupt(statePath);
      }

      fs.renameSync(nextTemporary, statePath); nextTemporary = null; committed = true;
      syncDirectory(fs, directory);
      return { ok: true, path: statePath };
    } catch (error) {
      if (previousChanged && !committed) {
        try {
          if (previousExisted && rollbackTemporary) {
            fs.renameSync(rollbackTemporary, previousPath); rollbackTemporary = null;
          } else if (!previousExisted) fs.unlinkSync(previousPath);
        } catch (_) { keepRecovery = !!rollbackTemporary; }
      }
      const message = error.code === "UNSAFE_FILE" ? error.message : friendlyFileError(error, "保存日程");
      return { ok: false, error: message + (keepRecovery ? " 另有完整的 previous 恢复副本保留在数据文件夹的 .tmp 文件中。" : "") };
    } finally {
      removeQuietly(fs, nextTemporary);
      removeQuietly(fs, previousTemporary);
      if (!keepRecovery) removeQuietly(fs, rollbackTemporary);
    }
  }

  return Object.freeze({
    loadState, saveState,
    paths: Object.freeze({ directory, state: statePath, previous: previousPath })
  });
}

module.exports = { MAX_PAYLOAD_BYTES, createStateStore, atomicWriteFileSync, friendlyFileError };
