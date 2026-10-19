"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createDesktopPreferences, rightHalfBounds, clampWindowBounds } = require("../lib/desktop-preferences.cjs");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(__dirname, "desktop-preferences-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function preferences(overrides = {}) {
  return { version: 1, mode: "desktop", displayId: null, normalBounds: null, ...overrides };
}
function failure(code = "EACCES") {
  const error = new Error("Injected settings I/O failure"); error.code = code; return error;
}

test("first load uses safe ordinary-window defaults without creating files; save writes only the separate preference file", t => {
  const parent = fixture(t), directory = path.join(parent, "app-data");
  const store = createDesktopPreferences({ directory });
  assert.equal(store.path, path.join(directory, "window-preferences.json"));
  const first = store.load();
  assert.deepEqual(first, { ok: true, state: preferences({ mode: "window" }) });
  first.state.mode = "desktop";
  assert.deepEqual(store.load(), { ok: true, state: preferences({ mode: "window" }) });
  assert.equal(fs.existsSync(directory), false, "a read does not create the data folder");
  assert.deepEqual(store.save(preferences()), { ok: true });
  assert.deepEqual(fs.readdirSync(directory), ["window-preferences.json"]);

  const schedule = Buffer.from('{"userSchedule":"must remain byte-for-byte"}\n');
  fs.writeFileSync(path.join(directory, "schedule.json"), schedule);
  const next = preferences({ mode: "window", displayId: -10, normalBounds: { x: -1500, y: -40, width: 1000, height: 700 } });
  assert.equal(store.save(next).ok, true);
  assert.deepEqual(store.load(), { ok: true, state: next });
  assert.deepEqual(fs.readFileSync(path.join(directory, "schedule.json")), schedule);
  assert.deepEqual(fs.readdirSync(directory).sort(), ["schedule.json", "window-preferences.json"]);
});

test("relative or NUL paths are rejected and a file used as the settings directory is untouched", t => {
  for (const directory of ["relative", "", "../elsewhere", "/invalid\0path", null]) {
    assert.throws(() => createDesktopPreferences({ directory }), TypeError);
  }
  const directory = path.join(fixture(t), "existing-file");
  fs.writeFileSync(directory, "keep this file");
  const store = createDesktopPreferences({ directory });
  assert.equal(store.load().ok, false);
  assert.equal(store.save(preferences()).ok, false);
  assert.equal(fs.readFileSync(directory, "utf8"), "keep this file");
});

test("schema rejects unknown fields, unsafe numbers and malformed rectangles before any write", t => {
  const directory = fixture(t), store = createDesktopPreferences({ directory });
  assert.equal(store.save(preferences()).ok, true);
  const original = fs.readFileSync(store.path);
  const values = [
    null, [], {}, preferences({ version: 2 }), preferences({ mode: "always-on-top" }),
    preferences({ displayId: "1" }), preferences({ displayId: Number.MAX_SAFE_INTEGER + 1 }),
    preferences({ displayId: 1.5 }), preferences({ path: "schedule.json" }),
    preferences({ normalBounds: { x: 0, y: 0, width: 840, height: 640, extra: true } }),
    preferences({ normalBounds: { x: 0, y: 0, width: 0, height: 640 } }),
    preferences({ normalBounds: { x: 0, y: 0, width: 840, height: -1 } }),
    preferences({ normalBounds: { x: 0.5, y: 0, width: 840, height: 640 } }),
    preferences({ normalBounds: { x: Infinity, y: 0, width: 840, height: 640 } }),
    preferences({ normalBounds: { x: 0, y: 0, width: Number.MAX_SAFE_INTEGER + 1, height: 640 } })
  ];
  const accessor = preferences();
  Object.defineProperty(accessor, "mode", { enumerable: true, get() { throw new Error("Must not execute getters"); } });
  values.push(accessor);
  const symbol = preferences(); symbol[Symbol("hidden")] = true; values.push(symbol);
  for (const value of values) {
    assert.equal(store.save(value).ok, false);
    assert.deepEqual(fs.readFileSync(store.path), original);
  }
});

test("malformed, invalid UTF-8, oversized and schema-invalid existing settings survive load and fallback save", t => {
  const directory = fixture(t), store = createDesktopPreferences({ directory });
  const bodies = [
    Buffer.from('{"version":1,broken'), Buffer.from([0xff, 0xfe, 0x7b]),
    Buffer.from(JSON.stringify(preferences({ mode: "unexpected" }))),
    Buffer.alloc(16 * 1024 + 1, 0x20)
  ];
  for (const original of bodies) {
    fs.writeFileSync(store.path, original);
    const result = store.load();
    assert.equal(result.ok, false); assert.equal(result.state, undefined);
    assert.equal(store.save(preferences()).ok, false);
    assert.deepEqual(fs.readFileSync(store.path), original);
  }
  const serialized = JSON.stringify(preferences());
  fs.writeFileSync(store.path, serialized + " ".repeat(16 * 1024 - Buffer.byteLength(serialized)));
  assert.equal(store.load().ok, true, "exactly 16 KiB of valid UTF-8 JSON is allowed");
});

test("directories and symlinks at the preference path are never followed or replaced", t => {
  const directory = fixture(t), store = createDesktopPreferences({ directory });
  fs.mkdirSync(store.path);
  assert.equal(store.load().ok, false); assert.equal(store.save(preferences()).ok, false);
  assert.equal(fs.lstatSync(store.path).isDirectory(), true);
  fs.rmdirSync(store.path);
  const target = path.join(directory, "schedule.json"); fs.writeFileSync(target, "original schedule");
  try { fs.symlinkSync(target, store.path); }
  catch (error) { if (["EPERM", "EACCES"].includes(error.code)) { t.skip("Symlink creation unavailable on this test host"); return; } throw error; }
  assert.equal(store.load().ok, false); assert.equal(store.save(preferences()).ok, false);
  assert.equal(fs.lstatSync(store.path).isSymbolicLink(), true);
  assert.equal(fs.readFileSync(target, "utf8"), "original schedule");
});

test("a symlink used as the settings directory is refused without writing to its target", t => {
  const parent = fixture(t), actual = path.join(parent, "actual"), directory = path.join(parent, "linked");
  fs.mkdirSync(actual);
  try { fs.symlinkSync(actual, directory, "junction"); }
  catch (error) { if (["EPERM", "EACCES"].includes(error.code)) { t.skip("Directory symlinks unavailable on this test host"); return; } throw error; }
  const store = createDesktopPreferences({ directory });
  assert.equal(store.load().ok, false); assert.equal(store.save(preferences()).ok, false);
  assert.deepEqual(fs.readdirSync(actual), []);
});

test("write, flush and rename failures preserve the old settings and schedule without leftover temporaries", t => {
  const directory = fixture(t), store = createDesktopPreferences({ directory });
  store.save(preferences());
  const original = fs.readFileSync(store.path);
  const schedulePath = path.join(directory, "schedule.json"), schedule = "untouched schedule bytes";
  fs.writeFileSync(schedulePath, schedule);
  for (const operation of ["writeFileSync", "fsyncSync", "renameSync"]) {
    const faultyFs = { ...fs, [operation]() { throw failure(operation === "writeFileSync" ? "ENOSPC" : "EACCES"); } };
    const failing = createDesktopPreferences({ directory, fs: faultyFs });
    assert.equal(failing.save(preferences({ mode: "window" })).ok, false, operation);
    assert.deepEqual(fs.readFileSync(store.path), original);
    assert.equal(fs.readFileSync(schedulePath, "utf8"), schedule);
    assert.deepEqual(fs.readdirSync(directory).sort(), ["schedule.json", "window-preferences.json"]);
  }
});

test("read errors do not turn into a missing-file default or permit replacing unreadable settings", t => {
  const directory = fixture(t), store = createDesktopPreferences({ directory }); store.save(preferences());
  const original = fs.readFileSync(store.path);
  const faulty = createDesktopPreferences({ directory, fs: { ...fs, readFileSync() { throw failure(); } } });
  assert.equal(faulty.load().ok, false);
  assert.equal(faulty.save(preferences({ mode: "window" })).ok, false);
  assert.deepEqual(fs.readFileSync(store.path), original);
});

test("right half preserves every odd DIP and uses work area coordinates without multiplying DPI scale", () => {
  assert.deepEqual(rightHalfBounds({ x: 0, y: 0, width: 1920, height: 1040 }), { x: 960, y: 0, width: 960, height: 1040 });
  assert.deepEqual(rightHalfBounds({ x: -137, y: -40, width: 137, height: 801 }), { x: -69, y: -40, width: 69, height: 801 });
  assert.deepEqual(rightHalfBounds({ x: -1365, y: 24, width: 1365, height: 900, scaleFactor: 1.5 }), { x: -683, y: 24, width: 683, height: 900 });
  assert.deepEqual(rightHalfBounds({ x: 20, y: 10, width: 1, height: 1 }), { x: 20, y: 10, width: 1, height: 1 });
});

test("window bounds restore within a negative-coordinate monitor, grow to minimum, and recover off-screen positions", () => {
  const area = { x: -1920, y: -120, width: 1920, height: 1080 };
  const existing = { x: -1500, y: 30, width: 1000, height: 700 };
  assert.deepEqual(clampWindowBounds(existing, area), existing);
  assert.deepEqual(clampWindowBounds({ x: -5000, y: -9000, width: 400, height: 300 }, area), { x: -1920, y: -120, width: 840, height: 640 });
  assert.deepEqual(clampWindowBounds({ x: 3000, y: 3000, width: 840, height: 640 }, area), { x: -840, y: 320, width: 840, height: 640 });
  assert.deepEqual(clampWindowBounds({ x: 20, y: 20, width: 4000, height: 3000 }, area), area);
});

test("window minimum adapts to small screens and missing bounds center the normal 1440 by 940 DIP window", () => {
  const small = { x: 1500, y: -300, width: 700, height: 500 };
  assert.deepEqual(clampWindowBounds({ x: 0, y: 0, width: 100, height: 100 }, small), small);
  assert.deepEqual(clampWindowBounds(null, { x: 0, y: 40, width: 1920, height: 1040 }), { x: 240, y: 90, width: 1440, height: 940 });
  assert.deepEqual(clampWindowBounds(null, { x: 0, y: 40, width: 1280, height: 760, scaleFactor: 2 }), { x: 0, y: 40, width: 1280, height: 760 });
});

test("invalid work areas are rejected, and invalid saved bounds fall back to a usable centered window", () => {
  for (const area of [null, {}, { x: 0, y: 0, width: 0, height: 800 }, { x: 0, y: 0, width: 1000.5, height: 800 }, { x: 0, y: Infinity, width: 1000, height: 800 }]) {
    assert.throws(() => rightHalfBounds(area), TypeError);
    assert.throws(() => clampWindowBounds(null, area), TypeError);
  }
  const area = { x: 0, y: 0, width: 1920, height: 1080 };
  assert.deepEqual(clampWindowBounds({ x: NaN, y: 0, width: 900, height: 700 }, area), clampWindowBounds(null, area));
});
