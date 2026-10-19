"use strict";

const { rightHalfBounds, clampWindowBounds } = require("./desktop-preferences.cjs");

function createDesktopController(options) {
  const { app, screen, layer, preferences, getWindow } = options;
  const platform = options.platform || process.platform;
  const timers = options.timers || { setTimeout, clearTimeout, setInterval, clearInterval };
  const supported = platform === "win32" && !!screen && !!layer;
  let loaded;
  try { loaded = preferences.load(); }
  catch (_) { loaded = { ok: false, error: "暂时无法读取窗口设置。" }; }
  let prefs = loaded.ok ? loaded.state : { version: 1, mode: "window", displayId: null, normalBounds: null };
  if (!supported) prefs = { ...prefs, mode: "window" };
  let mode = "window", connected = false, disposed = false, applying = false;
  let nativeWindow = null, needsDetach = false;
  let lastError = loaded.ok ? "" : loaded.error;
  let recoveryTimer = null, pollTimer = null, boundsTimer = null, pendingBounds = null;
  let recoveryAttempts = 0, recreateRequested = false;
  const boundWindows = new WeakMap();
  const canStartAtLogin = supported && app.isPackaged === true && typeof app.setLoginItemSettings === "function";

  function call(window, method, ...args) {
    if (window && typeof window[method] === "function") return window[method](...args);
  }
  function validWindow() {
    const window = getWindow();
    return window && !call(window, "isDestroyed") ? window : null;
  }
  function readBounds(window) {
    try {
      const value = call(window, "getNormalBounds") || call(window, "getBounds");
      if (!value || !["x", "y", "width", "height"].every(key => Number.isSafeInteger(value[key])) || value.width <= 0 || value.height <= 0) return null;
      return { x: value.x, y: value.y, width: value.width, height: value.height };
    } catch (_) { return null; }
  }
  function usableDisplay(display) {
    const area = display && display.workArea;
    return area && ["x", "y", "width", "height"].every(key => Number.isSafeInteger(area[key])) && area.width > 0 && area.height > 0;
  }
  function displays() {
    try { return (screen && typeof screen.getAllDisplays === "function" ? screen.getAllDisplays() : []).filter(usableDisplay); }
    catch (_) { return []; }
  }
  function targetDisplay() {
    const all = displays();
    const selected = all.find(item => item.id === prefs.displayId);
    if (selected) return selected;
    try {
      const primary = screen && typeof screen.getPrimaryDisplay === "function" ? screen.getPrimaryDisplay() : null;
      if (usableDisplay(primary)) return all.find(item => item.id === primary.id) || primary;
    } catch (_) { /* A removed primary can briefly disappear during a display event. */ }
    return all[0] || { id: 0, label: "主屏幕", workArea: { x: 0, y: 0, width: 1600, height: 1000 } };
  }
  function loginState() {
    if (!canStartAtLogin || typeof app.getLoginItemSettings !== "function") return false;
    try {
      // Electron 44's legacy openAtLogin field looks up AppUserModelID, not
      // our custom entry name. Read the matching user-scoped launch item.
      // The Windows helper parses this query path as a command line, so quote
      // it to keep user/profile paths containing spaces intact.
      const settings = app.getLoginItemSettings({ path: '"' + app.getPath("exe") + '"', args: [] });
      return Array.isArray(settings.launchItems) && settings.launchItems.some(item =>
        item.name === "BankeCommunity" && item.scope === "user" && item.enabled === true &&
        Array.isArray(item.args) && item.args.length === 0);
    } catch (_) { return false; }
  }
  function status() {
    const display = targetDisplay();
    return {
      ok: true, mode, connected, supported,
      displayLabel: display.label || "显示器 " + display.id,
      startAtLogin: loginState(), canStartAtLogin,
      ...(lastError ? { error: lastError } : {})
    };
  }
  function publish() {
    const current = status();
    if (!disposed && typeof options.onStatusChange === "function") {
      try { options.onStatusChange(current); } catch (_) { /* A closing renderer must not interrupt native cleanup. */ }
    }
    return current;
  }
  function fail(message) {
    lastError = message || "窗口操作暂时未能完成。";
    // Always broadcast the actual mode as a valid status. Only the returned
    // operation result is a failure; renderers must still receive the update.
    const current = publish();
    return { ...current, ok: false, error: lastError };
  }
  function savePreferences() {
    try {
      const result = preferences.save(prefs);
      if (!result.ok) lastError = "窗口设置暂未保存：" + result.error;
      return result.ok;
    } catch (_) { lastError = "窗口设置暂未保存，原设置文件已保留。"; return false; }
  }
  function physicalRect(dipRect) {
    if (!screen || typeof screen.dipToScreenRect !== "function") throw new Error("无法读取屏幕缩放信息。");
    // Electron handles each display's origin and DPI. Never multiply a virtual
    // desktop coordinate by a single screen's scale factor.
    return screen.dipToScreenRect(null, dipRect);
  }
  function handle(window) {
    if (!supported || !window || typeof window.getNativeWindowHandle !== "function") throw new Error("当前窗口没有可用的 Windows 原生句柄。");
    return window.getNativeWindowHandle();
  }
  function adoptNativeResult(window, result, fallbackDirty = needsDetach) {
    needsDetach = typeof result.needsDetach === "boolean" ? result.needsDetach : fallbackDirty;
    nativeWindow = needsDetach ? window : null;
    connected = result.attached === true;
    // Failed rollback can retain native child styles with no healthy Explorer
    // parent. It is unsafe to advertise this as a normal editor or dialog owner.
    mode = needsDetach || connected ? "desktop" : "window";
  }
  function normalBounds(window) {
    const saved = prefs.normalBounds || readBounds(window) || { x: 80, y: 60, width: 1440, height: 940 };
    const best = displays().find(item => saved.x >= item.workArea.x && saved.x < item.workArea.x + item.workArea.width &&
      saved.y >= item.workArea.y && saved.y < item.workArea.y + item.workArea.height) || targetDisplay();
    return clampWindowBounds(saved, best.workArea);
  }
  function configureNormal(window, activate = true) {
    const bounds = normalBounds(window);
    call(window, "setAlwaysOnTop", false);
    call(window, "setMinimumSize", Math.min(840, bounds.width), Math.min(640, bounds.height));
    call(window, "setResizable", true); call(window, "setMovable", true);
    call(window, "setMinimizable", true); call(window, "setMaximizable", true);
    call(window, "setFullScreenable", true); call(window, "setSkipTaskbar", false);
    call(window, "setHasShadow", true); call(window, "setAutoHideMenuBar", true);
    call(window, "setMenuBarVisibility", false); call(window, "setBounds", bounds);
    if (activate) call(window, "show"); else call(window, "showInactive");
  }
  function clearBoundsTimer() {
    if (boundsTimer !== null) timers.clearTimeout(boundsTimer);
    boundsTimer = null;
  }
  function flushBounds(notify = true) {
    clearBoundsTimer();
    if (!pendingBounds) return;
    prefs = { ...prefs, normalBounds: pendingBounds }; pendingBounds = null;
    if (!savePreferences() && notify) publish();
  }
  function cancelRecovery() {
    if (recoveryTimer !== null) timers.clearTimeout(recoveryTimer);
    recoveryTimer = null; recoveryAttempts = 0; recreateRequested = false;
  }
  function queueRecovery(recreate = false) {
    if (disposed || !supported || prefs.mode !== "desktop") return;
    recreateRequested ||= recreate;
    if (recoveryTimer !== null) return;
    if (recoveryAttempts >= 12) {
      lastError = "暂时无法重新连接 Windows 桌面。可从托盘返回普通窗口，或稍后重新固定到桌面。";
      publish(); return;
    }
    recoveryTimer = timers.setTimeout(() => {
      recoveryTimer = null;
      if (disposed || prefs.mode !== "desktop") return;
      recoveryAttempts++;
      const window = validWindow();
      if (!window) {
        recreateRequested = false;
        try { if (typeof options.onRecreate === "function") options.onRecreate(); }
        catch (error) { lastError = "日程窗口暂时无法重新打开：" + error.message; publish(); }
        // A failed create or a window that never reaches ready-to-show consumes
        // a bounded retry too. A successful attach cancels the pending retry.
        if (!disposed && prefs.mode === "desktop" && !connected) queueRecovery(!validWindow());
      } else if (boundWindows.has(window) && !boundWindows.get(window).ready) {
        queueRecovery(false);
      } else {
        recreateRequested = false;
        const result = enterDesktop(window, { remember: false, passive: true });
        if (!result.ok) queueRecovery(false);
      }
    }, recreateRequested ? 750 : 2500);
    if (recoveryTimer && typeof recoveryTimer.unref === "function") recoveryTimer.unref();
  }
  function detachNative(window) {
    if (!needsDetach) return { ok: true, attached: false, needsDetach: false };
    if (nativeWindow && nativeWindow !== window) return { ok: false, attached: connected, needsDetach: true, error: "上一个日程窗口尚未恢复，暂时无法切换。" };
    try {
      const result = layer.detach(handle(window));
      adoptNativeResult(window, result, !(result.ok && !result.needsDetach));
      if (!result.ok || result.needsDetach) return { ...result, ok: false };
      needsDetach = false; nativeWindow = null; connected = false; mode = "window";
      return result;
    } catch (error) { return { ok: false, attached: connected, needsDetach, error: error.message }; }
  }
  function enterDesktop(window, { remember = true, passive = false, capture = false } = {}) {
    if (disposed) return fail("软件正在退出。");
    if (!supported) return fail("桌面常驻模式目前适用于 Windows。");
    if (!window) return fail("日程窗口正在恢复，请稍后重试。");
    if (applying) return fail("正在切换窗口模式，请稍后重试。");
    applying = true;
    try {
      lastError = "";
      if (capture || prefs.normalBounds === null) {
        const bounds = !needsDetach && readBounds(window);
        if (bounds) prefs = { ...prefs, normalBounds: bounds };
      }
      // Every recovery re-attach must restore the native snapshot before any
      // Electron style setter can mutate the child-window configuration.
      const detached = detachNative(window);
      if (!detached.ok) return fail(detached.error || "暂时无法恢复窗口样式，桌面连接仍待恢复。");
      if (!passive) {
        if (call(window, "isMinimized")) call(window, "restore");
        if (call(window, "isMaximized")) call(window, "unmaximize");
        if (call(window, "isFullScreen")) call(window, "setFullScreen", false);
      }
      call(window, "setAlwaysOnTop", false);
      call(window, "setMinimumSize", 0, 0);
      call(window, "setResizable", false); call(window, "setMovable", false);
      call(window, "setMinimizable", false); call(window, "setMaximizable", false);
      call(window, "setFullScreenable", false); call(window, "setSkipTaskbar", true);
      call(window, "setHasShadow", false); call(window, "setAutoHideMenuBar", true);
      call(window, "setMenuBarVisibility", false);
      const display = targetDisplay();
      const dip = rightHalfBounds(display.workArea);
      call(window, "setBounds", dip);
      const windowHandle = handle(window), nativeRect = physicalRect(dip);
      // If the adapter itself throws unexpectedly, its mutation progress is
      // unknown. Require a successful native cleanup before any style fallback.
      needsDetach = true; nativeWindow = window; mode = "desktop"; connected = false;
      const result = layer.attach(windowHandle, nativeRect);
      adoptNativeResult(window, result, result.ok === true);
      if (!result.ok || !connected) {
        if (!needsDetach) configureNormal(window, false);
        return fail(result.error || "无法连接 Windows 桌面层，当前窗口正在恢复。");
      }
      mode = "desktop"; connected = true;
      prefs = { ...prefs, mode: "desktop", displayId: display.id };
      cancelRecovery();
      if (remember) savePreferences();
      // Only the adapter displays/positions the child with NOACTIVATE flags.
      return publish();
    } catch (error) {
      let cleanup = { ok: true };
      if (needsDetach) cleanup = detachNative(window);
      if (cleanup.ok && !needsDetach) {
        mode = "window"; connected = false;
        try { configureNormal(window, false); } catch (_) { /* Keep the original operation error. */ }
      }
      return fail("桌面模式暂未启用：" + error.message);
    } finally { applying = false; }
  }
  function leaveDesktop(window, remember = true, focus = true) {
    if (disposed) return fail("软件正在退出。");
    if (applying) return fail("正在切换窗口模式，请稍后重试。");
    cancelRecovery();
    if (!window) {
      needsDetach = false; nativeWindow = null; connected = false; mode = "window";
      prefs = { ...prefs, mode: "window" }; lastError = "";
      if (remember) savePreferences();
      try { if (typeof options.onRecreate === "function") options.onRecreate(); }
      catch (error) { return fail("日程窗口暂时无法重新打开：" + error.message); }
      return publish();
    }
    applying = true;
    try {
      // Ordinary windows, unsupported platforms and test hosts never need a
      // Win32 call merely to restore/show their editor.
      const result = detachNative(window);
      if (!result.ok) return fail(result.error || "暂时无法返回普通窗口，请稍后重试。");
      mode = "window"; connected = false; lastError = "";
      prefs = { ...prefs, mode: "window" };
      if (focus && call(window, "isMinimized")) call(window, "restore");
      configureNormal(window, focus);
      if (focus) call(window, "focus");
      if (remember) savePreferences();
      return publish();
    } catch (error) { return fail("暂时无法返回普通窗口：" + error.message); }
    finally { applying = false; }
  }
  function setMode(enabled) {
    if (typeof enabled !== "boolean") return fail("窗口模式参数无效。");
    if (disposed) return fail("软件正在退出。");
    if (!enabled) return leaveDesktop(validWindow());
    if (!supported) return fail("桌面常驻模式目前适用于 Windows。");
    const capture = mode === "window" && !needsDetach && prefs.mode === "window";
    flushBounds(); cancelRecovery();
    prefs = { ...prefs, mode: "desktop" };
    const result = enterDesktop(validWindow(), { capture });
    if (!result.ok) queueRecovery(!validWindow());
    return result;
  }
  function reposition() {
    if (disposed || applying || mode !== "desktop") return;
    const window = validWindow();
    if (!window) { windowClosed(); return; }
    try {
      const display = targetDisplay();
      const result = layer.position(handle(window), physicalRect(rightHalfBounds(display.workArea)));
      adoptNativeResult(window, result);
      if (!result.ok || !connected) {
        lastError = result.error || "桌面连接正在恢复。"; publish(); queueRecovery();
      } else {
        lastError = ""; prefs = { ...prefs, displayId: display.id };
        savePreferences(); publish();
      }
    } catch (error) { connected = false; lastError = error.message; publish(); queueRecovery(); }
  }
  function nextDisplay() {
    if (disposed) return fail("软件正在退出。");
    if (mode !== "desktop") return fail("请先固定到桌面，再切换显示器。");
    const all = displays();
    if (all.length < 2) return fail("当前只有一块显示器。");
    const previous = prefs.displayId;
    const index = all.findIndex(item => item.id === targetDisplay().id);
    prefs = { ...prefs, displayId: all[(index + 1) % all.length].id };
    const window = validWindow();
    if (!window) { prefs = { ...prefs, displayId: previous }; return fail("日程窗口正在恢复。"); }
    try {
      const result = layer.position(handle(window), physicalRect(rightHalfBounds(targetDisplay().workArea)));
      adoptNativeResult(window, result);
      if (!result.ok || !connected) {
        prefs = { ...prefs, displayId: previous };
        if (!connected) queueRecovery();
        return fail(result.error || "无法移动到下一块显示器。");
      }
      lastError = ""; savePreferences(); return publish();
    } catch (error) {
      prefs = { ...prefs, displayId: previous };
      return fail(error.message);
    }
  }
  function setStartAtLogin(enabled) {
    if (disposed) return fail("软件正在退出。");
    if (typeof enabled !== "boolean" || !canStartAtLogin) return fail("请在已安装的 Windows 版本中设置登录启动。");
    try {
      // This write is reachable only through the user's explicit toggle.
      app.setLoginItemSettings({ openAtLogin: enabled, enabled, name: "BankeCommunity", path: app.getPath("exe"), args: [] });
      if (loginState() !== enabled) return fail("Windows 尚未应用登录启动设置，请在系统的启动应用设置中核对。");
      lastError = ""; return publish();
    } catch (_) { return fail("未能更改 Windows 登录启动设置。"); }
  }
  function rememberBounds(window) {
    if (mode !== "window" || prefs.mode !== "window" || needsDetach || applying || disposed || window !== validWindow() ||
        call(window, "isMinimized") || call(window, "isMaximized")) return;
    const bounds = readBounds(window);
    if (!bounds) return;
    // Capture before debounce so a subsequent close can flush the latest data.
    pendingBounds = bounds;
    clearBoundsTimer();
    boundsTimer = timers.setTimeout(() => {
      boundsTimer = null;
      if (!disposed && mode === "window" && prefs.mode === "window" && !needsDetach) flushBounds();
    }, 350);
    if (boundsTimer && typeof boundsTimer.unref === "function") boundsTimer.unref();
  }
  function bindWindow(window) {
    if (disposed || boundWindows.has(window)) return;
    const binding = { ready: false }; boundWindows.set(window, binding);
    window.on("move", () => rememberBounds(window));
    window.on("resize", () => rememberBounds(window));
    for (const name of ["will-move", "will-resize"]) window.on(name, event => {
      if (!disposed && window === validWindow() && mode === "desktop" && !applying) event.preventDefault();
    });
    window.on("minimize", () => {
      if (!disposed && window === validWindow() && mode === "desktop" && connected && !applying) reposition();
    });
    window.once("ready-to-show", () => {
      binding.ready = true;
      if (disposed || window !== validWindow()) return;
      if (prefs.mode === "desktop") {
        const result = enterDesktop(window, { remember: false, passive: true });
        if (!result.ok) queueRecovery();
      } else {
        applying = true;
        try { configureNormal(window); publish(); }
        catch (error) { fail("日程窗口暂时无法显示：" + error.message); }
        finally { applying = false; }
      }
    });
  }
  function windowClosed() {
    if (disposed) return false;
    if (prefs.mode === "window") flushBounds();
    needsDetach = false; nativeWindow = null; connected = false; mode = "window";
    if (prefs.mode !== "desktop") return false;
    lastError = "Windows 桌面连接中断，正在恢复日程窗口。";
    publish(); queueRecovery(true); return true;
  }
  function checkConnection() {
    if (disposed || applying || !needsDetach) return;
    const window = validWindow();
    if (!window) { windowClosed(); return; }
    try {
      const result = layer.check(handle(window));
      adoptNativeResult(window, result);
      if (!result.ok || !connected) {
        lastError = result.error || "Windows 桌面正在恢复，日程已保存。";
        publish();
        if (result.windowValid === false) {
          // The HWND was verified as invalid or owned by another process.
          // Drop only its unusable Electron wrapper; never activate the desktop.
          call(window, "destroy");
          queueRecovery(true);
        } else queueRecovery();
      }
    } catch (_) { connected = false; lastError = "Windows 桌面连接暂时无法核对，正在重试。"; publish(); queueRecovery(); }
  }
  if (supported) {
    pollTimer = timers.setInterval(checkConnection, 2500);
    if (pollTimer && typeof pollTimer.unref === "function") pollTimer.unref();
    if (typeof screen.on === "function") for (const name of ["display-added", "display-removed", "display-metrics-changed"]) screen.on(name, reposition);
  }
  function dispose() {
    if (disposed) return;
    if (mode === "window" && prefs.mode === "window" && !needsDetach) {
      const latest = readBounds(validWindow());
      if (latest) pendingBounds = latest;
      flushBounds(false);
    }
    disposed = true; cancelRecovery(); clearBoundsTimer(); pendingBounds = null;
    if (pollTimer !== null) timers.clearInterval(pollTimer);
    pollTimer = null;
    if (supported && typeof screen.removeListener === "function") {
      for (const name of ["display-added", "display-removed", "display-metrics-changed"]) screen.removeListener(name, reposition);
    }
    const window = validWindow();
    if (window && needsDetach) detachNative(window);
  }
  return Object.freeze({ status, setMode, nextDisplay, setStartAtLogin, bindWindow, windowClosed,
    wantsDesktop: () => !disposed && prefs.mode === "desktop", isDesktop: () => mode === "desktop",
    showEditor: () => leaveDesktop(validWindow(), true, true), reposition, dispose });
}

module.exports = { createDesktopController };
