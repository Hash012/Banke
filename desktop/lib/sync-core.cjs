/* Shared, dependency-free three-way merge. A baseline is retained until its
 * corresponding local changes have been acknowledged; absence therefore remains
 * a deletion, even after a device has spent a long time offline. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.cjs"));
  else root.BankeSyncCore = factory(root.PlannerCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  "use strict";
  const SHARED_KEYS = ["semesterStart", "events", "completed"];
  const clone = value => JSON.parse(JSON.stringify(value));
  function stableStringify(value) {
    if (value === undefined) return "undefined";
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stableStringify(value[key])).join(",") + "}";
  }
  const equal = (left, right) => stableStringify(left) === stableStringify(right);
  function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(snapshot)) ||
      Object.keys(snapshot).length !== SHARED_KEYS.length || Object.keys(snapshot).some(key => !SHARED_KEYS.includes(key))) {
      return ["同步快照必须只包含学期开始日期、安排和完成记录。"];
    }
    return Core.validateState({ version: 1, selectedWeek: 1, rangeStart: 960, rangeEnd: 1440, theme: "light",
      semesterStart: snapshot.semesterStart, events: snapshot.events, completed: snapshot.completed });
  }
  function requireSnapshot(snapshot) {
    const errors = validateSnapshot(snapshot);
    if (errors.length) throw new TypeError(errors.slice(0, 3).join(" "));
    return snapshot;
  }
  function sharedSnapshot(state) {
    const errors = Core.validateState(state);
    if (errors.length) throw new TypeError(errors.slice(0, 3).join(" "));
    return clone({ semesterStart: state.semesterStart, events: state.events, completed: state.completed });
  }
  function applySnapshot(state, snapshot) {
    requireSnapshot(snapshot);
    const result = Object.assign({}, clone(state), clone(snapshot));
    const errors = Core.validateState(result);
    if (errors.length) throw new TypeError(errors.slice(0, 3).join(" "));
    return result;
  }
  // This identifier hash is not used for authentication. Collision handling
  // below also compares the entire event, so it cannot silently overwrite one.
  function identifierHash(text) {
    let first = 2166136261, second = 2246822507;
    for (let index = 0; index < text.length; index++) {
      first = Math.imul(first ^ text.charCodeAt(index), 16777619);
      second = Math.imul(second ^ text.charCodeAt(index), 3266489909);
    }
    return (first >>> 0).toString(16).padStart(8, "0") + (second >>> 0).toString(16).padStart(8, "0");
  }
  function completionParts(key) {
    const split = key.lastIndexOf(":");
    if (split < 1) return null;
    const week = Number(key.slice(split + 1));
    return Number.isInteger(week) && week >= 1 && week <= 24 ? { id: key.slice(0, split), week } : null;
  }
  function mergeSnapshots(baseline, local, remote, options) {
    [baseline, local, remote].forEach(requireSnapshot);
    options = options || {};
    const conflicts = [];
    let semesterStart;
    if (local.semesterStart === remote.semesterStart || local.semesterStart === baseline.semesterStart) semesterStart = remote.semesterStart;
    else if (remote.semesterStart === baseline.semesterStart) semesterStart = local.semesterStart;
    else {
      const error = new Error("两台设备同时修改了学期开始日期，请先统一日期；两端的原始安排仍保留。") ;
      error.code = "SEMESTER_CONFLICT";
      error.conflicts = [{ kind: "semester", localValue: local.semesterStart, remoteValue: remote.semesterStart, baselineValue: baseline.semesterStart }];
      throw error;
    }
    const maps = [baseline, local, remote].map(snapshot => new Map(snapshot.events.map(event => [event.id, event])));
    const [baseMap, localMap, remoteMap] = maps;
    const ids = Array.from(new Set(remote.events.concat(local.events, baseline.events).map(event => event.id)));
    const events = [], copies = [], originalSource = new Map(), assigned = new Map();
    // Reserve every existing ID before manufacturing conflict-copy IDs.
    const reserved = new Map(remote.events.concat(local.events, baseline.events).map(event => [event.id, event]));
    function keep(event) { if (event) { const copied = clone(event); events.push(copied); assigned.set(copied.id, copied); } }
    function makeCopy(event, side, originalId, kind) {
      const digest = identifierHash(stableStringify({ originalId, event }));
      const prefix = "conflict-" + digest;
      let copyId = prefix, suffix = 0;
      const copied = clone(event); copied.id = copyId;
      while (reserved.has(copyId) || assigned.has(copyId)) {
        const existing = assigned.get(copyId) || reserved.get(copyId);
        copied.id = copyId;
        if (equal(existing, copied)) break;
        copyId = prefix + "-" + (++suffix);
      }
      copied.id = copyId;
      if (!assigned.has(copyId) && !remoteMap.has(copyId) && !localMap.has(copyId)) keep(copied);
      reserved.set(copyId, copied);
      copies.push({ originalId, copyId, side });
      conflicts.push({ kind, originalId, copyId, title: event.title, keptBoth: true });
    }
    for (const id of ids) {
      const before = baseMap.get(id), left = localMap.get(id), right = remoteMap.get(id);
      if (equal(left, right) || equal(left, before)) { keep(right); continue; }
      if (equal(right, before)) { keep(left); continue; }
      if (!left) {
        // The deletion keeps its original ID deleted. The concurrent edit is
        // kept under a fresh ID so old offline baselines cannot resurrect it.
        makeCopy(right, "remote", id, "delete-edit"); originalSource.set(id, null);
      } else if (!right) {
        makeCopy(left, "local", id, "edit-delete"); originalSource.set(id, null);
      } else {
        keep(right); originalSource.set(id, "remote");
        makeCopy(left, "local", id, before ? "edit-edit" : "add-add");
      }
    }
    const completeSets = [baseline, local, remote].map(snapshot => new Set(snapshot.completed));
    const [baseComplete, localComplete, remoteComplete] = completeSets;
    const completed = new Set();
    const keys = Array.from(new Set(remote.completed.concat(local.completed, baseline.completed)));
    for (const key of keys) {
      const before = baseComplete.has(key), left = localComplete.has(key), right = remoteComplete.has(key);
      if (left === right ? left : left === before ? right : left) completed.add(key);
    }
    for (const [id, side] of originalSource) {
      for (const key of Array.from(completed)) { const parts = completionParts(key); if (parts && parts.id === id) completed.delete(key); }
      if (side) for (const key of (side === "local" ? local.completed : remote.completed)) {
        const parts = completionParts(key); if (parts && parts.id === id) completed.add(key);
      }
    }
    for (const copy of copies) {
      for (const key of (copy.side === "local" ? local.completed : remote.completed)) {
        const parts = completionParts(key);
        if (parts && parts.id === copy.originalId) completed.add(copy.copyId + ":" + parts.week);
      }
    }
    const knownIds = new Set(ids);
    for (const key of Array.from(completed)) {
      const parts = completionParts(key);
      if (!parts) continue;
      const event = assigned.get(parts.id);
      if ((!event && knownIds.has(parts.id)) || (event && !event.weeks.includes(parts.week))) completed.delete(key);
    }
    const snapshot = { semesterStart, events, completed: Array.from(completed) };
    requireSnapshot(snapshot); // Reject the whole merge on limits; never truncate.
    return { snapshot, conflicts };
  }
  return Object.freeze({ sharedSnapshot, extractSnapshot: sharedSnapshot, validateSnapshot, applySnapshot, mergeSnapshots, stableStringify, equal });
});
