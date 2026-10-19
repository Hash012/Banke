"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { pathToFileURL } = require("node:url");
const { createRequire } = require("node:module");
const core = require("../lib/core.cjs");
const { MAX_PAYLOAD_BYTES, createStateStore, atomicWriteFileSync } = require("../lib/state-store.cjs");
const host = require("../main.cjs");

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(__dirname, "native-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function state(title = "第一版") {
  return { version: 1, semesterStart: "2026-09-07", selectedWeek: 6, rangeStart: 960, rangeEnd: 1440,
    events: [{ id: "a", title, day: 1, start: 1180, end: 1440, category: "study", location: "", notes: "", weeks: [6, 7], uncertain: false }], completed: [], theme: "light" };
}
function setup(t) { const directory = fixture(t); return { directory, store: createStateStore({ directory }) }; }
function fail(code = "EACCES") { const error = new Error("Injected I/O failure"); error.code = code; return error; }
function contents(filename) { return fs.readFileSync(filename, "utf8"); }

test("fresh store loads null; two successful saves retain the exact previous valid file", t => {
  const { store, directory } = setup(t);
  assert.deepEqual(store.loadState(), { ok: true, state: null });
  assert.equal(store.saveState(state()).ok, true);
  const first = contents(store.paths.state);
  assert.equal(store.saveState(state("第二版")).ok, true);
  assert.equal(contents(store.paths.previous), first);
  assert.deepEqual(store.loadState(), { ok: true, state: state("第二版") });
  assert.equal(store.saveState(state("第二版")).ok, true);
  assert.equal(contents(store.paths.previous), first, "identical saves must not consume the recovery point");
  assert.equal(fs.readdirSync(directory).some(name => name.endsWith(".tmp")), false);
});

test("invalid state cannot overwrite the current or previous file", t => {
  const { store } = setup(t); store.saveState(state()); store.saveState(state("第二版"));
  const current = contents(store.paths.state), previous = contents(store.paths.previous);
  assert.equal(store.saveState({ ...state(), injectedPath: "elsewhere" }).ok, false);
  assert.equal(store.saveState({ ...state(), selectedWeek: 25 }).ok, false);
  assert.equal(contents(store.paths.state), current); assert.equal(contents(store.paths.previous), previous);
});

test("corrupt primary is preserved byte-for-byte before a valid replacement; previous stays valid", t => {
  const { store, directory } = setup(t); store.saveState(state()); store.saveState(state("第二版"));
  const previous = contents(store.paths.previous), broken = '{"version":1,损坏的原内容';
  fs.writeFileSync(store.paths.state, broken);
  assert.equal(store.loadState().ok, false); assert.equal(store.loadState().raw, broken);
  assert.equal(contents(store.paths.state), broken);
  assert.equal(store.saveState(state("恢复版")).ok, true);
  const archived = fs.readdirSync(directory).filter(name => name.startsWith("schedule.corrupt-"));
  assert.equal(archived.length, 1); assert.equal(contents(path.join(directory, archived[0])), broken);
  assert.equal(contents(store.paths.previous), previous);
  assert.deepEqual(store.loadState().state, state("恢复版"));
});

test("invalid UTF-8 is archived as original bytes without lossy rewriting", t => {
  const { store, directory } = setup(t); const bytes = Buffer.from([0xff, 0xfe, 0x7b, 0x00, 0x7d]);
  fs.writeFileSync(store.paths.state, bytes);
  assert.equal(store.loadState().ok, false); assert.equal(store.saveState(state()).ok, true);
  const archived = fs.readdirSync(directory).find(name => name.startsWith("schedule.corrupt-"));
  assert.deepEqual(fs.readFileSync(path.join(directory, archived)), bytes);
});

test("temporary write failure leaves both existing versions untouched", t => {
  const { store, directory } = setup(t); store.saveState(state()); store.saveState(state("第二版"));
  const before = contents(store.paths.state), previous = contents(store.paths.previous);
  const faulty = createStateStore({ directory, fs: { ...fs, writeFileSync() { throw fail("ENOSPC"); } } });
  assert.equal(faulty.saveState(state("第三版")).ok, false);
  assert.equal(contents(store.paths.state), before); assert.equal(contents(store.paths.previous), previous);
  assert.equal(fs.readdirSync(directory).some(name => name.endsWith(".tmp")), false);
});

test("failed final rename rolls back the previous file and never unlinks the current file", t => {
  const { store, directory } = setup(t); store.saveState(state()); store.saveState(state("第二版"));
  const before = contents(store.paths.state), previous = contents(store.paths.previous);
  const faulty = createStateStore({ directory, fs: { ...fs, renameSync(from, to) { if (to === store.paths.state) throw fail(); return fs.renameSync(from, to); } } });
  assert.equal(faulty.saveState(state("第三版")).ok, false);
  assert.equal(contents(store.paths.state), before); assert.equal(contents(store.paths.previous), previous);
  assert.equal(fs.readdirSync(directory).some(name => name.endsWith(".tmp")), false);
});

test("failed previous backup or corrupt archive prevents replacement of the primary", t => {
  const { store, directory } = setup(t); store.saveState(state()); store.saveState(state("第二版"));
  const before = contents(store.paths.state), previous = contents(store.paths.previous);
  let faulty = createStateStore({ directory, fs: { ...fs, renameSync(from, to) { if (to === store.paths.previous) throw fail(); return fs.renameSync(from, to); } } });
  assert.equal(faulty.saveState(state("第三版")).ok, false);
  assert.equal(contents(store.paths.state), before); assert.equal(contents(store.paths.previous), previous);
  fs.writeFileSync(store.paths.state, "broken");
  faulty = createStateStore({ directory, fs: { ...fs, copyFileSync() { throw fail("ENOSPC"); } } });
  assert.equal(faulty.saveState(state("恢复版")).ok, false); assert.equal(contents(store.paths.state), "broken");
});

test("16 MiB bound uses UTF-8 bytes, large original files are not sent through IPC", t => {
  const { store, directory } = setup(t);
  const fd = fs.openSync(store.paths.state, "w"); fs.ftruncateSync(fd, MAX_PAYLOAD_BYTES + 1); fs.closeSync(fd);
  const result = store.loadState(); assert.equal(result.ok, false); assert.equal(result.raw, undefined);
  fs.writeFileSync(store.paths.state, Buffer.alloc(6 * 1024 * 1024, 0xff));
  assert.equal(store.loadState().raw, undefined, "invalid UTF-8 replacement characters must not exceed the IPC byte limit");
  const permissiveValidator = createStateStore({ directory: path.join(directory, "isolated"), validateState: () => [] });
  assert.equal(permissiveValidator.saveState({ text: "中".repeat(6 * 1024 * 1024) }).ok, false);
  assert.equal(fs.existsSync(permissiveValidator.paths.state), false);
});

test("a directory or symlink in place of schedule.json is not followed or replaced", t => {
  const { store, directory } = setup(t); fs.mkdirSync(store.paths.state);
  assert.equal(store.loadState().ok, false); assert.equal(store.saveState(state()).ok, false); assert.equal(fs.statSync(store.paths.state).isDirectory(), true);
  fs.rmdirSync(store.paths.state); const external = path.join(directory, "separate.json"); fs.writeFileSync(external, "keep-me");
  try { fs.symlinkSync(external, store.paths.state); } catch (error) { if (["EPERM", "EACCES"].includes(error.code)) return; throw error; }
  assert.equal(store.loadState().ok, false); assert.equal(store.saveState(state()).ok, false); assert.equal(contents(external), "keep-me");
});

test("atomic export failure preserves an existing exported file", t => {
  const file = path.join(fixture(t), "backup.json"); fs.writeFileSync(file, "old export");
  assert.throws(() => atomicWriteFileSync(file, Buffer.from("new export"), { ...fs, renameSync() { throw fail(); } }));
  assert.equal(contents(file), "old export");
});

test("export accepts only named text formats, rejects paths, MIME mismatch, executable extensions and oversized UTF-8", () => {
  const request = { content: "{}", fileName: "半刻备份.json", mime: "application/json;charset=utf-8" };
  assert.equal(host.validateExportRequest(request).ok, true);
  for (const fileName of ["../other.json", "C:\\other.json", "x.exe", "CON.json", "x.json:stream", "x.pdf"]) assert.equal(host.validateExportRequest({ ...request, fileName }).ok, false, fileName);
  assert.equal(host.validateExportRequest({ ...request, path: "arbitrary" }).ok, false);
  assert.equal(host.validateExportRequest({ ...request, mime: "text/html" }).ok, false);
  assert.equal(host.validateExportRequest({ ...request, content: "中".repeat(6 * 1024 * 1024) }).ok, false);
});
