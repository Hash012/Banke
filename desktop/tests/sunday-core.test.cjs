"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../renderer/core.js");
const nativeCore = require("../lib/core.cjs");

function event(overrides = {}) {
  return {
    id: "sunday", title: "周日安排", day: 7, start: 1180, end: 1230,
    category: "course", location: "", notes: "", weeks: [7], uncertain: false,
    ...overrides
  };
}

function state(overrides = {}) {
  return {
    version: 1, semesterStart: "2026-09-07", selectedWeek: 7,
    rangeStart: 960, rangeEnd: 1440, events: [], completed: [], theme: "light",
    ...overrides
  };
}

// Read quoted CSV independently, including comma, quote and newline content.
function readCsv(csv) {
  const text = csv.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\r" && text[index + 1] === "\n") {
      row.push(field); rows.push(row); row = []; field = ""; index += 1;
    } else field += character;
  }
  assert.equal(quoted, false, "CSV quotation must close");
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

test("Sunday validates in renderer and native storage, while existing six-day backups remain valid", () => {
  const legacy = state({
    selectedWeek: 6,
    events: Array.from({ length: 6 }, (_, index) => event({
      id: "legacy-" + index, day: index + 1, weeks: [6], end: 1440
    })),
    completed: ["legacy-0:6"]
  });
  for (const implementation of [core, nativeCore]) {
    assert.deepEqual(implementation.validateEvent(event({ end: 1440 })), []);
    assert.deepEqual(implementation.validateState(state({ events: [event()], completed: ["sunday:7"] })), []);
    assert.deepEqual(implementation.validateState(legacy), []);
    for (const day of [0, 8, 7.5, "7"]) {
      assert.match(implementation.validateEvent(event({ day })).join(" "), /星期须为 1 至 7/);
    }
  }
});

test("the seventh day stays in its teaching week across Monday, year and leap-day boundaries", () => {
  assert.deepEqual(core.weekDates("2026-09-07", 7), [
    "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22",
    "2026-10-23", "2026-10-24", "2026-10-25"
  ]);
  assert.equal(core.teachingWeek("2026-10-25", "2026-09-07"), 7);
  assert.equal(core.teachingWeek("2026-10-26", "2026-09-07"), 8);
  assert.equal(core.weekDates("2026-12-28", 1)[6], "2027-01-03");
  assert.equal(core.weekDates("2026-12-28", 2)[0], "2027-01-04");
  assert.equal(core.weekDates("2028-02-28", 1)[6], "2028-03-05");
  assert.equal(core.weekDates("2028-02-28", 2)[0], "2028-03-06");
});

test("Sunday conflicts retain exact-minute and adjacent-interval boundaries without leaking from other weeks or days", () => {
  const events = [
    event({ id: "course" }),
    event({ id: "study", start: 1200, end: 1245, category: "study" }),
    event({ id: "adjacent", start: 1245, end: 1275 }),
    event({ id: "monday", day: 1 }),
    event({ id: "next-week", weeks: [8] }),
    event({ id: "invalid-day", day: 8 })
  ];
  assert.deepEqual(core.findConflicts(events, 7), [
    { a: "course", b: "study", day: 7, start: 1200, end: 1230 }
  ]);
  assert.deepEqual(core.findConflicts(events, 8), []);
  assert.deepEqual(core.weekEvents(events, 8).map(item => item.id), ["next-week"]);
});

test("Sunday cards remain visible with precise range clipping through midnight", () => {
  const result = core.layoutEvents([
    event({ id: "early", start: 1180, end: 1275 }),
    event({ id: "midnight", start: 1410, end: 1440 }),
    event({ id: "invalid", day: 8, start: 1410, end: 1440 })
  ], 1200, 1440);
  assert.deepEqual(result.map(item => [item.event.id, item.topMinutes, item.heightMinutes]), [
    ["early", 0, 75], ["midnight", 210, 30]
  ]);
  assert.equal(result[0].event.start, 1180);
  assert.equal(result[1].event.end, 1440);
});

test("summary counts all seven days and unions overlapping Sunday intervals only once", () => {
  assert.deepEqual(core.summarize([], 7, 240, 720), {
    courseMinutes: 0, plannedMinutes: 0, freeMinutes: 3360, conflictCount: 0
  });
  const events = [
    event({ id: "sun-a", start: 940, end: 1000 }),
    event({ id: "sun-b", start: 980, end: 1040 }),
    event({ id: "sun-study", start: 1020, end: 1080, category: "study" }),
    event({ id: "mon", day: 1, start: 960, end: 1020 }),
    event({ id: "other-week", start: 960, end: 1440, weeks: [8] }),
    event({ id: "invalid", day: 8, start: 960, end: 1440 })
  ];
  assert.deepEqual(core.summarize(events, 7, 960, 1440), {
    courseMinutes: 140, plannedMinutes: 180, freeMinutes: 3180, conflictCount: 2
  });
});

test("CSV has a dated seventh-day column, preserves Sunday text and ends at 24:00", () => {
  const title = '=AI,"编程"\n组会';
  const csv = core.gridCsv(state({
    rangeStart: 1380,
    events: [
      event({ title, start: 1410, end: 1440, location: '教室 "A",三层' }),
      event({ id: "next-week", title: "下一周不可出现", start: 1410, end: 1440, weeks: [8] })
    ]
  }));
  const rows = readCsv(csv);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.length === 8), "one time column plus seven days");
  assert.equal(rows[0][1], "周一（2026-10-19）");
  assert.equal(rows[0][7], "周日（2026-10-25）");
  assert.equal(rows[1][7], "");
  assert.equal(rows[2][0], "23:30–24:00");
  assert.equal(rows[2][7], "'" + title + '（23:30–24:00） · 教室 "A",三层');
  assert.equal(csv.includes("下一周不可出现"), false);
});
