/* Mobile editing operations share the exact desktop state schema and validator. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.BankeMobileModel = factory(root.PlannerCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";
  const fields = ["id", "title", "day", "start", "end", "category", "location", "notes", "weeks", "uncertain"];
  const clone = value => JSON.parse(JSON.stringify(value));
  function checked(state) {
    const errors = C.validateState(state);
    if (errors.length) throw new Error(errors.slice(0, 3).join(" "));
    return state;
  }
  function equalEvent(a, b) {
    return !!a && !!b && fields.every(key => JSON.stringify(a[key]) === JSON.stringify(b[key]));
  }
  function findEditable(state, id, expected) {
    const event = state.events.find(item => item.id === id);
    if (!event) throw new Error("这条安排已在另一端删除。请关闭编辑面板，查看最新日程。");
    if (expected && !equalEvent(event, expected)) throw new Error("这条安排已在另一端更新。请关闭后重新打开，再进行修改；当前输入尚未覆盖同步内容。");
    return event;
  }
  function completionBelongs(key, id) { return key.slice(0, key.lastIndexOf(":")) === id; }
  function uniqueId(state, create) {
    for (let count = 0; count < 8; count += 1) {
      const id = create();
      if (typeof id === "string" && !state.events.some(item => item.id === id)) return id;
    }
    throw new Error("暂时无法生成日程编号，请重试。");
  }
  function upsert(state, draft, options) {
    checked(state); options = options || {};
    const next = clone(state);
    const old = options.editingId ? findEditable(next, options.editingId, options.expectedEvent) : null;
    const event = clone(draft);
    const week = options.week || state.selectedWeek;
    const createId = options.createId || (() => "m-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12));
    if (old) event.id = old.id;
    else event.id = uniqueId(next, createId);
    if (old && options.scope === "this") {
      if (!old.weeks.includes(week)) throw new Error("这条安排不在选中的教学周。");
      event.weeks = [week];
    }
    const errors = C.validateEvent(event);
    if (errors.length) throw new Error(errors.slice(0, 3).join(" "));
    if (old && options.scope === "this" && old.weeks.length > 1) {
      old.weeks = old.weeks.filter(item => item !== week);
      event.id = uniqueId(next, createId);
      next.events.push(event);
      const oldKey = old.id + ":" + week;
      if (next.completed.includes(oldKey)) {
        next.completed = next.completed.filter(key => key !== oldKey);
        next.completed.push(event.id + ":" + week);
      }
    } else if (old) {
      next.events[next.events.findIndex(item => item.id === old.id)] = event;
      next.completed = next.completed.filter(key => !completionBelongs(key, old.id) || event.weeks.includes(Number(key.slice(key.lastIndexOf(":") + 1))));
    } else next.events.push(event);
    return checked(next);
  }
  function remove(state, id, options) {
    checked(state); options = options || {};
    const next = clone(state);
    const event = findEditable(next, id, options.expectedEvent);
    const week = options.week || state.selectedWeek;
    if (options.scope === "this") {
      if (!event.weeks.includes(week)) throw new Error("这条安排不在选中的教学周。");
      event.weeks = event.weeks.filter(item => item !== week);
      next.completed = next.completed.filter(key => key !== id + ":" + week);
      if (!event.weeks.length) next.events = next.events.filter(item => item.id !== id);
    } else {
      next.events = next.events.filter(item => item.id !== id);
      next.completed = next.completed.filter(key => !completionBelongs(key, id));
    }
    return checked(next);
  }
  function toggleCompleted(state, id, week) {
    checked(state);
    const event = findEditable(state, id);
    if (!event.weeks.includes(week)) throw new Error("这条安排不在选中的教学周。");
    const next = clone(state), key = id + ":" + week;
    next.completed = next.completed.includes(key) ? next.completed.filter(item => item !== key) : next.completed.concat(key);
    return checked(next);
  }
  function settings(state, patch) {
    const next = clone(checked(state));
    for (const key of ["semesterStart", "selectedWeek", "rangeStart", "rangeEnd", "theme"]) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) next[key] = patch[key];
    }
    return checked(next);
  }
  function conflicts(state, draft, editingId) {
    if (C.validateEvent(draft).length) return [];
    return state.events.filter(event => event.id !== editingId && event.day === draft.day && event.start < draft.end && event.end > draft.start && event.weeks.some(week => draft.weeks.includes(week)));
  }
  return Object.freeze({ clone, checked, equalEvent, upsert, remove, toggleCompleted, settings, conflicts });
});
