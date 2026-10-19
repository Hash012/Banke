"use strict";

// An interactive child of the desktop icon host, above its DefView sibling.
// This never changes Explorer styles, creates wallpaper hosts, or raises a
// top-level window. All native libraries are loaded only on the first operation.
const STYLE = -16, EXSTYLE = -20, OWNER = -8;
const WS_CHILD = 0x40000000, WS_POPUP = 0x80000000;
const WS_CLIPSIBLINGS = 0x04000000, WS_VISIBLE = 0x10000000;
const FRAME_BITS = 0x00c00000 | 0x00040000 | 0x00080000 | 0x00020000 | 0x00010000;
const EX_TOPMOST = 0x8, EX_TRANSPARENT = 0x20, EX_TOOLWINDOW = 0x80;
const EX_APPWINDOW = 0x40000, EX_LAYERED = 0x80000;
const EX_NOREDIRECTIONBITMAP = 0x200000, EX_NOACTIVATE = 0x08000000;
const SWP_NOACTIVATE = 0x10, SWP_FRAMECHANGED = 0x20;
const SWP_SHOWWINDOW = 0x40, SWP_HIDEWINDOW = 0x80, SWP_NOOWNERZORDER = 0x200;

const pointer = value => value == null || BigInt(value) === 0n ? null : BigInt(value);
const sameHandle = (a, b) => pointer(a) === pointer(b);
const unsignedStyle = value => Number(BigInt.asUintN(32, BigInt(value)));

function createDesktopLayer({ platform = process.platform, loadKoffi = () => require("koffi") } = {}) {
  const records = new Map();
  let api;

  function getApi() {
    if (platform !== "win32") throw new Error("桌面固定仅支持 Windows。");
    if (api) return api;
    const koffi = loadKoffi();
    const user = koffi.load("user32.dll"), kernel = koffi.load("kernel32.dll");
    const bind = (lib, name, result, args) => lib.func("__stdcall", name, result, args);
    const next = {
      find: bind(user, "FindWindowExW", "void *", ["void *", "void *", "str16", "str16"]),
      parent: bind(user, "GetParent", "void *", ["void *"]),
      setParent: bind(user, "SetParent", "void *", ["void *", "void *"]),
      isWindow: bind(user, "IsWindow", "int", ["void *"]),
      isVisible: bind(user, "IsWindowVisible", "int", ["void *"]),
      isIconic: bind(user, "IsIconic", "int", ["void *"]),
      show: bind(user, "ShowWindow", "int", ["void *", "int"]),
      process: bind(user, "GetWindowThreadProcessId", "uint32_t", ["void *", "void *"]),
      getLong: bind(user, "GetWindowLongPtrW", "intptr_t", ["void *", "int"]),
      setLong: bind(user, "SetWindowLongPtrW", "intptr_t", ["void *", "int", "intptr_t"]),
      rect: bind(user, "GetWindowRect", "int", ["void *", "void *"]),
      map: bind(user, "MapWindowPoints", "int", ["void *", "void *", "void *", "uint32_t"]),
      move: bind(user, "SetWindowPos", "int", ["void *", "void *", "int", "int", "int", "int", "uint32_t"]),
      getLayered: bind(user, "GetLayeredWindowAttributes", "int", ["void *", "void *", "void *", "void *"]),
      setLayered: bind(user, "SetLayeredWindowAttributes", "int", ["void *", "uint32_t", "uint8_t", "uint32_t"]),
      lastError: bind(kernel, "GetLastError", "uint32_t", []),
      clearError: bind(kernel, "SetLastError", "void", ["uint32_t"])
    };
    // Electron uses DIP rectangles. The caller converts to physical pixels;
    // temporarily use a physical coordinate context for Win32 geometry calls.
    try { next.dpiContext = bind(user, "SetThreadDpiAwarenessContext", "void *", ["void *"]); }
    catch (_) { next.dpiContext = null; }
    api = next;
    return api;
  }

  function handle(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length !== 8 || buffer.readBigUInt64LE() === 0n) {
      throw new Error("桌面窗口句柄无效；需要 Windows x64 窗口。");
    }
    return buffer.readBigUInt64LE();
  }

  function rectangle(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("桌面显示区域无效。");
    const result = {};
    for (const field of ["x", "y", "width", "height"]) {
      const number = value[field];
      if (!Number.isInteger(number) || number < -2147483648 || number > 2147483647) throw new Error("桌面显示区域必须是有效的整数像素。");
      result[field] = number;
    }
    if (result.width <= 0 || result.height <= 0 || result.x + result.width > 2147483647 || result.y + result.height > 2147483647) {
      throw new Error("桌面显示区域大小无效。");
    }
    return result;
  }

  function nativeError(name) { return new Error(name + " 失败（Windows 错误 " + api.lastError() + "）。"); }
  function checked(name, fn, ...args) { if (!fn(...args)) throw nativeError(name); }
  function ambiguous(name, fn, ...args) {
    api.clearError(0);
    const result = fn(...args);
    if ((result == null || BigInt(result) === 0n) && api.lastError() !== 0) throw nativeError(name);
    return result;
  }

  function pid(hwnd) {
    const out = Buffer.alloc(4);
    checked("GetWindowThreadProcessId", api.process, hwnd, out);
    return out.readUInt32LE();
  }

  function ownWindow(hwnd) {
    if (!api.isWindow(hwnd) || pid(hwnd) !== process.pid) throw new Error("原日程窗口已失效，请重新打开日程窗口。");
  }

  function long(hwnd, field) { return ambiguous("GetWindowLongPtrW", api.getLong, hwnd, field); }
  function setLong(hwnd, field, value) { ambiguous("SetWindowLongPtrW", api.setLong, hwnd, field, BigInt(value)); }
  function setParent(hwnd, parent) { ambiguous("SetParent", api.setParent, hwnd, pointer(parent)); }

  function physical(operation) {
    if (!api.dpiContext) return operation();
    const previous = pointer(api.dpiContext(-4n)) || pointer(api.dpiContext(-3n));
    if (!previous) throw nativeError("SetThreadDpiAwarenessContext");
    try { return operation(); }
    finally { api.dpiContext(previous); }
  }

  function readRect(hwnd) {
    return physical(() => {
      const out = Buffer.alloc(16);
      checked("GetWindowRect", api.rect, hwnd, out);
      return rectangle({ x: out.readInt32LE(0), y: out.readInt32LE(4), width: out.readInt32LE(8) - out.readInt32LE(0), height: out.readInt32LE(12) - out.readInt32LE(4) });
    });
  }

  function snapshot(hwnd) {
    const style = unsignedStyle(long(hwnd, STYLE)), exStyle = unsignedStyle(long(hwnd, EXSTYLE));
    const parent = style & WS_CHILD ? pointer(api.parent(hwnd)) : null;
    const owner = style & WS_CHILD ? null : pointer(long(hwnd, OWNER));
    let layered = null;
    if (exStyle & EX_LAYERED) {
      const color = Buffer.alloc(4), alpha = Buffer.alloc(1), flags = Buffer.alloc(4);
      if (api.getLayered(hwnd, color, alpha, flags)) layered = { color: color.readUInt32LE(), alpha: alpha[0], flags: flags.readUInt32LE() };
    }
    return { style, exStyle, parent, owner, rect: readRect(hwnd), layered };
  }

  function desktopHost() {
    // Both the old top-level WorkerW tree and the newer Progman child tree
    // expose DefView as a direct child of the host we need. Do not spawn or
    // reorder wallpaper WorkerW windows and do not change any Explorer styles.
    for (const className of ["Progman", "WorkerW"]) {
      let previous = null;
      const seen = new Set();
      for (let count = 0; count < 256; count++) {
        const host = pointer(api.find(null, previous, className, null));
        if (!host || seen.has(host)) break;
        seen.add(host); previous = host;
        const view = pointer(api.find(host, null, "SHELLDLL_DefView", null));
        if (!view || !api.isWindow(host) || !api.isWindow(view) || !sameHandle(api.parent(view), host)) continue;
        const hostPid = pid(host);
        if (hostPid !== pid(view)) continue;
        return { host, view, pid: hostPid, layered: !!(unsignedStyle(long(host, EXSTYLE)) & EX_NOREDIRECTIONBITMAP) };
      }
    }
    throw new Error("暂时未找到 Windows 桌面，请等待桌面加载后重试。");
  }

  function hostValid(desktop) {
    return !!desktop && api.isWindow(desktop.host) && api.isWindow(desktop.view) &&
      sameHandle(api.parent(desktop.view), desktop.host) && pid(desktop.host) === desktop.pid && pid(desktop.view) === desktop.pid;
  }

  function attached(hwnd, record) {
    if (!record || !hostValid(record.desktop) || !sameHandle(api.parent(hwnd), record.desktop.host)) return false;
    const style = unsignedStyle(long(hwnd, STYLE)), exStyle = unsignedStyle(long(hwnd, EXSTYLE));
    return !!(style & WS_CHILD) && !(style & WS_POPUP) && !(exStyle & EX_TOPMOST) &&
      (!record.desktop.layered || !!(exStyle & EX_LAYERED));
  }

  function place(hwnd, parent, rect, order = null, extraFlags = 0) {
    physical(() => {
      const point = Buffer.alloc(8);
      point.writeInt32LE(rect.x, 0); point.writeInt32LE(rect.y, 4);
      if (parent) ambiguous("MapWindowPoints", api.map, null, parent, point, 1);
      checked("SetWindowPos", api.move, hwnd, order, point.readInt32LE(0), point.readInt32LE(4), rect.width, rect.height,
        SWP_NOACTIVATE | SWP_NOOWNERZORDER | extraFlags);
    });
  }

  function visible(hwnd) {
    return !!(unsignedStyle(long(hwnd, STYLE)) & WS_VISIBLE) && !!api.isVisible(hwnd) && !api.isIconic(hwnd);
  }

  function showAndPlace(hwnd, parent, rect, extraFlags = 0) {
    // SWP_SHOWWINDOW alone does not restore an iconic window. SW_SHOWNOACTIVATE
    // restores it without activating Explorer or another top-level application.
    // ShowWindow's result is the old visibility, not a success/error result.
    if (api.isIconic(hwnd)) api.show(hwnd, 4);
    place(hwnd, parent, rect, null, extraFlags | SWP_SHOWWINDOW);
    if (!visible(hwnd)) throw new Error("Windows 尚未显示桌面日程窗口，请重试。");
  }

  function restore(hwnd, saved) {
    ownWindow(hwnd);
    if (saved.parent && !api.isWindow(saved.parent)) throw new Error("原父窗口已失效，暂时无法完整恢复窗口。");
    if (saved.parent) {
      setLong(hwnd, STYLE, saved.style);
      setParent(hwnd, saved.parent);
    } else {
      setParent(hwnd, null);
      setLong(hwnd, STYLE, saved.style);
      setLong(hwnd, OWNER, saved.owner && api.isWindow(saved.owner) ? saved.owner : 0n);
    }
    setLong(hwnd, EXSTYLE, saved.exStyle);
    if (saved.layered) checked("SetLayeredWindowAttributes", api.setLayered, hwnd, saved.layered.color, saved.layered.alpha, saved.layered.flags);
    const order = saved.parent ? null : saved.exStyle & EX_TOPMOST ? -1n : -2n;
    place(hwnd, saved.parent, saved.rect, order, SWP_FRAMECHANGED | (saved.style & WS_VISIBLE ? SWP_SHOWWINDOW : SWP_HIDEWINDOW));
    if (!sameHandle(saved.parent, unsignedStyle(long(hwnd, STYLE)) & WS_CHILD ? api.parent(hwnd) : null) ||
        unsignedStyle(long(hwnd, STYLE)) !== saved.style || unsignedStyle(long(hwnd, EXSTYLE)) !== saved.exStyle) {
      throw new Error("Windows 未完整恢复窗口样式，请重新打开日程窗口。");
    }
  }

  function result(ok, isAttached, hwnd, error) {
    // Connection health and restoration obligations are deliberately separate:
    // a stale host or failed rollback can leave an untrusted native child behind.
    // The controller must detach successfully before using Electron window APIs.
    const value = { ok, attached: isAttached, needsDetach: records.has(hwnd) };
    if (error) value.error = error;
    return value;
  }

  function failure(error, rollbackError, hwnd) {
    const message = error instanceof Error ? error.message : "桌面固定暂时未能完成。";
    let isAttached = false;
    try { isAttached = !!(api && hwnd && api.isWindow(hwnd) && pid(hwnd) === process.pid && attached(hwnd, records.get(hwnd)) && visible(hwnd)); }
    catch (_) { /* An uncertain native state must not claim a healthy attachment. */ }
    return result(false, isAttached, hwnd, rollbackError ? message + " 恢复窗口时也出现问题，请从托盘退出后重新打开半刻。" : message);
  }

  function attach(buffer, value) {
    let hwnd, before, existing, changed = false;
    try {
      hwnd = handle(buffer); const rect = rectangle(value); getApi(); ownWindow(hwnd);
      existing = records.get(hwnd);
      if (attached(hwnd, existing)) return position(buffer, rect);
      const desktop = desktopHost();
      before = snapshot(hwnd);
      if (desktop.layered && before.exStyle & EX_LAYERED && !before.layered) throw new Error("当前透明窗口模式无法安全固定到桌面，请先恢复不透明窗口。");
      const original = existing ? existing.original : before;
      const style = ((before.style & ~WS_POPUP & ~FRAME_BITS) | WS_CHILD | WS_CLIPSIBLINGS) >>> 0;
      let exStyle = ((before.exStyle & ~EX_TOPMOST & ~EX_APPWINDOW & ~EX_NOACTIVATE & ~EX_TRANSPARENT) | EX_TOOLWINDOW) >>> 0;
      if (desktop.layered) exStyle = (exStyle | EX_LAYERED) >>> 0;
      changed = true;
      setLong(hwnd, STYLE, style); setLong(hwnd, EXSTYLE, exStyle);
      if (desktop.layered) checked("SetLayeredWindowAttributes", api.setLayered, hwnd, 0, 255, 2);
      setParent(hwnd, desktop.host);
      // HWND_TOP refers only to siblings after verified child parenting.
      if (!sameHandle(api.parent(hwnd), desktop.host) || !(unsignedStyle(long(hwnd, STYLE)) & WS_CHILD)) throw new Error("Windows 未完成桌面窗口嵌入。");
      showAndPlace(hwnd, desktop.host, rect, SWP_FRAMECHANGED);
      const record = { original, desktop };
      if (!attached(hwnd, record)) throw new Error("桌面窗口状态已变化，请重试。");
      records.set(hwnd, record);
      return result(true, true, hwnd);
    } catch (error) {
      let rollbackError;
      if (changed && before) {
        try { restore(hwnd, before); }
        catch (restoreError) { rollbackError = restoreError; records.set(hwnd, existing || { original: before, desktop: null }); }
      }
      return failure(error, rollbackError, hwnd);
    }
  }

  function position(buffer, value) {
    let hwnd, before, record;
    try {
      hwnd = handle(buffer); const rect = rectangle(value); getApi(); ownWindow(hwnd);
      record = records.get(hwnd);
      if (!attached(hwnd, record)) throw new Error("桌面宿主已变化，请重新固定日程窗口。");
      before = snapshot(hwnd);
      showAndPlace(hwnd, record.desktop.host, rect);
      if (!attached(hwnd, record)) throw new Error("桌面窗口状态已变化，请重新固定。");
      return result(true, true, hwnd);
    } catch (error) {
      let rollbackError;
      if (before && record) {
        try {
          if (!hostValid(record.desktop)) throw new Error("Windows 桌面宿主已失效。");
          restore(hwnd, before);
        }
        catch (restoreError) { rollbackError = restoreError; }
      }
      return failure(error, rollbackError, hwnd);
    }
  }

  function detach(buffer) {
    let hwnd, before;
    try {
      hwnd = handle(buffer); getApi();
      const record = records.get(hwnd);
      if (!record) return result(true, false, hwnd);
      ownWindow(hwnd); before = snapshot(hwnd);
      restore(hwnd, record.original);
      records.delete(hwnd);
      return result(true, false, hwnd);
    } catch (error) {
      let rollbackError;
      if (before) {
        try { restore(hwnd, before); }
        catch (restoreError) { rollbackError = restoreError; }
      }
      return failure(error, rollbackError, hwnd);
    }
  }

  function check(buffer) {
    let hwnd;
    try {
      hwnd = handle(buffer); getApi();
      if (!api.isWindow(hwnd) || pid(hwnd) !== process.pid) {
        records.delete(hwnd);
        return { ...result(false, false, hwnd, "原日程窗口已失效，请重新打开日程窗口。"), windowValid: false };
      }
      return result(true, !!attached(hwnd, records.get(hwnd)) && visible(hwnd), hwnd);
    } catch (error) { return failure(error, undefined, hwnd); }
  }

  function hide(buffer) {
    try {
      const hwnd = handle(buffer); getApi(); ownWindow(hwnd);
      api.show(hwnd, 0); // SW_HIDE; never detach or mutate Explorer itself.
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
  }
  function forget(buffer) { try { records.delete(handle(buffer)); } catch (_) {} }
  return Object.freeze({ attach, position, detach, check, hide, forget });
}

module.exports = { createDesktopLayer };
