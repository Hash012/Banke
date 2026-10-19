"use strict";

const fsDefault = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { TextDecoder } = require("node:util");
const Core = require("./core.cjs");
const Sync = require("./sync-core.cjs");
const { atomicWriteFileSync, friendlyFileError } = require("./state-store.cjs");

const MAX_RECORD_BYTES = 48 * 1024 * 1024;
const MAX_DEVICES = 12;
const DEVICE_ID = /^d-[a-f0-9]{32}$/;
const REQUEST_ID = /^[A-Za-z0-9._:-]{16,120}$/;
const clone = value => JSON.parse(JSON.stringify(value));
const digest = value => crypto.createHash("sha256").update(Sync.stableStringify(value), "utf8").digest("hex");
function validKey(value) {
  return typeof value === "string" && /^[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value, "base64").length === 32;
}
function validDevice(device) {
  return device && typeof device === "object" && DEVICE_ID.test(device.deviceId) &&
    typeof device.deviceName === "string" && device.deviceName.trim().length > 0 && device.deviceName.length <= 80 &&
    validKey(device.key) && typeof device.createdAt === "string" && typeof device.lastSeenAt === "string" &&
    Number.isSafeInteger(device.sequence) && device.sequence >= 0 &&
    (device.lastRequestId === null || REQUEST_ID.test(device.lastRequestId)) &&
    (device.lastDigest === null || /^[a-f0-9]{64}$/.test(device.lastDigest)) &&
    Array.isArray(device.lastConflicts) && device.lastConflicts.length <= 1000;
}
function validateRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record) || record.version !== 1 ||
    !/^s-[a-f0-9]{32}$/.test(record.serverId) || typeof record.enabled !== "boolean" ||
    !Number.isSafeInteger(record.revision) || record.revision < 0 ||
    !Array.isArray(record.devices) || record.devices.length > MAX_DEVICES || !record.devices.every(validDevice) ||
    new Set(record.devices.map(device => device.deviceId)).size !== record.devices.length ||
    !Array.isArray(record.conflicts) || record.conflicts.length > 256 || typeof record.updatedAt !== "string") return false;
  if (record.state !== null && Core.validateState(record.state).length) return false;
  if (record.mirrorBase !== null && Core.validateState(record.mirrorBase).length) return false;
  return true;
}

/**
 * sync-state.json is the durable commit record. It contains the unchanged strict
 * v1 schedule plus replay metadata in ONE atomic write. schedule.json remains a
 * v1 compatibility projection and is written only after that commit succeeds.
 * mirrorBase records the exact prior projection, allowing restart to distinguish
 * an interrupted projection from an independent edit made with an older app.
 * No sidecar field is ever inserted into a v1 schedule or exported JSON backup.
 */
function createSyncStore(options) {
  if (!options || !path.isAbsolute(options.directory || "") || !options.store ||
    typeof options.store.loadState !== "function" || typeof options.store.saveState !== "function") throw new TypeError("缺少同步数据文件夹或本机保存组件。");
  const fs = options.fs || fsDefault;
  const directory = path.resolve(options.directory);
  const filename = path.join(directory, "sync-state.json");
  const store = options.store;
  const now = options.now || (() => Date.now());
  const stamp = () => new Date(now()).toISOString();
  let record = { version: 1, serverId: "s-" + crypto.randomBytes(16).toString("hex"), enabled: false, revision: 0,
    state: null, mirrorBase: null, devices: [], conflicts: [], updatedAt: stamp() };
  let blockedError = "", warning = "", primaryError = null;

  function checkFile() {
    let stat;
    try { stat = fs.lstatSync(filename); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("同步数据位置不是普通文件，原内容已保留。");
    if (stat.size > MAX_RECORD_BYTES) throw new Error("同步数据文件过大，原内容已保留。");
    return stat;
  }
  function persistRecord(next) {
    if (!validateRecord(next)) throw new Error("同步数据格式无效，原内容已保留。");
    const bytes = Buffer.from(JSON.stringify(next, null, 2) + "\n", "utf8");
    if (bytes.length > MAX_RECORD_BYTES) throw new Error("同步记录超过保存上限，原内容已保留。");
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    checkFile();
    atomicWriteFileSync(filename, bytes, fs);
    record = next;
  }
  function result(conflicts = [], extras = {}) {
    return { ok: true, state: record.state ? clone(record.state) : null,
      snapshot: record.state ? Sync.sharedSnapshot(record.state) : null, revision: record.revision,
      conflicts: clone(conflicts), ...(warning ? { warning, mirrorPending: true } : {}), ...extras };
  }
  function failure(error, fallback) {
    return { ok: false, error: error && error.message || fallback || "同步数据暂时无法保存。", code: error && error.code || "SYNC_STORAGE_ERROR",
      ...(error && Array.isArray(error.conflicts) ? { conflicts: clone(error.conflicts) } : {}) };
  }
  function commit(nextState, devices, conflicts = [], options = {}) {
    if (blockedError) return { ok: false, error: blockedError, code: "SYNC_STORAGE_ERROR" };
    const errors = Core.validateState(nextState);
    if (errors.length) return { ok: false, error: errors.slice(0, 3).join(" "), code: "INVALID_STATE" };
    const changed = !record.state || !Sync.equal(Sync.sharedSnapshot(record.state), Sync.sharedSnapshot(nextState));
    if (changed && record.revision >= Number.MAX_SAFE_INTEGER) return { ok: false, error: "同步版本已到达上限，请保留备份后重新配对。", code: "REVISION_LIMIT" };
    const next = { ...clone(record), state: clone(nextState), revision: record.revision + (changed ? 1 : 0),
      devices: devices ? clone(devices) : clone(record.devices), conflicts: record.conflicts.concat(clone(conflicts)).slice(-256), updatedAt: stamp() };
    if (options.mirrorBase !== undefined) next.mirrorBase = clone(options.mirrorBase);
    const sameState = !!record.state && Sync.equal(record.state, nextState);
    try { persistRecord(next); }
    catch (error) { return failure(error, friendlyFileError(error, "保存同步数据")); }
    // The durable record has committed. A failed compatibility projection must
    // not pretend the transaction failed and cause a client to resubmit it.
    if (!sameState || warning || primaryError) {
      let saved;
      try { saved = store.saveState(clone(nextState)); }
      catch (_) { saved = { ok: false, error: "兼容日程文件暂时无法写入。" }; }
      warning = saved.ok ? "" : "日程已安全保存到同步记录；兼容日程文件暂未更新。" + (saved.error || "");
      if (saved.ok) { record.mirrorBase = clone(nextState); primaryError = null; }
    }
    return result(conflicts, { changed });
  }

  try {
    if (checkFile()) {
      const bytes = fs.readFileSync(filename);
      if (bytes.length > MAX_RECORD_BYTES) throw new Error("同步数据文件过大，原内容已保留。");
      const candidate = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""));
      if (!validateRecord(candidate)) throw new Error("同步记录格式无法识别，原文件未被修改；本机日程仍可使用。");
      record = candidate;
    }
  } catch (error) { blockedError = "暂时无法读取同步记录。" + (error.message || "原文件已保留。"); }
  const primary = store.loadState();
  if (!primary.ok) {
    // Do not overwrite an unreadable schedule during application startup. The
    // existing renderer's explicit backup/import recovery remains in charge.
    primaryError = primary;
  } else if (!blockedError && !record.state) {
    record.state = primary.state ? clone(primary.state) : null;
    record.mirrorBase = primary.state ? clone(primary.state) : null;
  } else if (!blockedError && record.state) {
    if (primary.state && Sync.equal(primary.state, record.state)) {
      record.mirrorBase = clone(primary.state);
    } else if (!primary.state || Sync.equal(primary.state, record.mirrorBase)) {
      // A known, valid transaction committed before schedule.json was projected.
      const saved = store.saveState(clone(record.state));
      warning = saved.ok ? "" : "已恢复同步记录，兼容日程文件暂未更新。" + (saved.error || "");
      if (saved.ok) record.mirrorBase = clone(record.state);
    } else {
      // An older offline desktop version edited the projection. Merge from its
      // exact base rather than silently choosing the newer-looking file.
      try {
        const base = record.mirrorBase || record.state;
        const merged = Sync.mergeSnapshots(Sync.sharedSnapshot(base), Sync.sharedSnapshot(primary.state), Sync.sharedSnapshot(record.state));
        const saved = commit(Sync.applySnapshot(primary.state, merged.snapshot), null, merged.conflicts, { mirrorBase: primary.state });
        if (!saved.ok) blockedError = saved.error;
      } catch (error) { blockedError = "本机文件与同步记录需要核对。" + error.message; }
    }
  }

  function loadDesktopState() {
    if (blockedError) return store.loadState();
    if (primaryError) return clone(primaryError);
    return result();
  }
  function saveDesktopState(state, baseline) {
    const errors = Core.validateState(state);
    if (errors.length) return { ok: false, error: errors.slice(0, 3).join(" "), code: "INVALID_STATE" };
    if (blockedError) {
      // A damaged sidecar must not lock the independent local editor. Preserve
      // that sidecar unchanged and keep networking disabled until it is fixed.
      const saved = store.saveState(clone(state));
      return saved.ok ? { ok: true, state: clone(state), snapshot: Sync.sharedSnapshot(state), revision: 0, conflicts: [], warning: blockedError } : saved;
    }
    try {
      if (!record.state) return commit(state, null, [], { mirrorBase: null });
      const remote = Sync.sharedSnapshot(record.state);
      const before = baseline && baseline.version === 1 ? Sync.sharedSnapshot(baseline) : baseline || remote;
      const merged = Sync.mergeSnapshots(before, Sync.sharedSnapshot(state), remote);
      return commit(Sync.applySnapshot(state, merged.snapshot), null, merged.conflicts);
    } catch (error) { return failure(error); }
  }
  function replaceDesktopState(state, expectedRevision) {
    const errors = Core.validateState(state);
    if (errors.length) return { ok: false, error: errors.slice(0, 3).join(' ') };
    if (expectedRevision !== undefined && expectedRevision !== record.revision) return { ok: false, error: '日程已更新，请重新核对导入备份。' };
    if (blockedError) return saveDesktopState(state);
    return commit(state, null);
  }
  function syncDevice(deviceId, requestId, request) {
    if (blockedError || primaryError) return { ok: false, code: "SYNC_STORAGE_ERROR", error: blockedError || primaryError.error || "本机日程需要先恢复。" };
    if (!record.state) return { ok: false, code: "NOT_READY", error: "请先在电脑上打开日程，再进行同步。" };
    const device = record.devices.find(item => item.deviceId === deviceId);
    if (!device) return { ok: false, code: "UNPAIRED", error: "这台设备尚未配对或已被移除。" };
    if (!REQUEST_ID.test(requestId) || !request || !Number.isSafeInteger(request.sequence) || request.sequence < 1) return { ok: false, code: "INVALID_SEQUENCE", error: "同步请求编号无效。" };
    try {
      const errors = Sync.validateSnapshot(request.baseline).concat(Sync.validateSnapshot(request.local));
      if (errors.length) return { ok: false, code: "INVALID_STATE", error: errors.slice(0, 3).join(" ") };
      const requestDigest = digest({ sequence: request.sequence, baseline: request.baseline, local: request.local });
      if (request.sequence === device.sequence && requestId === device.lastRequestId && requestDigest === device.lastDigest) {
        return result(device.lastConflicts, { replayed: true, nextSequence: device.sequence + 1 });
      }
      if (request.sequence <= device.sequence) return { ok: false, code: "STALE_REQUEST", error: "这笔同步已过期；手机中的未确认编辑仍需保留后重新合并。", nextSequence: device.sequence + 1 };
      if (requestId === device.lastRequestId) return { ok: false, code: "REQUEST_ID_REUSED", error: "同步请求编号被重复用于不同内容。", nextSequence: device.sequence + 1 };
      if (request.sequence >= Number.MAX_SAFE_INTEGER) return { ok: false, code: "SEQUENCE_LIMIT", error: "设备同步编号已到达上限，请保留备份后重新配对。" };
      const merged = Sync.mergeSnapshots(request.baseline, request.local, Sync.sharedSnapshot(record.state));
      const devices = record.devices.map(item => item.deviceId === deviceId ? {
        ...item, sequence: request.sequence, lastRequestId: requestId, lastDigest: requestDigest,
        lastConflicts: clone(merged.conflicts), lastSeenAt: stamp()
      } : clone(item));
      const saved = commit(Sync.applySnapshot(record.state, merged.snapshot), devices, merged.conflicts);
      if (saved.ok) saved.nextSequence = request.sequence + 1;
      return saved;
    } catch (error) { return failure(error); }
  }
  function addDevice(device) {
    if (blockedError || primaryError) return { ok: false, error: blockedError || primaryError.error, code: "SYNC_STORAGE_ERROR" };
    if (!device || !DEVICE_ID.test(device.deviceId) || !validKey(device.key) ||
      typeof device.deviceName !== "string" || !device.deviceName.trim() || device.deviceName.length > 80) return { ok: false, error: "设备配对信息无效。" };
    if (record.devices.length >= MAX_DEVICES) return { ok: false, error: "最多配对 12 台设备，请先移除不用的设备。" };
    if (record.devices.some(item => item.deviceId === device.deviceId)) return { ok: false, error: "这台设备已经配对。" };
    const next = clone(record);
    next.devices.push({ deviceId: device.deviceId, deviceName: device.deviceName.trim(), key: device.key,
      createdAt: stamp(), lastSeenAt: stamp(), sequence: 0, lastRequestId: null, lastDigest: null, lastConflicts: [] });
    next.updatedAt = stamp();
    try { persistRecord(next); return { ok: true, deviceId: device.deviceId }; }
    catch (error) { return failure(error); }
  }
  function revoke(deviceId) {
    if (blockedError) return { ok: false, error: blockedError };
    if (!DEVICE_ID.test(deviceId)) return { ok: false, error: "设备编号无效。" };
    const next = clone(record); next.devices = next.devices.filter(device => device.deviceId !== deviceId); next.updatedAt = stamp();
    try { persistRecord(next); return { ok: true }; }
    catch (error) { return failure(error); }
  }
  function setEnabled(enabled) {
    if (blockedError || primaryError) return { ok: false, error: blockedError || primaryError.error || "本机日程需要先恢复。" };
    if (typeof enabled !== "boolean") return { ok: false, error: "同步开关无效。" };
    const next = clone(record); next.enabled = enabled; next.updatedAt = stamp();
    try { persistRecord(next); return { ok: true }; }
    catch (error) { return failure(error); }
  }
  function getDevice(deviceId) {
    const device = record.devices.find(item => item.deviceId === deviceId);
    return device ? clone(device) : null;
  }
  function status() {
    return { ok: !blockedError && !primaryError, enabled: record.enabled, serverId: record.serverId, revision: record.revision,
      devices: record.devices.map(({ deviceId, deviceName, createdAt, lastSeenAt }) => ({ deviceId, deviceName, createdAt, lastSeenAt })),
      conflicts: clone(record.conflicts), ...(blockedError || primaryError ? { error: blockedError || primaryError.error } : {}), ...(warning ? { warning } : {}) };
  }
  return Object.freeze({ loadDesktopState, saveDesktopState, replaceDesktopState, syncDevice, addDevice, revoke, setEnabled, getDevice, status,
    paths: Object.freeze({ sync: filename }) });
}

module.exports = { createSyncStore, MAX_RECORD_BYTES, MAX_DEVICES, DEVICE_ID, REQUEST_ID };
