/* 周计划核心：无依赖，时间区间始终采用 [start, end)，单位为分钟。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PlannerCore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DAY_MS = 86400000;
  var DAYS_PER_WEEK = 7;
  var MAX_WEEK = 24;
  var CATEGORIES = ["course", "study", "life", "rest"];
  var EVENT_FIELDS = ["id", "title", "day", "start", "end", "category", "location", "notes", "weeks", "uncertain"];
  var STATE_FIELDS = ["version", "semesterStart", "selectedWeek", "rangeStart", "rangeEnd", "events", "completed", "theme"];
  var LIMITS = Object.freeze({
    maxEvents: 1000,
    maxCompleted: 24000,
    maxIdLength: 120,
    maxTitleLength: 200,
    maxLocationLength: 200,
    maxNotesLength: 3000,
    maxCompletionLength: 160,
    maxSerializedLength: 4 * 1024 * 1024
  });

  function isInteger(value) {
    return typeof value === "number" && Number.isInteger(value);
  }

  function isPlainObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isWeek(value) {
    return isInteger(value) && value >= 1 && value <= MAX_WEEK;
  }

  function parseTime(text) {
    if (typeof text !== "string") return null;
    var match = /^(\d{1,2}):(\d{2})$/.exec(text.trim().replace(/：/g, ":"));
    if (!match) return null;
    var hour = Number(match[1]);
    var minute = Number(match[2]);
    if (minute > 59 || hour > 24 || (hour === 24 && minute !== 0)) return null;
    return hour * 60 + minute;
  }

  function formatTime(minutes) {
    if (!isInteger(minutes) || minutes < 0 || minutes > 1440) return "";
    return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
  }

  function parseWeeks(text) {
    if (typeof text !== "string") throw new TypeError("周次须为文字，例如 1-4,6-16。");
    if (text.length > 500) throw new RangeError("周次文字过长，请使用 1-24 以内的周次。");
    var value = text.trim();
    if (!value) return [];
    value = value.replace(/[，、]/g, ",").replace(/[－—–~～至]/g, "-").replace(/\s+/g, "");
    var found = new Set();
    value.split(",").forEach(function (part) {
      var match = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(part);
      if (!match) throw new Error("周次格式无效，请使用 1-4,6-16 这样的格式。");
      var from = Number(match[1]);
      var to = match[2] === undefined ? from : Number(match[2]);
      if (!isWeek(from) || !isWeek(to)) throw new RangeError("周次必须在第 1 至第 24 周之间。");
      if (from > to) throw new RangeError("周次范围的开始不能晚于结束。");
      for (var week = from; week <= to; week += 1) found.add(week);
    });
    return Array.from(found).sort(function (a, b) { return a - b; });
  }

  function formatWeeks(weeks) {
    if (!Array.isArray(weeks) || weeks.some(function (week) { return !isWeek(week); })) {
      throw new TypeError("周次须为包含 1 至 24 整数的数组。");
    }
    var sorted = Array.from(new Set(weeks)).sort(function (a, b) { return a - b; });
    var groups = [];
    for (var index = 0; index < sorted.length; index += 1) {
      var first = sorted[index];
      var last = first;
      while (index + 1 < sorted.length && sorted[index + 1] === last + 1) {
        index += 1;
        last = sorted[index];
      }
      groups.push(first === last ? String(first) : first + "-" + last);
    }
    return groups.join(",");
  }

  function dateMillis(dateIso) {
    if (typeof dateIso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return null;
    var millis = Date.parse(dateIso + "T00:00:00.000Z");
    if (!Number.isFinite(millis)) return null;
    if (new Date(millis).toISOString().slice(0, 10) !== dateIso) return null;
    return millis;
  }

  function requireDate(dateIso, label) {
    var millis = dateMillis(dateIso);
    if (millis === null) throw new RangeError((label || "日期") + "须为有效的 YYYY-MM-DD 日期。");
    return millis;
  }

  function weekDates(semesterStart, week) {
    var start = requireDate(semesterStart, "学期开始日期");
    if (!isWeek(week)) throw new RangeError("教学周须在第 1 至第 24 周之间。");
    var dates = [];
    for (var day = 0; day < DAYS_PER_WEEK; day += 1) {
      dates.push(new Date(start + ((week - 1) * DAYS_PER_WEEK + day) * DAY_MS).toISOString().slice(0, 10));
    }
    return dates;
  }

  function teachingWeek(dateIso, semesterStart) {
    var date = requireDate(dateIso, "查询日期");
    var start = requireDate(semesterStart, "学期开始日期");
    return Math.floor((date - start) / (DAYS_PER_WEEK * DAY_MS)) + 1;
  }

  function occursInWeek(event, week) {
    return !!(event && isWeek(week) && Array.isArray(event.weeks) && event.weeks.indexOf(week) !== -1);
  }

  function weekEvents(events, week) {
    if (!Array.isArray(events)) return [];
    return events.filter(function (event) { return occursInWeek(event, week); });
  }

  function compareEvents(a, b) {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return b.end - a.end;
    var aId = String(a.id);
    var bId = String(b.id);
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  }

  function hasInterval(event) {
    return !!(event && isInteger(event.day) && event.day >= 1 && event.day <= DAYS_PER_WEEK &&
      isInteger(event.start) && event.start >= 0 && isInteger(event.end) && event.end <= 1440 && event.start < event.end);
  }

  function findConflicts(events, week) {
    var active = weekEvents(events, week).filter(hasInterval);
    var conflicts = [];
    for (var day = 1; day <= DAYS_PER_WEEK; day += 1) {
      var daily = active.filter(function (event) { return event.day === day; }).sort(compareEvents);
      for (var first = 0; first < daily.length; first += 1) {
        for (var second = first + 1; second < daily.length; second += 1) {
          if (daily[second].start >= daily[first].end) break;
          conflicts.push({
            a: daily[first].id,
            b: daily[second].id,
            day: day,
            start: Math.max(daily[first].start, daily[second].start),
            end: Math.min(daily[first].end, daily[second].end)
          });
        }
      }
    }
    return conflicts;
  }

  function requireRange(rangeStart, rangeEnd) {
    if (!isInteger(rangeStart) || !isInteger(rangeEnd) || rangeStart < 0 || rangeEnd > 1440 || rangeStart >= rangeEnd) {
      throw new RangeError("显示范围须在 00:00 至 24:00 之间，结束须晚于开始。");
    }
  }

  function layoutEvents(events, rangeStart, rangeEnd) {
    requireRange(rangeStart, rangeEnd);
    if (!Array.isArray(events)) return [];
    var visible = events.filter(function (event) {
      return hasInterval(event) && event.start < rangeEnd && event.end > rangeStart;
    }).slice().sort(compareEvents);
    var output = [];
    var group = [];
    var groupEnd = -1;
    var laneEnds = [];

    function finishGroup() {
      var count = laneEnds.length;
      group.forEach(function (item) { item.laneCount = count; });
      group = [];
      laneEnds = [];
      groupEnd = -1;
    }

    visible.forEach(function (event) {
      var start = Math.max(event.start, rangeStart);
      var end = Math.min(event.end, rangeEnd);
      if (group.length && start >= groupEnd) finishGroup();
      var lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] > start) lane += 1;
      laneEnds[lane] = end;
      groupEnd = Math.max(groupEnd, end);
      var item = {
        event: event,
        topMinutes: start - rangeStart,
        heightMinutes: end - start,
        lane: lane,
        laneCount: 0
      };
      group.push(item);
      output.push(item);
    });
    finishGroup();
    return output;
  }

  function unionMinutes(intervals) {
    if (!intervals.length) return 0;
    var sorted = intervals.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var start = sorted[0][0];
    var end = sorted[0][1];
    var total = 0;
    for (var index = 1; index < sorted.length; index += 1) {
      if (sorted[index][0] <= end) {
        end = Math.max(end, sorted[index][1]);
      } else {
        total += end - start;
        start = sorted[index][0];
        end = sorted[index][1];
      }
    }
    return total + end - start;
  }

  function summarize(events, week, rangeStart, rangeEnd) {
    requireRange(rangeStart, rangeEnd);
    var active = weekEvents(events, week).filter(function (event) {
      return hasInterval(event) && event.start < rangeEnd && event.end > rangeStart;
    });
    var courseMinutes = 0;
    var plannedMinutes = 0;
    for (var day = 1; day <= DAYS_PER_WEEK; day += 1) {
      var daily = active.filter(function (event) { return event.day === day; });
      var toInterval = function (event) { return [Math.max(event.start, rangeStart), Math.min(event.end, rangeEnd)]; };
      plannedMinutes += unionMinutes(daily.map(toInterval));
      courseMinutes += unionMinutes(daily.filter(function (event) { return event.category === "course"; }).map(toInterval));
    }
    return {
      courseMinutes: courseMinutes,
      plannedMinutes: plannedMinutes,
      freeMinutes: (rangeEnd - rangeStart) * DAYS_PER_WEEK - plannedMinutes,
      conflictCount: findConflicts(active, week).filter(function (conflict) {
        return conflict.start < rangeEnd && conflict.end > rangeStart;
      }).length
    };
  }

  function checkFields(object, allowed, errors, label) {
    var keys = Object.getOwnPropertyNames(object);
    var unknown = keys.filter(function (key) { return allowed.indexOf(key) === -1; });
    if (unknown.length) errors.push(label + "含不支持的字段：" + unknown.slice(0, 5).join("、") + "。");
    var missing = allowed.filter(function (key) { return !Object.prototype.hasOwnProperty.call(object, key); });
    if (missing.length) errors.push(label + "缺少字段：" + missing.join("、") + "。");
    if (Object.getOwnPropertySymbols(object).length) errors.push(label + "不能包含 Symbol 字段。");
  }

  function checkText(value, label, limit, required, errors) {
    if (typeof value !== "string") {
      errors.push(label + "须为文字。");
    } else if (value.length > limit) {
      errors.push(label + "不能超过 " + limit + " 个字符。");
    } else if (required && !value.trim()) {
      errors.push(label + "不能为空。");
    } else if (value.indexOf("\u0000") !== -1) {
      errors.push(label + "不能包含空字符。");
    }
  }

  function validateEvent(event) {
    var errors = [];
    if (!isPlainObject(event)) return ["日程须为普通对象。"];
    checkFields(event, EVENT_FIELDS, errors, "日程");
    if (typeof event.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(event.id)) {
      errors.push("日程 ID 须为 1 至 " + LIMITS.maxIdLength + " 位字母、数字、点、下划线、冒号或短横线。");
    }
    checkText(event.title, "日程名称", LIMITS.maxTitleLength, true, errors);
    if (!isInteger(event.day) || event.day < 1 || event.day > DAYS_PER_WEEK) errors.push("星期须为 1 至 7 的整数（周一至周日）。");
    if (!isInteger(event.start) || event.start < 0 || event.start >= 1440) errors.push("开始时间须为 0 至 1439 的整数分钟。");
    if (!isInteger(event.end) || event.end < 1 || event.end > 1440) errors.push("结束时间须为 1 至 1440 的整数分钟。");
    if (isInteger(event.start) && isInteger(event.end) && event.end <= event.start) errors.push("结束时间须晚于开始时间；跨日安排请拆分填写。");
    if (CATEGORIES.indexOf(event.category) === -1) errors.push("分类须为 course、study、life 或 rest。");
    checkText(event.location, "地点", LIMITS.maxLocationLength, false, errors);
    checkText(event.notes, "备注", LIMITS.maxNotesLength, false, errors);
    if (!Array.isArray(event.weeks)) {
      errors.push("适用周次须为数组。");
    } else {
      if (event.weeks.length < 1 || event.weeks.length > MAX_WEEK) errors.push("适用周次须包含 1 至 24 个周次。");
      if (event.weeks.slice(0, MAX_WEEK + 1).some(function (week) { return !isWeek(week); })) errors.push("每个周次须为 1 至 24 的整数。");
      if (new Set(event.weeks.slice(0, MAX_WEEK + 1)).size !== Math.min(event.weeks.length, MAX_WEEK + 1)) errors.push("适用周次不能重复。");
    }
    if (typeof event.uncertain !== "boolean") errors.push("待核实标记须为布尔值。");
    return errors;
  }

  function validateState(state) {
    var errors = [];
    if (!isPlainObject(state)) return ["备份须为普通 JSON 对象。"];
    checkFields(state, STATE_FIELDS, errors, "备份");
    if (state.version !== 1) errors.push("不支持此备份版本，仅支持版本 1。");
    var semester = dateMillis(state.semesterStart);
    if (semester === null) {
      errors.push("学期开始日期须为有效的 YYYY-MM-DD 日期。");
    } else if (new Date(semester).getUTCDay() !== 1) {
      errors.push("学期开始日期须为第 1 教学周的周一。");
    }
    if (!isWeek(state.selectedWeek)) errors.push("当前教学周须为 1 至 24 的整数。");
    if (!isInteger(state.rangeStart) || state.rangeStart < 0 || state.rangeStart >= 1440 || state.rangeStart % 30 !== 0) {
      errors.push("显示开始时间须为 00:00 至 23:30 内的半小时时刻。");
    }
    if (!isInteger(state.rangeEnd) || state.rangeEnd <= 0 || state.rangeEnd > 1440 || state.rangeEnd % 30 !== 0) {
      errors.push("显示结束时间须为 00:30 至 24:00 内的半小时时刻。");
    }
    if (isInteger(state.rangeStart) && isInteger(state.rangeEnd) && state.rangeStart >= state.rangeEnd) {
      errors.push("显示结束时间须晚于显示开始时间。");
    }
    if (!Array.isArray(state.events)) {
      errors.push("日程列表须为数组。");
    } else {
      if (state.events.length > LIMITS.maxEvents) errors.push("日程总数不能超过 " + LIMITS.maxEvents + " 条。");
      var ids = new Set();
      state.events.slice(0, LIMITS.maxEvents).forEach(function (event, index) {
        validateEvent(event).forEach(function (error) { errors.push("第 " + (index + 1) + " 条日程：" + error); });
        if (event && typeof event.id === "string") {
          if (ids.has(event.id)) errors.push("日程 ID 重复：" + event.id.slice(0, LIMITS.maxIdLength) + "。");
          ids.add(event.id);
        }
      });
    }
    if (!Array.isArray(state.completed)) {
      errors.push("完成记录须为文字数组。");
    } else {
      if (state.completed.length > LIMITS.maxCompleted) errors.push("完成记录不能超过 " + LIMITS.maxCompleted + " 条。");
      var completed = new Set();
      state.completed.slice(0, LIMITS.maxCompleted).forEach(function (key) {
        if (typeof key !== "string" || !key.trim() || key.length > LIMITS.maxCompletionLength || /[\u0000-\u001f\u007f]/.test(key)) {
          errors.push("完成记录须为 1 至 " + LIMITS.maxCompletionLength + " 个字符的有效文字。");
        } else if (completed.has(key)) {
          errors.push("完成记录不能重复。");
        }
        completed.add(key);
      });
    }
    if (state.theme !== "light" && state.theme !== "dark") errors.push("主题须为 light 或 dark。");
    if (!errors.length) {
      try {
        if (JSON.stringify(state).length > LIMITS.maxSerializedLength) errors.push("备份数据过大，请控制在 4 MB 字符以内。");
      } catch (error) {
        errors.push("备份须为可序列化的 JSON 数据。");
      }
    }
    return errors;
  }

  function csvCell(value) {
    var text = String(value);
    // CSV 引号负责保留换行、逗号和引号；前导单引号防止表格软件把名称当作公式。
    if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function gridCsv(state) {
    var errors = validateState(state);
    if (errors.length) throw new Error("无法导出日程：" + errors.slice(0, 3).join(" "));
    var dates = weekDates(state.semesterStart, state.selectedWeek);
    var names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    var rows = [["时间"].concat(names.map(function (name, index) { return name + "（" + dates[index] + "）"; }))];
    var active = weekEvents(state.events, state.selectedWeek).slice().sort(function (a, b) { return a.day - b.day || compareEvents(a, b); });
    for (var start = state.rangeStart; start < state.rangeEnd; start += 30) {
      var end = Math.min(start + 30, state.rangeEnd);
      var row = [formatTime(start) + "–" + formatTime(end)];
      for (var day = 1; day <= DAYS_PER_WEEK; day += 1) {
        row.push(active.filter(function (event) {
          return event.day === day && event.start < end && event.end > start;
        }).map(function (event) {
          return event.title + "（" + formatTime(event.start) + "–" + formatTime(event.end) + "）" + (event.location ? " · " + event.location : "");
        }).join("\n"));
      }
      rows.push(row);
    }
    return "\uFEFF" + rows.map(function (row) { return row.map(csvCell).join(","); }).join("\r\n") + "\r\n";
  }

  return Object.freeze({
    DAYS_PER_WEEK: DAYS_PER_WEEK,
    LIMITS: LIMITS,
    parseTime: parseTime,
    formatTime: formatTime,
    parseWeeks: parseWeeks,
    formatWeeks: formatWeeks,
    weekDates: weekDates,
    teachingWeek: teachingWeek,
    occursInWeek: occursInWeek,
    weekEvents: weekEvents,
    findConflicts: findConflicts,
    layoutEvents: layoutEvents,
    summarize: summarize,
    validateEvent: validateEvent,
    validateState: validateState,
    gridCsv: gridCsv
  });
});
